import { addDays, differenceInCalendarDays, startOfMonth, startOfWeek } from 'date-fns';
import type { SetStateAction } from 'react';

export const WEEK_STARTS_ON = 1 as const;

export type YmdRange = { start: string; end: string };

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function calendarStripAnchor(date: Date, weekMode: boolean): Date {
  return weekMode
    ? startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })
    : startOfMonth(date);
}

export function weekOverlapsYmd(weekStart: Date, range: YmdRange): boolean {
  const start = formatYmd(weekStart);
  const end = formatYmd(addDays(weekStart, 6));
  return start <= range.end && end >= range.start;
}

/**
 * Keep the focused day when the calendar strip moves.
 * Month swipes keep the day-of-month; week swipes keep the weekday.
 * Direct Date jumps in week mode keep the given day (today / trip start).
 */
export function applyCalendarStripChange(
  prev: Date,
  update: SetStateAction<Date>,
  weekMode: boolean,
): Date {
  if (typeof update !== 'function') {
    if (weekMode) return update;
    const y = update.getFullYear();
    const m = update.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(prev.getDate(), lastDay);
    return new Date(y, m, day);
  }
  const nextAnchor = update(calendarStripAnchor(prev, weekMode));
  if (weekMode) {
    const nextWeek = startOfWeek(nextAnchor, { weekStartsOn: WEEK_STARTS_ON });
    const prevWeek = startOfWeek(prev, { weekStartsOn: WEEK_STARTS_ON });
    const offset = Math.min(6, Math.max(0, differenceInCalendarDays(prev, prevWeek)));
    return addDays(nextWeek, offset);
  }
  const y = nextAnchor.getFullYear();
  const m = nextAnchor.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(prev.getDate(), lastDay);
  return new Date(y, m, day);
}

/**
 * Week to land on in vacation mode: keep the current week if it overlaps the
 * trip, else today if today overlaps, else the week the trip starts.
 */
export function resolveVacationFocusDate(
  current: Date,
  range: YmdRange | null,
  today: Date = new Date(),
): Date {
  if (!range) return current;
  const currentWeek = startOfWeek(current, { weekStartsOn: WEEK_STARTS_ON });
  if (weekOverlapsYmd(currentWeek, range)) return current;
  const todayWeek = startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON });
  if (weekOverlapsYmd(todayWeek, range)) return today;
  return ymdToLocalDate(range.start);
}
