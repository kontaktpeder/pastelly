import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VACATION_PREFS,
  collectVacationPeriods,
  collectVacationPeriodsForMember,
  eventIsVacationLayer,
  eventIsWorkdayLayer,
  eventMirrorsVacationPeriod,
  filterEventsForVacationLayer,
  formatVacationDay,
  formatVacationRange,
  itineraryLabels,
  mergeCountdownVacation,
  mergeVacationPrefsFromSources,
  parseVacationPrefs,
  periodStartingTomorrow,
  prefsAfterManualOff,
  prefsAfterManualOn,
  pruneExpiredPrefs,
  resolveVacationMode,
  shouldMuteEventNotification,
  vacationStayProgress,
  type VacationCountdownLike,
} from './vacationMode';
import { shouldMuteWorkdayPush } from '../../supabase/functions/_shared/personalVacation';

const mallorca: VacationCountdownLike = {
  id: 'mallorca',
  title: 'Mallorca',
  target_at: '2026-10-03T06:00:00.000Z', // 08:00 Madrid
  ends_at: '2026-10-15T21:59:59.000Z', // 23:59 Madrid (CEST)
  use_vacation_mode: true,
  timezone: 'Europe/Madrid',
  status: 'active',
};

const tenerife: VacationCountdownLike = {
  id: 'tenerife',
  title: 'Tenerife',
  target_at: '2026-10-10T07:00:00.000Z',
  ends_at: '2026-10-20T22:59:59.000Z',
  use_vacation_mode: true,
  timezone: 'Atlantic/Canary',
  status: 'active',
};

const dateNight: VacationCountdownLike = {
  id: 'date',
  title: 'Date night',
  target_at: '2026-11-01T17:00:00.000Z',
  use_vacation_mode: false,
  status: 'active',
};

function withJoins(
  countdown: VacationCountdownLike,
  participants: { member_id: string; status: string }[],
): VacationCountdownLike {
  return { ...countdown, countdown_participants: participants };
}

describe('vacation periods', () => {
  it('ignores countdowns that do not opt into vacation mode', () => {
    const periods = collectVacationPeriods([mallorca, dateNight], 'Europe/Oslo');
    expect(periods).toHaveLength(1);
    expect(periods[0]!.id).toBe('mallorca');
  });

  it('treats missing ends_at as the end of the start day in the destination zone', () => {
    const periods = collectVacationPeriods(
      [{ ...mallorca, ends_at: null }],
      'Europe/Oslo',
    );
    expect(periods).toHaveLength(1);
    const end = periods[0]!.endAt;
    expect(end.getTime()).toBeGreaterThan(new Date(mallorca.target_at).getTime());
  });
});

