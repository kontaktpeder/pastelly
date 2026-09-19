import { resolveTimeZone, getZonedParts, calendarDaysBetweenZoned, endOfZonedDayMs } from '@/lib/timeZone';

export type ManualVacationSource = 'now' | 'until_date' | 'until_workday' | 'countdown';

export type VacationPrefsSyncStatus = 'synced' | 'pending';

export type VacationModePrefs = {
  version: 1;
  manualOn: boolean;
  /** ISO timestamp; null = until the user turns it off */
  manualUntil: string | null;
  manualSource: ManualVacationSource | null;
  manualCountdownId: string | null;
  /**
   * When the user turns vacation mode off during an automatic period,
   * auto stays suppressed until this ISO time (end of currently active periods).
   */
  autoSuppressedUntil: string | null;
  /** Opt-in: pause notifications from hidden weekday categories. Default off. */
  muteHiddenNotifications: boolean;
  /** Default true: hide weekday events (still available via “show the rest”). */
  hideWorkdayEvents: boolean;
  /** ISO time of the last local/server write. Used to merge pending local edits. */
  updatedAt: string | null;
};

export const DEFAULT_VACATION_PREFS: VacationModePrefs = {
  version: 1,
  manualOn: false,
  manualUntil: null,
  manualSource: null,
  manualCountdownId: null,
  autoSuppressedUntil: null,
  muteHiddenNotifications: false,
  hideWorkdayEvents: true,
  updatedAt: null,
};

export type VacationParticipantLike = {
  member_id: string;
  status: string | null;
};

export type VacationCountdownLike = {
  id: string;
  title: string;
  target_at: string;
  status?: string | null;
  ends_at?: string | null;
  use_vacation_mode?: boolean | null;
  timezone?: string | null;
  countdown_participants?: VacationParticipantLike[] | null;
};

export type VacationPeriod = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
};

export type VacationModeSource = 'manual' | 'auto' | 'off';

export type VacationModeSnapshot = {
  active: boolean;
  source: VacationModeSource;
  autoWouldBeActive: boolean;
  autoSuppressed: boolean;
  activePeriods: VacationPeriod[];
  upcomingPeriod: VacationPeriod | null;
  startsTomorrow: VacationPeriod | null;
  headlineTitle: string | null;
};

/** Job / school / deadline-style categories dimmed or hidden in vacation mode. */
export const WORKDAY_CATEGORIES = new Set([
  'work',
  'meeting',
  'school',
  'important',
  'deadline',
  'production',
  'development',
  'admin',
  'client',
  'focus',
]);

export const VACATION_QUICK_CATEGORIES = [
  'beach',
  'breakfast',
  'lunch',
  'dinner',
  'hotel',
  'travel',
  'outing',
  'activity',
  'relaxation',
  'shopping',
  'practical',
] as const;

export const VACATION_EMPTY_DAY_SUGGESTIONS = ['breakfast', 'beach', 'dinner'] as const;

export const VACATION_CATEGORY_OPTIONS = [...VACATION_QUICK_CATEGORIES, 'other'] as const;

export const VACATION_PREFS_STORAGE_PREFIX = 'pastelly_vacation_prefs:';
export const VACATION_PERIOD_STORAGE_PREFIX = 'pastelly_countdown_vacation:';
export const VACATION_WARN_STORAGE_PREFIX = 'pastelly_vacation_warn:';

export function isWorkdayCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return WORKDAY_CATEGORIES.has(category);
}

export function isVacationCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return (VACATION_CATEGORY_OPTIONS as readonly string[]).includes(category);
}

export function parseVacationPrefs(raw: unknown): VacationModePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VACATION_PREFS };
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    manualOn: o.manualOn === true,
    manualUntil: typeof o.manualUntil === 'string' && o.manualUntil ? o.manualUntil : null,
    manualSource:
      o.manualSource === 'now' ||
      o.manualSource === 'until_date' ||
      o.manualSource === 'until_workday' ||
      o.manualSource === 'countdown'
        ? o.manualSource
        : null,
    manualCountdownId:
      typeof o.manualCountdownId === 'string' && o.manualCountdownId ? o.manualCountdownId : null,
    autoSuppressedUntil:
      typeof o.autoSuppressedUntil === 'string' && o.autoSuppressedUntil
        ? o.autoSuppressedUntil
        : null,
    muteHiddenNotifications: o.muteHiddenNotifications === true,
    hideWorkdayEvents: o.hideWorkdayEvents !== false,
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : null,
  };
}

