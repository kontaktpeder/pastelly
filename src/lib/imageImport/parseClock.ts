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

/** Abbreviations as they show up in shift apps and in English OCR. */
const SHORT_WEEKDAYS = [
  'mon',
  'tue',
  'tues',
  'wed',
  'thu',
  'thur',
  'thurs',
  'fri',
  'sat',
  'sun',
  'man',
  'tir',
  'ons',
  'tor',
  'fre',
  'lør',
  'lor',
  'lørd',
  'lord',
  'søn',
  'son',
  'sønd',
  'sond',
  'mand',
  'tirs',
  'onsd',
  'tors',
  'fred',
];

const WEEKDAY_RE = [...WEEKDAYS, ...SHORT_WEEKDAYS].join('|');
const PLACE_SUFFIXES = new Set(['as', 'ab', 'ag', 'sa']);

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

const CLOCK_RE = /(\d{1,2})[:.](\d{2})\s*([ap]\.?m\.?)?/gi;
const AMPM_CLOCK_RE = /(\d{1,2})(?:[:.\s])?(\d{2})\s*([ap]\.?m\.?)/gi;
const RANGE_SPLIT = /\s*(?:-|–|—|to|til)\s*/i;

function clocksFrom(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)]
    .map((m) => normalizeClockPart(Number(m[1]), Number(m[2]), m[3]))
    .filter((c): c is string => !!c);
}

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
  const mer = (ampm ?? '').toLowerCase().replace(/\./g, '');
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
  const clocks = clocksFrom(compact, CLOCK_RE);
  if (clocks.length >= 2) return { startTime: clocks[0], endTime: clocks[1] };

  const ampmClocks = clocksFrom(compact, AMPM_CLOCK_RE);
  if (ampmClocks.length >= 2) return { startTime: ampmClocks[0], endTime: ampmClocks[1] };

  const parts = compact.split(RANGE_SPLIT);
  if (parts.length === 2) {
    const start = parseClockToken(parts[0]) ?? clocksFrom(parts[0], AMPM_CLOCK_RE)[0] ?? null;
    const end = parseClockToken(parts[1]) ?? clocksFrom(parts[1], AMPM_CLOCK_RE)[0] ?? null;
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

function dayInRange(value: string): number | null {
  const day = Number(value);
  return day >= 1 && day <= 31 ? day : null;
}

export function parseDayHeader(text: string): number | null {
  const cleaned = text.replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const paired = new RegExp(`(?:^|\\s)(\\d{1,2})\\s+(?:${WEEKDAY_RE})\\b`, 'i').exec(cleaned);
  if (paired) {
    const day = dayInRange(paired[1]);
    if (day) return day;
  }
  const swapped = new RegExp(`(?:^|\\s)(?:${WEEKDAY_RE})\\s+(\\d{1,2})\\b`, 'i').exec(cleaned);
  if (swapped) {
    const day = dayInRange(swapped[1]);
    if (day) return day;
  }
  // "17 «& Preference: Available" and "22 Thu" — the number shares the row
  // with the preference chip or a short weekday. Clocks ("6:00PM") stay out.
  const lead = /^(\d{1,2})(?![:.\d])\s*(.*)$/.exec(cleaned);
  if (!lead) return null;
  const day = dayInRange(lead[1]);
  if (!day) return null;
  const rest = lead[2].trim();
  if (!rest) return day;
  if (isIgnoreLine(rest)) return day;
  if (new RegExp(`^(?:${WEEKDAY_RE})\\b`, 'i').test(rest)) return day;
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
  return /\byour\s+sh\w{2,8}\b/.test(t) || /\bdine\s+vakter\b/.test(t);
}

export function isYourScheduleLabel(text: string): boolean {
  const t = text.toLowerCase();
  return /\byour\s+schedule\b/.test(t) || /\bdin\s+timeplan\b/.test(t) || /\bmin\s+timeplan\b/.test(t);
}

export function isOpenShiftsLabel(text: string): boolean {
  const t = text.toLowerCase();
  return /\bopen\s*shifts?\b/.test(t) || /\bledige\s*vakter\b/.test(t);
}

function repairJobWord(word: string): string {
  if (/^servit[oøóg0]?r$/i.test(word)) return 'Servitør';
  return word;
}

function roleTokens(side: string): string {
  const stripped = side.replace(/\[[^\]]*\]/g, ' ').replace(/[«»&|()[\]]/g, ' ');
  return stripped
    .split(/\s+/)
    .map((token) => token.replace(/^[^0-9A-Za-zÆØÅæøå]+|[^0-9A-Za-zÆØÅæøå]+$/g, ''))
    .filter(Boolean)
    .filter((token) => {
      if (/^\d+$/.test(token)) return false;
      if (token.length <= 2 && !PLACE_SUFFIXES.has(token.toLowerCase())) return false;
      return /[A-Za-zÆØÅæøå]/.test(token);
    })
    .map((token) => repairJobWord(token))
    .join(' ');
}

export function parseRoleAndPlace(text: string): { title: string; location: string | null } {
  const cleaned = text
    .replace(/\b\d{1,2}[:.]\d{2}\s*[ap]\.?m\.?\b/gi, ' ')
    .replace(new RegExp(`\\b(?:${WEEKDAYS.join('|')})\\b`, 'gi'), ' ')
    .replace(/\b(?:october|oktober|november|december|january|januar)\b/gi, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b([1-9]|[12]\d|3[01])\b/g, ' ')
    .replace(/\s*(?:-|–|—)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,·]+|[,·]+$/g, '')
    .trim();
  if (!cleaned) return { title: '', location: null };
  const comma = cleaned.indexOf(',');
  const title = roleTokens(comma > 0 ? cleaned.slice(0, comma) : cleaned);
  const location = roleTokens(comma > 0 ? cleaned.slice(comma + 1) : '');
  return { title, location: location || null };
}

/** Lines that are icons, nav chrome, or a lone weekday — not a job title. */
export function isSkippableRoleLine(text: string): boolean {
  const words = text
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/[^A-Za-zÆØÅæøå]+/)
    .filter((word) => word.length >= 3);
  if (words.length === 0) return true;
  const cleaned = text.replace(/[^A-Za-zÆØÅæøå]/g, ' ').replace(/\s+/g, ' ').trim();
  return new RegExp(`^(?:${WEEKDAY_RE})$`, 'i').test(cleaned);
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