describe('resolveVacationMode', () => {
  const periods = collectVacationPeriods([mallorca, tenerife], 'Europe/Oslo');

  it('is off before any period starts', () => {
    const snap = resolveVacationMode(
      DEFAULT_VACATION_PREFS,
      periods,
      new Date('2026-09-20T10:00:00.000Z'),
    );
    expect(snap.active).toBe(false);
    expect(snap.source).toBe('off');
    expect(snap.upcomingPeriod?.title).toBe('Mallorca');
  });

  it('turns on automatically at the destination start time', () => {
    const snap = resolveVacationMode(
      DEFAULT_VACATION_PREFS,
      periods,
      new Date('2026-10-03T06:00:00.000Z'),
    );
    expect(snap.active).toBe(true);
    expect(snap.source).toBe('auto');
    expect(snap.activePeriods.map((p) => p.id)).toEqual(['mallorca']);
  });

  it('stays on while any overlapping holiday is active', () => {
    const snap = resolveVacationMode(
      DEFAULT_VACATION_PREFS,
      periods,
      new Date('2026-10-12T12:00:00.000Z'),
    );
    expect(snap.active).toBe(true);
    expect(snap.activePeriods.map((p) => p.id).sort()).toEqual(['mallorca', 'tenerife']);
  });

  it('turns off after the last overlapping holiday ends', () => {
    const snap = resolveVacationMode(
      DEFAULT_VACATION_PREFS,
      periods,
      new Date('2026-10-21T00:00:00.000Z'),
    );
    expect(snap.active).toBe(false);
    expect(snap.activePeriods).toHaveLength(0);
  });

  it('respects a manual override until the current periods end', () => {
    const during = new Date('2026-10-05T12:00:00.000Z');
    const offPrefs = prefsAfterManualOff(DEFAULT_VACATION_PREFS, periods, during);
    const snap = resolveVacationMode(offPrefs, periods, during);
    expect(snap.active).toBe(false);
    expect(snap.autoWouldBeActive).toBe(true);
    expect(snap.autoSuppressed).toBe(true);

    const stillSuppressed = resolveVacationMode(
      offPrefs,
      periods,
      new Date('2026-10-18T12:00:00.000Z'),
    );
    expect(stillSuppressed.active).toBe(false);
    expect(stillSuppressed.autoWouldBeActive).toBe(true);

    const nextHoliday = collectVacationPeriods(
      [
        mallorca,
        tenerife,
        {
          id: 'december',
          title: 'December sun',
          target_at: '2026-12-01T08:00:00.000Z',
          ends_at: '2026-12-10T22:00:00.000Z',
          use_vacation_mode: true,
          timezone: 'Europe/Madrid',
          status: 'active',
        },
      ],
      'Europe/Oslo',
    );
    const december = resolveVacationMode(
      offPrefs,
      nextHoliday,
      new Date('2026-12-02T12:00:00.000Z'),
    );
    expect(december.active).toBe(true);
    expect(december.source).toBe('auto');
  });

  it('manual “just now” stays on until the user turns it off', () => {
    const prefs = prefsAfterManualOn(DEFAULT_VACATION_PREFS, {
      until: null,
      source: 'now',
    });
    const snap = resolveVacationMode(prefs, [], new Date('2026-09-20T10:00:00.000Z'));
    expect(snap.active).toBe(true);
    expect(snap.source).toBe('manual');
  });

  it('manual until-date expires after that timestamp', () => {
    const prefs = prefsAfterManualOn(DEFAULT_VACATION_PREFS, {
      until: '2026-09-22T21:59:59.000Z',
      source: 'until_date',
    });
    expect(resolveVacationMode(prefs, [], new Date('2026-09-22T20:00:00.000Z')).active).toBe(true);
    expect(resolveVacationMode(prefs, [], new Date('2026-09-22T22:00:00.000Z')).active).toBe(false);
  });

  it('flags a holiday that starts tomorrow in the destination zone', () => {
    const periodsOnly = collectVacationPeriods([mallorca], 'Europe/Oslo');
    const tomorrow = periodStartingTomorrow(
      periodsOnly,
      new Date('2026-10-02T12:00:00.000Z'),
    );
    expect(tomorrow?.id).toBe('mallorca');
    expect(
      periodStartingTomorrow(periodsOnly, new Date('2026-10-01T12:00:00.000Z')),
    ).toBeNull();
  });
});

describe('prefs helpers', () => {
  it('parses unknown json as defaults', () => {
    expect(parseVacationPrefs(null)).toEqual(DEFAULT_VACATION_PREFS);
    expect(parseVacationPrefs({ hideWorkdayEvents: false }).hideWorkdayEvents).toBe(false);
    expect(parseVacationPrefs({ muteHiddenNotifications: true }).muteHiddenNotifications).toBe(
      true,
    );
  });

  it('prunes expired manual and suppression windows', () => {
    const pruned = pruneExpiredPrefs(
      {
        ...DEFAULT_VACATION_PREFS,
        manualOn: true,
        manualUntil: '2026-09-01T00:00:00.000Z',
        autoSuppressedUntil: '2026-09-01T00:00:00.000Z',
      },
      new Date('2026-09-20T00:00:00.000Z'),
    );
    expect(pruned.manualOn).toBe(false);
    expect(pruned.autoSuppressedUntil).toBeNull();
  });
});

