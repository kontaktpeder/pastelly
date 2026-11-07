/** Shared helpers for Google Calendar OAuth + event mapping. */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
  'openid',
  'email',
  'profile',
].join(' ');

export const DEFAULT_TZ = 'Europe/Oslo';
export const HIEM_CALENDAR_SUMMARY_NB = 'Hjem';
export const HIEM_CALENDAR_SUMMARY_EN = 'Home';

export type PastellyEventRow = {
  id: string;
  household_id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  day_part: string;
  location: string | null;
  notes: string | null;
  updated_at: string;
};

export function jsonResponse(data: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      ...extraHeaders,
    },
  });
}

export function corsPreflight() {
  return new Response('ok', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

export function routeAfterFunction(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('google-calendar');
  if (idx === -1) return '';
  return parts.slice(idx + 1).join('/');
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Wall-clock local → RFC3339 with fixed offset approximation via Intl. */
export function localDateTimeToRfc3339(
  date: string,
  time: string | null,
  timeZone: string,
): string {
  const hhmm = (time && time.slice(0, 5)) || '09:00';
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  // Build a UTC instant that formats as the desired wall time in timeZone.
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asUtc - guess;
  const corrected = new Date(guess - offsetMs);
  const offMin = -Math.round(offsetMs / 60000);
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  const off = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${date}T${pad(hh)}:${pad(mm)}:00${off}`;
}

export function eventToGoogleBody(
  event: PastellyEventRow,
  timeZone: string,
): Record<string, unknown> {
  const endDate = event.end_date || event.event_date;
  const allDay = !event.start_time;
  if (allDay) {
    // Google end.date is exclusive.
    const endExclusive = addDays(endDate, 1);
    return {
      summary: event.title,
      description: event.notes || undefined,
      location: event.location || undefined,
      start: { date: event.event_date },
      end: { date: endExclusive },
    };
  }
  const start = localDateTimeToRfc3339(event.event_date, event.start_time, timeZone);
  const endTime = event.end_time || addHour(event.start_time!);
  const end = localDateTimeToRfc3339(endDate, endTime, timeZone);
  return {
    summary: event.title,
    description: event.notes || undefined,
    location: event.location || undefined,
    start: { dateTime: start, timeZone },
    end: { dateTime: end, timeZone },
  };
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function addHour(time: string): string {
  const [hh, mm] = time.slice(0, 5).split(':').map(Number);
  const next = (hh + 1) % 24;
  return `${pad(next)}:${pad(mm)}`;
}

export function googleEventToPastellyPatch(
  g: {
    summary?: string;
    description?: string;
    location?: string;
    start?: { date?: string; dateTime?: string; timeZone?: string };
    end?: { date?: string; dateTime?: string; timeZone?: string };
  },
): Partial<PastellyEventRow> & { title: string; event_date: string } {
  const title = (g.summary || 'Aktivitet').slice(0, 200);
  if (g.start?.date) {
    const event_date = g.start.date;
    let end_date: string | null = null;
    if (g.end?.date) {
      const exclusive = g.end.date;
      end_date = addDays(exclusive, -1);
      if (end_date <= event_date) end_date = event_date;
    }
    return {
      title,
      event_date,
      end_date,
      start_time: null,
      end_time: null,
      day_part: 'all_day',
      location: g.location ?? null,
      notes: g.description ?? null,
    };
  }
  const startDt = g.start?.dateTime ? new Date(g.start.dateTime) : new Date();
  const endDt = g.end?.dateTime ? new Date(g.end.dateTime) : startDt;
  const event_date = toYmdInZone(startDt, g.start?.timeZone || DEFAULT_TZ);
  const end_date = toYmdInZone(endDt, g.end?.timeZone || g.start?.timeZone || DEFAULT_TZ);
  const start_time = toHmInZone(startDt, g.start?.timeZone || DEFAULT_TZ);
  const end_time = toHmInZone(endDt, g.end?.timeZone || g.start?.timeZone || DEFAULT_TZ);
  return {
    title,
    event_date,
    end_date: end_date !== event_date ? end_date : event_date,
    start_time,
    end_time,
    day_part: dayPartForHm(start_time),
    location: g.location ?? null,
    notes: g.description ?? null,
  };
}

function toYmdInZone(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // en-CA → YYYY-MM-DD
}

function toHmInZone(date: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}`;
}

function dayPartForHm(time: string): string {
  const [hh] = time.split(':').map(Number);
  if (hh < 6) return 'night';
  if (hh < 9) return 'morning';
  if (hh < 12) return 'late_morning';
  if (hh < 18) return 'afternoon';
  return 'evening';
}

export async function encodeState(
  payload: { userId: string; householdId: string; returnTo: string },
  secret: string,
): Promise<string> {
  const body = btoa(JSON.stringify({ ...payload, t: Date.now() }));
  const sig = await hmacHex(secret, body);
  return `${body}.${sig}`;
}

export async function decodeState(
  state: string,
  secret: string,
): Promise<{ userId: string; householdId: string; returnTo: string } | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = await hmacHex(secret, body);
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(atob(body)) as {
      userId: string;
      householdId: string;
      returnTo: string;
      t: number;
    };
    if (Date.now() - parsed.t > 30 * 60 * 1000) return null;
    if (!parsed.userId || !parsed.householdId) return null;
    return {
      userId: parsed.userId,
      householdId: parsed.householdId,
      returnTo: parsed.returnTo || 'https://pastelly.no/',
    };
  } catch {
    return null;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
