const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'mandag',
  'tirsdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lørdag',
  'lordag',
  'søndag',
  'sondag',
];

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
  januar: 1,
  februar: 2,
  mars: 3,
  mai: 5,
  juni: 6,
  juli: 7,
  oktober: 10,
};

const CLOCK_RE = /(\d{1,2})[:.](\d{2})\s*([ap]m)?/gi;
const RANGE_SPLIT = /\s*(?:-|–|—|to|til)\s*/i;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function addDaysYmd(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

export function normalizeClockPart(hour: number, minute: number, ampm?: string | null): string | null {
  if (hour > 24 || minute > 59) return null;
  let h = hour;
  const mer = (ampm ?? '').toLowerCase();
  if (mer === 'am') {
    if (h === 12) h = 0;
  } else if (mer === 'pm') {
    if (h !== 12) h += 12;
  }
  if (h === 24) h = 0;
  if (h > 23) return null;
  return `${pad2(h)}:${pad2(minute)}`;
}

export function parseClockToken(raw: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})\s*([ap]m)?$/i.exec(raw.trim());
  if (!m) return null;
  return normalizeClockPart(Number(m[1]), Number(m[2]), m[3]);
}

export function parseTimeRange(text: string): { startTime: string; endTime: string } | null {
  const compact = text.replace(/\s+/g, ' ').trim();
  const matches = [...compact.matchAll(CLOCK_RE)].map((m) =>
    normalizeClockPart(Number(m[1]), Number(m[2]), m[3]),
  );
  const clocks = matches.filter((c): c is string => !!c);
  if (clocks.length >= 2) return { startTime: clocks[0], endTime: clocks[1] };

  const parts = compact.split(RANGE_SPLIT);
  if (parts.length === 2) {
    const start = parseClockToken(parts[0]);
    const end = parseClockToken(parts[1]);
    if (start && end) return { startTime: start, endTime: end };
  }
  return null;
}

export function isOvernight(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em <= sh * 60 + sm;
}

export function monthFromText(text: string): number | null {
  const tokens = text.toLowerCase().replace(/[^a-zæøå]/gi, ' ').split(/\s+/);
  for (const token of tokens) {
    if (MONTHS[token]) return MONTHS[token];
  }
  return null;
}

export function yearFromText(text: string): number | null {
  const m = text.match(/\b(20\d{2})\b/);
  if (!m) return null;
  const year = Number(m[1]);
  return year >= 2000 && year <= 2100 ? year : null;
}

export function parseDayHeader(text: string): number | null {
  const cleaned = text.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  const weekday = WEEKDAYS.join('|');
  const paired = new RegExp(`^(\\d{1,2})\\s+(?:${weekday})\\b`, 'i').exec(cleaned);
  if (paired) {
    const day = Number(paired[1]);
    return day >= 1 && day <= 31 ? day : null;
  }
  const swapped = new RegExp(`^(?:${weekday})\\s+(\\d{1,2})\\b`, 'i').exec(cleaned);
  if (swapped) {
    const day = Number(swapped[1]);
    return day >= 1 && day <= 31 ? day : null;
  }
  return null;
}

export function isIgnoreLine(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bpreference\b/.test(t) ||
    /\bavailable\b/.test(t) ||
    /\bopen\s*shifts?\b/.test(t) ||
    /\bpunch\s*clock\b/.test(t) ||
    /\bledige\s*vakter\b/.test(t)
  );
}

export function isYourShiftsLabel(text: string): boolean {
  const t = text.toLowerCase();
  return /\byour\s+shifts?\b/.test(t) || /\bdine\s+vakter\b/.test(t);
}

export function isYourScheduleLabel(text: string): boolean {
  const t = text.toLowerCase();
  return /\byour\s+schedule\b/.test(t) || /\bdin\s+timeplan\b/.test(t) || /\bmin\s+timeplan\b/.test(t);
}

export function isOpenShiftsLabel(text: string): boolean {
  const t = text.toLowerCase();
  return /\bopen\s*shifts?\b/.test(t) || /\bledige\s*vakter\b/.test(t);
}

export function parseRoleAndPlace(text: string): { title: string; location: string | null } {
  const weekday = WEEKDAYS.join('|');
  const cleaned = text
    .replace(/\b\d{1,2}[:.]\d{2}\s*[ap]m\b/gi, ' ')
    .replace(new RegExp(`\\b(?:${weekday})\\b`, 'gi'), ' ')
    .replace(/\b(?:october|oktober|november|december|january|januar)\b/gi, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b([1-9]|[12]\d|3[01])\b/g, ' ')
    .replace(/\s*(?:-|–|—)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,·]+|[,·]+$/g, '')
    .trim();
  if (!cleaned) return { title: '', location: null };
  const comma = cleaned.indexOf(',');
  if (comma > 0) {
    return {
      title: cleaned.slice(0, comma).trim(),
      location: cleaned.slice(comma + 1).trim() || null,
    };
  }
  return { title: cleaned, location: null };
}

export function applyYearToDate(
  year: number | null,
  month: number,
  day: number,
): string | null {
  if (!year) return null;
  return ymd(year, month, day);
}

export function finishShiftDates(input: {
  year: number | null;
  month: number;
  day: number;
  startTime: string;
  endTime: string;
}): { eventDate: string | null; endDate: string | null; overnight: boolean } {
  const overnight = isOvernight(input.startTime, input.endTime);
  const eventDate = applyYearToDate(input.year, input.month, input.day);
  if (!eventDate) return { eventDate: null, endDate: null, overnight };
  return {
    eventDate,
    endDate: overnight ? addDaysYmd(eventDate, 1) : eventDate,
    overnight,
  };
}