describe('event layer', () => {
  const work = { category: 'work' };
  const beach = { category: 'beach' };
  const overlay = { category: 'other', isOverlay: true, sourceHouseholdKind: 'work' };

  it('hides vacation-layer events when vacation mode is off', () => {
    const travel = { category: 'travel' };
    const events = [work, beach, travel];
    expect(
      filterEventsForVacationLayer(events, {
        vacationActive: false,
        revealHidden: false,
        hideWorkdayEvents: true,
      }),
    ).toEqual([work, travel]);
    expect(eventIsVacationLayer(beach)).toBe(true);
    expect(eventIsVacationLayer(travel)).toBe(false);
  });

  it('hides weekday and work-overlay events by default', () => {
    const filtered = filterEventsForVacationLayer([work, beach, overlay], {
      vacationActive: true,
      revealHidden: false,
      hideWorkdayEvents: true,
    });
    expect(filtered).toEqual([beach]);
  });

  it('keeps weekday events when the user reveals the rest', () => {
    const events = [work, beach];
    expect(
      filterEventsForVacationLayer(events, {
        vacationActive: true,
        revealHidden: true,
        hideWorkdayEvents: true,
      }),
    ).toEqual(events);
  });

  it('hides events outside the vacation start and end', () => {
    const inTrip = { category: 'beach', event_date: '2026-10-05' };
    const afterTrip = { category: 'beach', event_date: '2026-10-20' };
    const filtered = filterEventsForVacationLayer([inTrip, afterTrip], {
      vacationActive: true,
      revealHidden: true,
      hideWorkdayEvents: true,
      dateRange: { start: '2026-10-03', end: '2026-10-15' },
    });
    expect(filtered).toEqual([inTrip]);
  });

  it('does not mute notifications unless the user opted in', () => {
    expect(shouldMuteEventNotification(work, { vacationActive: true, muteHiddenNotifications: false })).toBe(
      false,
    );
    expect(shouldMuteEventNotification(work, { vacationActive: true, muteHiddenNotifications: true })).toBe(
      true,
    );
    expect(shouldMuteEventNotification(beach, { vacationActive: true, muteHiddenNotifications: true })).toBe(
      false,
    );
  });

  it('treats work overlays as weekday layer', () => {
    expect(eventIsWorkdayLayer(overlay)).toBe(true);
    expect(eventIsWorkdayLayer(beach)).toBe(false);
  });
});

describe('invitation is not participation', () => {
  const duringMallorca = new Date('2026-10-05T12:00:00.000Z');
  const invitedOnly = withJoins(mallorca, [
    { member_id: 'alice', status: 'joined' },
    { member_id: 'bob', status: 'invited' },
  ]);

  it('does not auto-on for a member who is only invited', () => {
    const periods = collectVacationPeriodsForMember([invitedOnly], 'bob', 'Europe/Oslo');
    expect(periods).toHaveLength(0);
    const snap = resolveVacationMode(DEFAULT_VACATION_PREFS, periods, duringMallorca);
    expect(snap.active).toBe(false);
    expect(snap.source).toBe('off');
  });

  it('auto-on for the member who has joined', () => {
    const periods = collectVacationPeriodsForMember([invitedOnly], 'alice', 'Europe/Oslo');
    expect(periods).toHaveLength(1);
    const snap = resolveVacationMode(DEFAULT_VACATION_PREFS, periods, duringMallorca);
    expect(snap.active).toBe(true);
    expect(snap.source).toBe('auto');
    expect(snap.activePeriods.map((p) => p.id)).toEqual(['mallorca']);
  });
});

