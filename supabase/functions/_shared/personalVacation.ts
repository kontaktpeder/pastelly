/** Personal vacation mute: the trip can be shared, the mode is per member. */

export type VacationPrefsLike = {
  manualOn?: unknown;
  manualUntil?: unknown;
  autoSuppressedUntil?: unknown;
  muteHiddenNotifications?: unknown;
};

export type HolidayWithJoins = {
  id: string;
  target_at: string;
  ends_at?: string | null;
  countdown_participants?: { member_id: string; status: string | null }[] | null;
};

function isManualVacationActive(prefs: VacationPrefsLike, nowMs: number): boolean {
  if (prefs.manualOn !== true) return false;
  if (typeof prefs.manualUntil !== 'string' || !prefs.manualUntil) return true;
  const until = Date.parse(prefs.manualUntil);
  if (Number.isNaN(until)) return true;
  return nowMs < until;
}

function isAutoVacationSuppressed(prefs: VacationPrefsLike, nowMs: number): boolean {
  if (typeof prefs.autoSuppressedUntil !== 'string' || !prefs.autoSuppressedUntil) return false;
  const until = Date.parse(prefs.autoSuppressedUntil);
  if (Number.isNaN(until)) return false;
  return nowMs < until;
}

function memberJoinedHolidayIsActive(
  memberId: string,
  holidays: HolidayWithJoins[],
  nowMs: number,
): boolean {
  return holidays.some((row) => {
    const joined = (row.countdown_participants ?? []).some(
      (p) => p.member_id === memberId && p.status === 'joined',
    );
    if (!joined) return false;
    const start = Date.parse(row.target_at);
    if (Number.isNaN(start)) return false;
    const end = row.ends_at ? Date.parse(row.ends_at) : start + 86_400_000;
    if (Number.isNaN(end)) return false;
    return nowMs >= start && nowMs <= end;
  });
}

/** Auto-on only after this member has accepted the trip. Manual on is personal. */
export function isPersonalVacationActive(
  memberId: string,
  prefs: VacationPrefsLike,
  holidays: HolidayWithJoins[],
  nowMs: number,
): boolean {
  if (isManualVacationActive(prefs, nowMs)) return true;
  if (isAutoVacationSuppressed(prefs, nowMs)) return false;
  return memberJoinedHolidayIsActive(memberId, holidays, nowMs);
}

export function shouldMuteWorkdayPush(
  memberId: string,
  prefs: VacationPrefsLike,
  holidays: HolidayWithJoins[],
  nowMs: number,
): boolean {
  if (prefs.muteHiddenNotifications !== true) return false;
  return isPersonalVacationActive(memberId, prefs, holidays, nowMs);
}
