import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { CountdownWithParticipants } from '@/hooks/useCountdowns';
import { useLocale } from '@/hooks/useLocale';
import {
  collectVacationPeriodsForMember,
  DEFAULT_VACATION_PREFS,
  filterEventsForVacationLayer,
  loadLocalJson,
  mergeCountdownVacation,
  mergeVacationPrefsFromSources,
  parseStoredCountdownVacation,
  periodStorageKey,
  prefsAfterManualOff,
  prefsAfterManualOn,
  prefsForLocalStore,
  prefsStorageKey,
  pruneExpiredPrefs,
  resolveVacationMode,
  saveLocalJson,
  stampPrefsUpdatedAt,
  vacationVisibleYmdRange,
  warnStorageKey,
  type ManualVacationSource,
  type StoredCountdownVacation,
  type VacationCountdownLike,
  type VacationEventLike,
  type VacationModePrefs,
  type VacationModeSnapshot,
  type VacationPeriod,
  type VacationPrefsSyncStatus,
} from '@/lib/vacationMode';
import { DEFAULT_TIME_ZONE, endOfZonedDayMs, resolveTimeZone } from '@/lib/timeZone';

export type VacationModeContextValue = {
  enabledForCalendar: boolean;
  prefs: VacationModePrefs;
  snapshot: VacationModeSnapshot;
  periods: VacationPeriod[];
  revealHidden: boolean;
  setRevealHidden: (next: boolean) => void;
  timeZone: string;
  turnOn: (input: {
    until?: string | null;
    source: ManualVacationSource;
    countdownId?: string | null;
  }) => void;
  turnOff: () => void;
  setMuteHiddenNotifications: (next: boolean) => void;
  filterEvents: <T extends VacationEventLike>(events: T[]) => T[];
  mergedCountdowns: CountdownWithParticipants[];
  prefsSyncStatus: VacationPrefsSyncStatus;
  visibleDateRange: { start: string; end: string } | null;
};

const VacationModeContext = createContext<VacationModeContextValue | null>(null);

function readLocalPeriod(countdownId: string): StoredCountdownVacation | null {
  return parseStoredCountdownVacation(loadLocalJson(periodStorageKey(countdownId)));
}

export function persistCountdownVacationLocal(
  countdownId: string,
  fields: StoredCountdownVacation,
): void {
  saveLocalJson(periodStorageKey(countdownId), fields);
}

function memberHasVacationColumn(member: HouseholdMember | null | undefined): boolean {
  return !!member && Object.prototype.hasOwnProperty.call(member, 'vacation_mode');
}

function mergeMemberPrefs(member: HouseholdMember | null | undefined): {
  prefs: VacationModePrefs;
  syncStatus: VacationPrefsSyncStatus;
} {
  if (!member) {
    return { prefs: DEFAULT_VACATION_PREFS, syncStatus: 'synced' };
  }
  return mergeVacationPrefsFromSources({
    dbRaw: (member as { vacation_mode?: unknown }).vacation_mode,
    dbColumnPresent: memberHasVacationColumn(member),
    localRaw: loadLocalJson(prefsStorageKey(member.id)),
  });
}