describe('two members with different holidays', () => {
  const mallorcaTrip = withJoins(mallorca, [
    { member_id: 'alice', status: 'joined' },
    { member_id: 'bob', status: 'invited' },
  ]);
  const tenerifeTrip = withJoins(tenerife, [
    { member_id: 'bob', status: 'joined' },
    { member_id: 'alice', status: 'invited' },
  ]);
  const duringOverlap = new Date('2026-10-12T12:00:00.000Z');
  const mutePrefs = { ...DEFAULT_VACATION_PREFS, muteHiddenNotifications: true };

  it('activates only the trip each member has joined', () => {
    const alicePeriods = collectVacationPeriodsForMember(
      [mallorcaTrip, tenerifeTrip],
      'alice',
      'Europe/Oslo',
    );
    const bobPeriods = collectVacationPeriodsForMember(
      [mallorcaTrip, tenerifeTrip],
      'bob',
      'Europe/Oslo',
    );
    const alice = resolveVacationMode(DEFAULT_VACATION_PREFS, alicePeriods, duringOverlap);
    const bob = resolveVacationMode(DEFAULT_VACATION_PREFS, bobPeriods, duringOverlap);
    expect(alice.activePeriods.map((p) => p.id)).toEqual(['mallorca']);
    expect(bob.activePeriods.map((p) => p.id)).toEqual(['tenerife']);
  });

  it('mutes weekday pushes per member, not for the household', () => {
    const holidays = [mallorcaTrip, tenerifeTrip];
    const now = duringOverlap.getTime();
    expect(shouldMuteWorkdayPush('alice', mutePrefs, holidays, now)).toBe(true);
    expect(shouldMuteWorkdayPush('bob', mutePrefs, holidays, now)).toBe(true);

    const beforeTenerife = new Date('2026-10-05T12:00:00.000Z').getTime();
    expect(shouldMuteWorkdayPush('alice', mutePrefs, holidays, beforeTenerife)).toBe(true);
    expect(shouldMuteWorkdayPush('bob', mutePrefs, holidays, beforeTenerife)).toBe(false);

    const bobNoMute = { ...DEFAULT_VACATION_PREFS, muteHiddenNotifications: false };
    expect(shouldMuteWorkdayPush('bob', bobNoMute, holidays, now)).toBe(false);
  });

  it('does not mute a member who opted in but never joined the active trip', () => {
    const holidays = [mallorcaTrip];
    expect(
      shouldMuteWorkdayPush('bob', mutePrefs, holidays, duringOverlap.getTime()),
    ).toBe(false);
  });
});

describe('prefs merge: server is source of truth after migration', () => {
  const serverMute = {
    ...DEFAULT_VACATION_PREFS,
    muteHiddenNotifications: true,
    updatedAt: '2026-09-18T08:00:00.000Z',
  };

  it('uses the database row on a new device with local defaults', () => {
    const merged = mergeVacationPrefsFromSources({
      dbRaw: serverMute,
      dbColumnPresent: true,
      localRaw: null,
    });
    expect(merged.prefs.muteHiddenNotifications).toBe(true);
    expect(merged.syncStatus).toBe('synced');
  });

  it('does not let unsynced local defaults override muteHiddenNotifications', () => {
    const merged = mergeVacationPrefsFromSources({
      dbRaw: serverMute,
      dbColumnPresent: true,
      localRaw: { ...DEFAULT_VACATION_PREFS, muteHiddenNotifications: false },
    });
    expect(merged.prefs.muteHiddenNotifications).toBe(true);
    expect(merged.syncStatus).toBe('synced');
  });

  it('keeps a pending local write that is newer than the server', () => {
    const merged = mergeVacationPrefsFromSources({
      dbRaw: serverMute,
      dbColumnPresent: true,
      localRaw: {
        ...DEFAULT_VACATION_PREFS,
        muteHiddenNotifications: false,
        updatedAt: '2026-09-18T09:00:00.000Z',
        _syncStatus: 'pending',
      },
    });
    expect(merged.prefs.muteHiddenNotifications).toBe(false);
    expect(merged.syncStatus).toBe('pending');
  });

  it('falls back to local only when the database column is missing', () => {
    const merged = mergeVacationPrefsFromSources({
      dbRaw: undefined,
      dbColumnPresent: false,
      localRaw: { muteHiddenNotifications: true },
    });
    expect(merged.prefs.muteHiddenNotifications).toBe(true);
  });
});

