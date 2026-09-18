import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VACATION_PREFS,
  collectVacationPeriods,
  eventIsWorkdayLayer,
  filterEventsForVacationLayer,
  formatVacationRange,
  itineraryLabels,
  parseVacationPrefs,
  periodStartingTomorrow,
  prefsAfterManualOff,
  prefsAfterManualOn,
  pruneExpiredPrefs,
  resolveVacationMode,
  shouldMuteEventNotification,
  type VacationCountdownLike,
} from './vacationMode';

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

  it('never drops events when vacation mode is off', () => {
    const events = [work, beach];
    expect(
      filterEventsForVacationLayer(events, {
        vacationActive: false,
        revealHidden: false,
        hideWorkdayEvents: true,
      }),
    ).toEqual(events);
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
    expect(label).toMatch(/3/);
    expect(label).toMatch(/15/);
    expect(label.toLowerCase()).toMatch(/oktober/);
  });
});