export function VacationModeProvider({
  member,
  calendarKind,
  countdowns,
  children,
}: {
  member: HouseholdMember | null | undefined;
  calendarKind: string;
  countdowns: CountdownWithParticipants[];
  children: ReactNode;
}) {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const enabledForCalendar = calendarKind !== 'work';
  const memberId = member?.id;
  const memberTz = resolveTimeZone(member?.timezone || DEFAULT_TIME_ZONE);

  const memberVacationRaw = (member as { vacation_mode?: unknown } | undefined)?.vacation_mode;
  const initialMerged = mergeMemberPrefs(member);
  const [prefs, setPrefs] = useState<VacationModePrefs>(() => initialMerged.prefs);
  const [prefsSyncStatus, setPrefsSyncStatus] = useState<VacationPrefsSyncStatus>(
    () => initialMerged.syncStatus,
  );
  const [now, setNow] = useState(() => new Date());
  const [revealHidden, setRevealHidden] = useState(false);
  const warnedRef = useRef<string | null>(null);

  useEffect(() => {
    const merged = mergeMemberPrefs(member);
    setPrefs(merged.prefs);
    setPrefsSyncStatus(merged.syncStatus);
  }, [member, memberVacationRaw]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const mergedCountdowns = useMemo(() => {
    return countdowns.map((cd) => mergeCountdownVacation(cd, readLocalPeriod(cd.id)));
  }, [countdowns]);

  const periods = useMemo(
    () =>
      collectVacationPeriodsForMember(
        mergedCountdowns as VacationCountdownLike[],
        memberId,
        memberTz,
      ),
    [mergedCountdowns, memberId, memberTz],
  );

  const pruned = useMemo(() => pruneExpiredPrefs(prefs, now), [prefs, now]);
  const snapshot = useMemo(
    () => resolveVacationMode(enabledForCalendar ? pruned : DEFAULT_VACATION_PREFS, enabledForCalendar ? periods : [], now),
    [enabledForCalendar, pruned, periods, now],
  );

  useEffect(() => {
    if (
      pruned.manualOn !== prefs.manualOn ||
      pruned.autoSuppressedUntil !== prefs.autoSuppressedUntil
    ) {
      setPrefs(pruned);
    }
  }, [pruned, prefs.manualOn, prefs.autoSuppressedUntil]);

  const persist = useMutation({
    mutationFn: async (next: VacationModePrefs) => {
      if (!memberId) return;
      saveLocalJson(prefsStorageKey(memberId), prefsForLocalStore(next, 'pending'));
      const { error } = await supabase
        .from('household_members')
        .update({ vacation_mode: next as never })
        .eq('id', memberId);
      if (error) {
        // Column may not exist until the migration is applied — local cache still works.
        console.warn('[vacation] prefs persist failed', error.message);
        setPrefsSyncStatus('pending');
        return;
      }
      saveLocalJson(prefsStorageKey(memberId), prefsForLocalStore(next, 'synced'));
      setPrefsSyncStatus('synced');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['currentMember'] });
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
    },
  });

  const commitPrefs = useCallback(
    (next: VacationModePrefs) => {
      const stamped = stampPrefsUpdatedAt(next);
      setPrefs(stamped);
      setPrefsSyncStatus('pending');
      persist.mutate(stamped);
    },
    [persist],
  );

  const turnOn = useCallback(
    (input: { until?: string | null; source: ManualVacationSource; countdownId?: string | null }) => {
      commitPrefs(
        prefsAfterManualOn(pruned, {
          until: input.until ?? null,
          source: input.source,
          countdownId: input.countdownId,
        }),
      );
      setRevealHidden(false);
    },
    [commitPrefs, pruned],
  );

  const turnOff = useCallback(() => {
    commitPrefs(prefsAfterManualOff(pruned, periods, now));
    setRevealHidden(false);
  }, [commitPrefs, pruned, periods, now]);

  const setMuteHiddenNotifications = useCallback(
    (next: boolean) => {
      commitPrefs({ ...pruned, muteHiddenNotifications: next });
    },
    [commitPrefs, pruned],
  );

  const filterEvents = useCallback(
    <T extends VacationEventLike>(events: T[]) =>
      filterEventsForVacationLayer(events, {
        vacationActive: snapshot.active,
        revealHidden,
        hideWorkdayEvents: pruned.hideWorkdayEvents,
        dateRange: vacationVisibleYmdRange(snapshot, pruned, now, memberTz),
      }),
    [snapshot, revealHidden, pruned, now, memberTz],
  );

  const visibleDateRange = useMemo(
    () => vacationVisibleYmdRange(snapshot, pruned, now, memberTz),
    [snapshot, pruned, now, memberTz],
  );

  useEffect(() => {
    if (!enabledForCalendar) return;
    const upcoming = snapshot.startsTomorrow;
    if (!upcoming) return;
    const dateStr = upcoming.startAt.toISOString().slice(0, 10);
    const key = warnStorageKey(upcoming.id, dateStr);
    if (warnedRef.current === key) return;
    if (loadLocalJson(key)) return;
    warnedRef.current = key;
    saveLocalJson(key, true);
    toast(t('vacation.startsTomorrowNamed', { title: upcoming.title }), {
      description: t('vacation.layerHint'),
      duration: 8000,
    });
  }, [enabledForCalendar, snapshot.startsTomorrow, t, locale]);

  const value = useMemo<VacationModeContextValue>(
    () => ({
      enabledForCalendar,
      prefs: pruned,
      snapshot,
      periods,
      revealHidden,
      setRevealHidden,
      timeZone: memberTz,
      turnOn,
      turnOff,
      setMuteHiddenNotifications,
      filterEvents,
      mergedCountdowns,
      prefsSyncStatus,
      visibleDateRange,
    }),
    [
      enabledForCalendar,
      pruned,
      snapshot,
      periods,
      revealHidden,
      memberTz,
      turnOn,
      turnOff,
      setMuteHiddenNotifications,
      filterEvents,
      mergedCountdowns,
      prefsSyncStatus,
      visibleDateRange,
    ],
  );

  return <VacationModeContext.Provider value={value}>{children}</VacationModeContext.Provider>;
}

export function useVacationMode(): VacationModeContextValue {
  const ctx = useContext(VacationModeContext);
  if (!ctx) {
    return {
      enabledForCalendar: false,
      prefs: DEFAULT_VACATION_PREFS,
      snapshot: resolveVacationMode(DEFAULT_VACATION_PREFS, []),
      periods: [],
      revealHidden: false,
      setRevealHidden: () => undefined,
      timeZone: DEFAULT_TIME_ZONE,
      turnOn: () => undefined,
      turnOff: () => undefined,
      setMuteHiddenNotifications: () => undefined,
      filterEvents: (events) => events,
      mergedCountdowns: [],
      prefsSyncStatus: 'synced',
      visibleDateRange: null,
    };
  }
  return ctx;
}

export function endOfLocalDateIso(date: Date, timeZone: string): string {
  return new Date(endOfZonedDayMs(date, timeZone)).toISOString();
}