describe('countdown local overlay', () => {
  it('does not let local storage win after the server has vacation columns', () => {
    const merged = mergeCountdownVacation(
      { ...mallorca, use_vacation_mode: false, ends_at: null, timezone: null },
      { ends_at: mallorca.ends_at!, use_vacation_mode: true, timezone: 'Europe/Madrid' },
    );
    expect(merged.use_vacation_mode).toBe(false);
    expect(merged.ends_at).toBeNull();
  });

  it('uses local overlay only before migration (column missing)', () => {
    const fromServer: VacationCountdownLike = {
      id: 'mallorca',
      title: 'Mallorca',
      target_at: mallorca.target_at,
      status: 'active',
    };
    const merged = mergeCountdownVacation(fromServer, {
      ends_at: mallorca.ends_at!,
      use_vacation_mode: true,
      timezone: 'Europe/Madrid',
    });
    expect(merged.use_vacation_mode).toBe(true);
    expect(merged.timezone).toBe('Europe/Madrid');
  });
});

describe('presentation helpers', () => {
  it('builds a relaxed itinerary', () => {
    expect(itineraryLabels(['Frokost', 'Strand', 'Middag'])).toBe('Frokost → Strand → Middag');
  });

  it('formats a same-month Norwegian range', () => {
    const label = formatVacationRange(
      new Date('2026-10-03T06:00:00.000Z'),
      new Date('2026-10-15T21:59:59.000Z'),
      'nb-NO',
      'Europe/Madrid',
    );
    expect(label).not.toMatch(/\d\.\./);
    expect(label).toMatch(/3\./);
    expect(label).toMatch(/15\./);
    expect(label.toLowerCase()).toMatch(/oktober/);
  });

  it('formats a short Norwegian week range without double periods', () => {
    const label = formatVacationRange(
      new Date(2026, 8, 14),
      new Date(2026, 8, 20),
      'nb-NO',
      undefined,
      'short',
    );
    expect(label).not.toMatch(/\d\.\./);
    expect(label).toMatch(/^14\.–20\. /);
    expect(label.toLowerCase()).toMatch(/sep/);
  });

  it('formats the week heading as a long date interval', () => {
    expect(formatVacationRange(new Date(2026, 8, 14), new Date(2026, 8, 20), 'nb-NO')).toBe(
      '14.–20. september',
    );
  });

  it('formats a single Norwegian day', () => {
    expect(formatVacationDay(new Date(2026, 8, 20), 'nb-NO')).toBe('20. september');
  });
});

describe('vacation stay progress', () => {
  const periods = collectVacationPeriods([mallorca], 'Europe/Oslo');

  it('counts the selected civil day inside the trip', () => {
    const period = periods[0]!;
    expect(vacationStayProgress(period, new Date('2026-10-03T12:00:00.000Z'))).toEqual({ day: 1, of: 13 });
    expect(vacationStayProgress(period, new Date('2026-10-07T12:00:00.000Z'))).toEqual({ day: 5, of: 13 });
  });

  it('is null before the trip', () => {
    expect(vacationStayProgress(periods[0]!, new Date('2026-10-01T12:00:00.000Z'))).toBeNull();
  });
});

describe('eventMirrorsVacationPeriod', () => {
  const periods = collectVacationPeriods([mallorca], 'Europe/Oslo');

  it('hides the untimed trip-sized event with the same title', () => {
    expect(
      eventMirrorsVacationPeriod(
        { title: 'Mallorca', event_date: '2026-10-03', end_date: '2026-10-15' },
        periods,
      ),
    ).toBe(true);
  });

  it('keeps a timed flight or hotel with another title', () => {
    expect(
      eventMirrorsVacationPeriod(
        { title: 'Innsjekking', event_date: '2026-10-03', end_date: '2026-10-10', start_time: '15:00' },
        periods,
      ),
    ).toBe(false);
    expect(
      eventMirrorsVacationPeriod(
        { title: 'Hotel Playa', event_date: '2026-10-03', end_date: '2026-10-15' },
        periods,
      ),
    ).toBe(false);
  });
});
