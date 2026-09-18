/** Time-zone helpers without Temporal — two-pass UTC conversion. */

export const DEFAULT_TIME_ZONE = 'Europe/Oslo';

const WEEKDAY_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
  dateStr: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function resolveTimeZone(value: string | null | undefined): string {
  const tz = (value ?? '').trim();
  if (!tz) return DEFAULT_TIME_ZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const tz = resolveTimeZone(timeZone);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAY_NUM[map.weekday] ?? 0,
    dateStr: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

function partsToUtcMs(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * Convert a civil date/time in `timeZone` to a UTC timestamp.
 * Treat the wall clock as UTC, read the zone offset at that instant, then
 * re-read the offset at the corrected instant (DST-safe).
 */
export function zonedLocalToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const tz = resolveTimeZone(timeZone);
  const wanted = partsToUtcMs({ year, month, day, hour, minute, second });
  const asTz = partsToUtcMs(getZonedParts(new Date(wanted), tz));
  const once = wanted - (asTz - wanted);
  const asTz2 = partsToUtcMs(getZonedParts(new Date(once), tz));
  return wanted - (asTz2 - once);
}

export function zonedDateAndTimeToIso(
  date: Date,
  timeHm: string,
  timeZone: string,
): string {
  const [h, m] = timeHm.split(':').map(Number);
  const ms = zonedLocalToUtcMs(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    h || 0,
    m || 0,
    0,
    timeZone,
  );
  return new Date(ms).toISOString();
}

/** Civil date + HH:mm in `timeZone` — use this to seed edit forms, not Date#getHours. */
export function civilDateAndTimeFromInstant(
  instant: Date,
  timeZone: string,
): { date: Date; timeHm: string } {
  const p = getZonedParts(instant, timeZone);
  return {
    date: new Date(p.year, p.month - 1, p.day),
    timeHm: `${pad2(p.hour)}:${pad2(p.minute)}`,
  };
}

export function startOfZonedDayMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  return zonedLocalToUtcMs(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

export function addCalendarDate(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function addZonedDaysMs(
  year: number,
  month: number,
  day: number,
  days: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const next = addCalendarDate(year, month, day, days);
  return zonedLocalToUtcMs(next.year, next.month, next.day, hour, minute, second, timeZone);
}

export function calendarDaysBetweenZoned(
  from: Date,
  to: Date,
  timeZone: string,
): number {
  const a = getZonedParts(from, timeZone);
  const b = getZonedParts(to, timeZone);
  const aUtc = Date.UTC(a.year, a.month - 1, a.day);
  const bUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((bUtc - aUtc) / 86400000);
}

/**
 * Stay on until the start of the next weekday (Mon–Fri) in `timeZone`.
 * Wednesday 15:00 → Thursday 00:00. Friday 15:00 → Monday 00:00.
 */
export function startOfNextWorkdayMs(now: Date, timeZone: string): number {
  const tz = resolveTimeZone(timeZone);
  const p = getZonedParts(now, tz);
  let year = p.year;
  let month = p.month;
  let day = p.day;
  let weekday = p.weekday;
  for (let i = 0; i < 8; i += 1) {
    const next = addCalendarDate(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
    weekday = (weekday + 1) % 7;
    if (weekday >= 1 && weekday <= 5) {
      return zonedLocalToUtcMs(year, month, day, 0, 0, 0, tz);
    }
  }
  return addZonedDaysMs(p.year, p.month, p.day, 1, 0, 0, 0, tz);
}

export function endOfZonedDayMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  return zonedLocalToUtcMs(p.year, p.month, p.day, 23, 59, 59, timeZone);
}

export const VACATION_TIME_ZONES: { value: string; labelNb: string; labelEn: string }[] = [
  { value: 'Europe/Oslo', labelNb: 'Oslo', labelEn: 'Oslo' },
  { value: 'Europe/Madrid', labelNb: 'Madrid / Mallorca', labelEn: 'Madrid / Mallorca' },
  { value: 'Europe/Athens', labelNb: 'Athen / Hellas', labelEn: 'Athens / Greece' },
  { value: 'Europe/London', labelNb: 'London', labelEn: 'London' },
  { value: 'Europe/Paris', labelNb: 'Paris', labelEn: 'Paris' },
  { value: 'Europe/Rome', labelNb: 'Roma / Italia', labelEn: 'Rome / Italy' },
  { value: 'Atlantic/Canary', labelNb: 'Kanariøyene', labelEn: 'Canary Islands' },
  { value: 'America/New_York', labelNb: 'New York', labelEn: 'New York' },
  { value: 'America/Cancun', labelNb: 'Cancún', labelEn: 'Cancún' },
  { value: 'America/Los_Angeles', labelNb: 'Los Angeles', labelEn: 'Los Angeles' },
  { value: 'Asia/Bangkok', labelNb: 'Bangkok', labelEn: 'Bangkok' },
  { value: 'Asia/Tokyo', labelNb: 'Tokyo', labelEn: 'Tokyo' },
  { value: 'Pacific/Honolulu', labelNb: 'Hawaii', labelEn: 'Hawaii' },
  { value: 'UTC', labelNb: 'UTC', labelEn: 'UTC' },
];