export type StoredPrefsMeta = {
  syncStatus: VacationPrefsSyncStatus;
  updatedAt: string | null;
};

/** Local-only envelope field — never persist `_syncStatus` to the database. */
export function readStoredPrefsMeta(raw: unknown): StoredPrefsMeta {
  if (!raw || typeof raw !== 'object') {
    return { syncStatus: 'synced', updatedAt: null };
  }
  const o = raw as Record<string, unknown>;
  const updatedAt = typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : null;
  if (o._syncStatus === 'pending') {
    return { syncStatus: 'pending', updatedAt };
  }
  if (o._syncStatus === 'synced') {
    return { syncStatus: 'synced', updatedAt };
  }
  // Legacy local cache (no sync flag): keep an in-flight manual session, but never
  // let default mute/hide values beat a newer server row.
  const hasLiveSession =
    o.manualOn === true ||
    (typeof o.autoSuppressedUntil === 'string' && !!o.autoSuppressedUntil);
  if (hasLiveSession) {
    return { syncStatus: 'pending', updatedAt: updatedAt ?? '9999-01-01T00:00:00.000Z' };
  }
  return { syncStatus: 'synced', updatedAt };
}

export function stampPrefsUpdatedAt(
  prefs: VacationModePrefs,
  now: Date = new Date(),
): VacationModePrefs {
  return { ...prefs, updatedAt: now.toISOString() };
}

export function prefsForLocalStore(
  prefs: VacationModePrefs,
  syncStatus: VacationPrefsSyncStatus,
): VacationModePrefs & { _syncStatus: VacationPrefsSyncStatus } {
  return { ...prefs, _syncStatus: syncStatus };
}

/**
 * After migration, the server row is source of truth.
 * Local cache wins only when it is marked pending (or a legacy in-flight session)
 * and is newer than the database value.
 * Before migration (`dbColumnPresent=false`), local is a development fallback.
 */
export function mergeVacationPrefsFromSources(input: {
  dbRaw: unknown;
  dbColumnPresent: boolean;
  localRaw: unknown;
}): { prefs: VacationModePrefs; syncStatus: VacationPrefsSyncStatus } {
  const localPrefs = parseVacationPrefs(input.localRaw);
  const localMeta = readStoredPrefsMeta(input.localRaw);

  if (!input.dbColumnPresent) {
    return {
      prefs: localPrefs,
      syncStatus: localMeta.syncStatus,
    };
  }

  const dbPrefs = parseVacationPrefs(input.dbRaw);
  const dbUpdated = dbPrefs.updatedAt ? Date.parse(dbPrefs.updatedAt) : 0;
  const localUpdated = localMeta.updatedAt ? Date.parse(localMeta.updatedAt) : 0;
  const pendingNewer =
    localMeta.syncStatus === 'pending' &&
    Number.isFinite(localUpdated) &&
    localUpdated > dbUpdated;

  if (pendingNewer) {
    return { prefs: localPrefs, syncStatus: 'pending' };
  }
  return { prefs: dbPrefs, syncStatus: 'synced' };
}

export type StoredCountdownVacation = {
  ends_at: string | null;
  use_vacation_mode: boolean;
  timezone: string | null;
};

export function parseStoredCountdownVacation(raw: unknown): StoredCountdownVacation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    ends_at: typeof o.ends_at === 'string' && o.ends_at ? o.ends_at : null,
    use_vacation_mode: o.use_vacation_mode === true,
    timezone: typeof o.timezone === 'string' && o.timezone ? o.timezone : null,
  };
}

export function mergeCountdownVacation<T extends VacationCountdownLike>(
  countdown: T,
  stored: StoredCountdownVacation | null,
): T {
  const serverHasColumn = countdown.use_vacation_mode !== undefined;
  if (serverHasColumn || !stored) {
    return {
      ...countdown,
      ends_at: countdown.ends_at ?? null,
      use_vacation_mode: countdown.use_vacation_mode ?? false,
      timezone: countdown.timezone ?? null,
    };
  }
  return {
    ...countdown,
    ends_at: stored.ends_at,
    use_vacation_mode: stored.use_vacation_mode,
    timezone: stored.timezone,
  };
}

export function memberHasJoinedCountdown(
  countdown: { countdown_participants?: VacationParticipantLike[] | null },
  memberId: string | null | undefined,
): boolean {
  if (!memberId) return false;
  return (countdown.countdown_participants ?? []).some(
    (p) => p.member_id === memberId && p.status === 'joined',
  );
}

/** Invitation is not participation — auto vacation only after the member has joined. */
export function collectVacationPeriodsForMember(
  countdowns: VacationCountdownLike[],
  memberId: string | null | undefined,
  fallbackTimeZone: string,
): VacationPeriod[] {
  if (!memberId) return [];
  return collectVacationPeriods(
    countdowns.filter((cd) => memberHasJoinedCountdown(cd, memberId)),
    fallbackTimeZone,
  );
}

function defaultEndAt(start: Date, timeZone: string): Date {
  return new Date(endOfZonedDayMs(start, timeZone));
}

export function periodFromCountdown(
  countdown: VacationCountdownLike,
  fallbackTimeZone: string,
): VacationPeriod | null {
  if (countdown.status && countdown.status !== 'active' && countdown.status !== 'done') {
    return null;
  }
  if (!countdown.use_vacation_mode) return null;
  const timeZone = resolveTimeZone(countdown.timezone || fallbackTimeZone);
  const startAt = new Date(countdown.target_at);
  if (Number.isNaN(startAt.getTime())) return null;
  const endAt = countdown.ends_at
    ? new Date(countdown.ends_at)
    : defaultEndAt(startAt, timeZone);
  if (Number.isNaN(endAt.getTime()) || endAt.getTime() <= startAt.getTime()) return null;
  return {
    id: countdown.id,
    title: countdown.title,
    startAt,
    endAt,
    timeZone,
  };
}

export function collectVacationPeriods(
  countdowns: VacationCountdownLike[],
  fallbackTimeZone: string,
): VacationPeriod[] {
  const periods: VacationPeriod[] = [];
  for (const cd of countdowns) {
    const period = periodFromCountdown(cd, fallbackTimeZone);
    if (period) periods.push(period);
  }
  periods.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return periods;
}

export function periodsActiveAt(periods: VacationPeriod[], now: Date): VacationPeriod[] {
  const t = now.getTime();
  return periods.filter((p) => t >= p.startAt.getTime() && t <= p.endAt.getTime());
}

export function nextUpcomingPeriod(
  periods: VacationPeriod[],
  now: Date,
): VacationPeriod | null {
  const t = now.getTime();
  return periods.find((p) => p.startAt.getTime() > t) ?? null;
}

/** A period whose start is the next local calendar day in its timezone. */
export function periodStartingTomorrow(
  periods: VacationPeriod[],
  now: Date,
): VacationPeriod | null {
  for (const p of periods) {
    const days = calendarDaysBetweenZoned(now, p.startAt, p.timeZone);
    if (days === 1) return p;
  }
  return null;
}

function isManualActive(prefs: VacationModePrefs, now: Date): boolean {
  if (!prefs.manualOn) return false;
  if (!prefs.manualUntil) return true;
  const until = new Date(prefs.manualUntil).getTime();
  if (Number.isNaN(until)) return true;
  return now.getTime() < until;
}

function isAutoSuppressed(prefs: VacationModePrefs, now: Date): boolean {
  if (!prefs.autoSuppressedUntil) return false;
  const until = new Date(prefs.autoSuppressedUntil).getTime();
  if (Number.isNaN(until)) return false;
  return now.getTime() < until;
}

export function resolveVacationMode(
  prefs: VacationModePrefs,
  periods: VacationPeriod[],
  now: Date = new Date(),
): VacationModeSnapshot {
  const activePeriods = periodsActiveAt(periods, now);
  const autoWouldBeActive = activePeriods.length > 0;
  const autoSuppressed = autoWouldBeActive && isAutoSuppressed(prefs, now);
  const manual = isManualActive(prefs, now);
  const auto = autoWouldBeActive && !autoSuppressed;
  const active = manual || auto;
  const source: VacationModeSource = manual ? 'manual' : auto ? 'auto' : 'off';
  const upcomingPeriod = nextUpcomingPeriod(periods, now);
  const startsTomorrow = periodStartingTomorrow(periods, now);
  const headlineTitle =
    activePeriods[0]?.title ??
    (manual && prefs.manualCountdownId
      ? periods.find((p) => p.id === prefs.manualCountdownId)?.title ?? null
      : null) ??
    upcomingPeriod?.title ??
    null;

  return {
    active,
    source,
    autoWouldBeActive,
    autoSuppressed,
    activePeriods,
    upcomingPeriod,
    startsTomorrow,
    headlineTitle,
  };
}

/** Union end of currently active holidays plus any that overlap that block. */
export function contiguousActiveEndMs(periods: VacationPeriod[], now: Date): number {
  const active = periodsActiveAt(periods, now);
  if (active.length === 0) return 0;
  let start = Math.min(...active.map((p) => p.startAt.getTime()));
  let end = Math.max(...active.map((p) => p.endAt.getTime()));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of periods) {
      if (p.endAt.getTime() < start || p.startAt.getTime() > end) continue;
      const nextStart = Math.min(start, p.startAt.getTime());
      const nextEnd = Math.max(end, p.endAt.getTime());
      if (nextStart !== start || nextEnd !== end) {
        start = nextStart;
        end = nextEnd;
        changed = true;
      }
    }
  }
  return end;
}

/** Turning off mid-holiday: suppress auto until the overlapping holiday block ends. */
export function prefsAfterManualOff(
  prefs: VacationModePrefs,
  periods: VacationPeriod[],
  now: Date,
): VacationModePrefs {
  const maxEnd = contiguousActiveEndMs(periods, now);
  return {
    ...prefs,
    manualOn: false,
    manualUntil: null,
    manualSource: null,
    manualCountdownId: null,
    autoSuppressedUntil: maxEnd > 0 ? new Date(maxEnd).toISOString() : null,
  };
}

export function prefsAfterManualOn(
  prefs: VacationModePrefs,
  input: {
    until: string | null;
    source: ManualVacationSource;
    countdownId?: string | null;
  },
): VacationModePrefs {
  return {
    ...prefs,
    manualOn: true,
    manualUntil: input.until,
    manualSource: input.source,
    manualCountdownId: input.countdownId ?? null,
    autoSuppressedUntil: null,
  };
}

export function pruneExpiredPrefs(
  prefs: VacationModePrefs,
  now: Date = new Date(),
): VacationModePrefs {
  let next = prefs;
  if (prefs.manualOn && prefs.manualUntil) {
    const until = new Date(prefs.manualUntil).getTime();
    if (!Number.isNaN(until) && now.getTime() >= until) {
      next = {
        ...next,
        manualOn: false,
        manualUntil: null,
        manualSource: null,
        manualCountdownId: null,
      };
    }
  }
  if (prefs.autoSuppressedUntil) {
    const until = new Date(prefs.autoSuppressedUntil).getTime();
    if (!Number.isNaN(until) && now.getTime() >= until) {
      next = { ...next, autoSuppressedUntil: null };
    }
  }
  return next;
}

export type VacationEventLike = {
  category?: string | null;
  isOverlay?: boolean;
  sourceHouseholdKind?: string | null;
  event_date?: string;
  end_date?: string | null;
  title?: string | null;
  start_time?: string | null;
};

export type YmdRange = { start: string; end: string };

export function vacationVisibleYmdRange(
  snapshot: VacationModeSnapshot,
  prefs: VacationModePrefs,
  now: Date,
  fallbackTimeZone: string,
): YmdRange | null {
  if (!snapshot.active) return null;
  if (snapshot.activePeriods.length > 0) {
    const starts = snapshot.activePeriods.map((p) => getZonedParts(p.startAt, p.timeZone).dateStr);
    const ends = snapshot.activePeriods.map((p) => getZonedParts(p.endAt, p.timeZone).dateStr);
    return { start: starts.reduce((a, b) => (a < b ? a : b)), end: ends.reduce((a, b) => (a > b ? a : b)) };
  }
  if (prefs.manualUntil) {
    const tz = resolveTimeZone(fallbackTimeZone);
    return {
      start: getZonedParts(now, tz).dateStr,
      end: getZonedParts(new Date(prefs.manualUntil), tz).dateStr,
    };
  }
  return null;
}

export function eventOverlapsYmdRange(
  event: { event_date?: string; end_date?: string | null },
  range: YmdRange,
): boolean {
  if (!event.event_date) return true;
  const end = event.end_date || event.event_date;
  return event.event_date <= range.end && end >= range.start;
}

export function eventIsWorkdayLayer(event: VacationEventLike): boolean {
  if (event.isOverlay && (event.sourceHouseholdKind || '').toLowerCase() === 'work') return true;
  return isWorkdayCategory(event.category);
}

/** Untimed event that is the trip itself (same title and dates as a vacation period). */
export function eventMirrorsVacationPeriod(
  event: VacationEventLike,
  periods: VacationPeriod[],
): boolean {
  if (event.start_time) return false;
  if (!event.event_date) return false;
  const title = (event.title || '').trim().toLowerCase();
  if (!title) return false;
  const evEnd = event.end_date || event.event_date;
  return periods.some((period) => {
    const start = getZonedParts(period.startAt, period.timeZone).dateStr;
    const end = getZonedParts(period.endAt, period.timeZone).dateStr;
    return title === period.title.trim().toLowerCase() && event.event_date === start && evEnd === end;
  });
}

export function vacationStayProgress(
  period: VacationPeriod,
  onDate: Date,
): { day: number; of: number } | null {
  const onStr = getZonedParts(onDate, period.timeZone).dateStr;
  const startStr = getZonedParts(period.startAt, period.timeZone).dateStr;
  const endStr = getZonedParts(period.endAt, period.timeZone).dateStr;
  if (onStr < startStr || onStr > endStr) return null;
  const of = calendarDaysBetweenZoned(period.startAt, period.endAt, period.timeZone) + 1;
  if (of < 1) return null;
  return { day: calendarDaysBetweenZoned(period.startAt, onDate, period.timeZone) + 1, of };
}

/** Filter calendar events for the vacation layer. Never deletes; only hides. */
export function filterEventsForVacationLayer<T extends VacationEventLike>(
  events: T[],
  opts: {
    vacationActive: boolean;
    revealHidden: boolean;
    hideWorkdayEvents: boolean;
    dateRange?: YmdRange | null;
  },
): T[] {
  let next = events;
  if (opts.vacationActive && opts.dateRange) {
    next = next.filter((ev) => eventOverlapsYmdRange(ev, opts.dateRange!));
  }
  if (!opts.vacationActive || opts.revealHidden || !opts.hideWorkdayEvents) return next;
  return next.filter((ev) => !eventIsWorkdayLayer(ev));
}

export function shouldMuteEventNotification(
  event: VacationEventLike,
  opts: { vacationActive: boolean; muteHiddenNotifications: boolean },
): boolean {
  if (!opts.vacationActive || !opts.muteHiddenNotifications) return false;
  return eventIsWorkdayLayer(event);
}

function intlDayNumber(date: Date, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone }).format(date).replace(/\.$/, '');
}

function intlMonthName(
  date: Date,
  locale: string,
  timeZone: string | undefined,
  width: 'long' | 'short',
): string {
  return new Intl.DateTimeFormat(locale, { month: width, timeZone }).format(date).replace(/\.$/, '');
}

export function formatVacationRange(
  start: Date,
  end: Date,
  locale: string,
  timeZone?: string,
  style: 'long' | 'short' = 'long',
): string {
  const monthWidth = style === 'short' ? 'short' : 'long';
  const startMonth = intlMonthName(start, locale, timeZone, monthWidth);
  const endMonth = intlMonthName(end, locale, timeZone, monthWidth);
  const startDay = intlDayNumber(start, locale, timeZone);
  const endDay = intlDayNumber(end, locale, timeZone);
  const norwegian = locale.startsWith('nb') || locale.startsWith('nn') || locale.startsWith('no');
  if (startMonth === endMonth && start.getFullYear() === end.getFullYear()) {
    if (norwegian) return `${startDay}.–${endDay}. ${endMonth}`;
    return `${startDay}–${endDay} ${endMonth}`;
  }
  if (norwegian) {
    return `${startDay}. ${startMonth}–${endDay}. ${endMonth}`;
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

export function formatVacationDay(date: Date, locale: string, timeZone?: string): string {
  const day = intlDayNumber(date, locale, timeZone);
  const month = intlMonthName(date, locale, timeZone, 'long');
  if (locale.startsWith('nb') || locale.startsWith('nn') || locale.startsWith('no')) {
    return `${day}. ${month}`;
  }
  return `${day} ${month}`;
}

export function itineraryLabels(titles: string[]): string {
  return titles.filter(Boolean).join(' → ');
}

export function loadLocalJson(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function prefsStorageKey(memberId: string): string {
  return `${VACATION_PREFS_STORAGE_PREFIX}${memberId}`;
}

export function periodStorageKey(countdownId: string): string {
  return `${VACATION_PERIOD_STORAGE_PREFIX}${countdownId}`;
}

export function warnStorageKey(periodId: string, dateStr: string): string {
  return `${VACATION_WARN_STORAGE_PREFIX}${periodId}:${dateStr}`;
}
