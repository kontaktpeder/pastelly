/**
 * Pastelly agent calendar API.
 *
 * Callers send a personal token (pst_…) as Authorization: Bearer.
 * Times are wall-clock in the calendar member's timezone, never UTC.
 */

export const AGENT_TOKEN_PATTERN = /^pst_[0-9a-f]{64}$/;

export const EVENT_CATEGORIES = [
  'couple',
  'work',
  'social',
  'celebration',
  'important',
  'travel',
  'school',
  'meeting',
  'other',
  'production',
  'development',
  'admin',
  'personal',
  'client',
  'deadline',
  'focus',
  'beach',
  'breakfast',
  'lunch',
  'dinner',
  'hotel',
  'outing',
  'activity',
  'relaxation',
  'shopping',
  'practical',
] as const;

export const DAY_PARTS = [
  'morning',
  'late_morning',
  'afternoon',
  'evening',
  'night',
  'full_diem',
  'all_day',
] as const;

export const VISIBILITY_TYPES = ['all_members', 'private', 'selected_members'] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export const MAX_RANGE_DAYS = 366;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTES_LENGTH = 4000;
export const MAX_LOCATION_LENGTH = 300;

export type AgentOp = 'calendars' | 'list_events' | 'create_event';

export type AgentFailure = {
  ok: false;
  error: string;
  message: string;
  status: number;
};

export type AgentSuccess = {
  ok: true;
  op: AgentOp;
  payload: Record<string, unknown>;
};

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return null;
  const token = match[1];
  return AGENT_TOKEN_PATTERN.test(token) ? token : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function dayPartForTime(time: string | null): (typeof DAY_PARTS)[number] {
  if (!time) return 'all_day';
  const match = TIME_PATTERN.exec(time);
  if (!match) return 'all_day';
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 6 * 60) return 'night';
  if (minutes < 9 * 60) return 'morning';
  if (minutes < 12 * 60) return 'late_morning';
  if (minutes < 18 * 60) return 'afternoon';
  return 'evening';
}

function fail(error: string, message: string, status = 400): AgentFailure {
  return { ok: false, error, message, status };
}

export function agentRoute(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.lastIndexOf('agent-calendar');
  if (idx === -1) return '';
  return parts.slice(idx + 1).join('/');
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeTime(value: string): string | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function parseListEvents(source: Record<string, unknown>): AgentSuccess | AgentFailure {
  const calendarId = readString(source, 'calendar_id');
  const from = readString(source, 'from');
  const to = readString(source, 'to') || from;
  if (!isUuid(calendarId)) {
    return fail('invalid_calendar', 'calendar_id must be a calendar UUID');
  }
  if (!isRealDate(from) || !isRealDate(to)) {
    return fail('invalid_date', 'from and to must be real dates as YYYY-MM-DD');
  }
  if (to < from) {
    return fail('invalid_range', 'to must be on or after from');
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return fail('invalid_range', `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return {
    ok: true,
    op: 'list_events',
    payload: { calendar_id: calendarId, from, to },
  };
}

export function parseCreateEvent(source: Record<string, unknown>): AgentSuccess | AgentFailure {
  const calendarId = readString(source, 'calendar_id');
  const title = readString(source, 'title');
  const eventDate = readString(source, 'event_date');
  const endDate = readString(source, 'end_date') || eventDate;
  if (!isUuid(calendarId)) {
    return fail('invalid_calendar', 'calendar_id must be a calendar UUID');
  }
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return fail('invalid_title', `title is required and must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  if (!isRealDate(eventDate) || !isRealDate(endDate)) {
    return fail('invalid_date', 'event_date and end_date must be real dates as YYYY-MM-DD');
  }
  if (endDate < eventDate) {
    return fail('invalid_range', 'end_date must be on or after event_date');
  }

  const startRaw = readString(source, 'start_time');
  const endRaw = readString(source, 'end_time');
  const startTime = startRaw ? normalizeTime(startRaw) : null;
  const endTime = endRaw ? normalizeTime(endRaw) : null;
  if (startRaw && !startTime) {
    return fail('invalid_time', 'start_time must be HH:MM');
  }
  if (endRaw && !endTime) {
    return fail('invalid_time', 'end_time must be HH:MM');
  }
  if (startTime && endTime && endDate === eventDate && endTime < startTime) {
    return fail('end_before_start', 'end_time is before start_time. Use end_date for an overnight event.');
  }

  const location = readString(source, 'location');
  const notes = readString(source, 'notes');
  if (location.length > MAX_LOCATION_LENGTH) {
    return fail('invalid_location', `location must be at most ${MAX_LOCATION_LENGTH} characters`);
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return fail('invalid_notes', `notes must be at most ${MAX_NOTES_LENGTH} characters`);
  }

  const categoryRaw = readString(source, 'category') || 'other';
  if (!EVENT_CATEGORIES.includes(categoryRaw as (typeof EVENT_CATEGORIES)[number])) {
    return fail('invalid_category', `category must be one of: ${EVENT_CATEGORIES.join(', ')}`);
  }
  const category = categoryRaw;
  const label = readString(source, 'category_label_override');
  if (label && category !== 'other') {
    return fail('invalid_category', 'category_label_override is only allowed when category is other');
  }
  if (label.length > 40) {
    return fail('invalid_category', 'category_label_override must be at most 40 characters');
  }

  const visibility = readString(source, 'visibility_type') || 'all_members';
  if (!VISIBILITY_TYPES.includes(visibility as (typeof VISIBILITY_TYPES)[number])) {
    return fail('invalid_visibility', 'visibility_type must be all_members, private, or selected_members');
  }

  let visibleMemberIds: string[] = [];
  if (visibility === 'selected_members') {
    const raw = source.visible_member_ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return fail('invalid_visibility', 'selected_members requires visible_member_ids');
    }
    if (!raw.every((id) => typeof id === 'string' && isUuid(id))) {
      return fail('invalid_visibility', 'visible_member_ids must be member UUIDs');
    }
    visibleMemberIds = [...new Set(raw)];
  }

  const hide = source.hide_from_other_calendars === true;
  const dayPart = dayPartForTime(startTime);
  const dayPartEnd = dayPartForTime(endTime ?? startTime);

  return {
    ok: true,
    op: 'create_event',
    payload: {
      calendar_id: calendarId,
      title,
      event_date: eventDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      day_part: startTime ? dayPart : 'all_day',
      day_part_start: startTime ? dayPart : 'all_day',
      day_part_end: startTime ? dayPartEnd : 'all_day',
      location: location || null,
      notes: notes || null,
      category,
      category_label_override: category === 'other' && label ? label : null,
      visibility_type: visibility,
      hide_from_other_calendars: hide,
      visible_member_ids: visibleMemberIds,
    },
  };
}

export function parseAgentCall(input: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  body: unknown;
}): AgentSuccess | AgentFailure {
  const method = input.method.toUpperCase();
  const route = agentRoute(input.pathname);

  if (method === 'GET' && route === 'calendars') {
    return { ok: true, op: 'calendars', payload: {} };
  }

  if (method === 'GET' && route === 'events') {
    return parseListEvents({
      calendar_id: input.searchParams.get('calendar_id') ?? '',
      from: input.searchParams.get('from') ?? '',
      to: input.searchParams.get('to') ?? '',
    });
  }

  if (method === 'POST' && (route === '' || route === 'events')) {
    const body = asRecord(input.body);
    if (!body) return fail('invalid_body', 'JSON object body is required');
    if (route === 'events' || body.op === 'create_event') return parseCreateEvent(body);
    if (body.op === 'calendars') return { ok: true, op: 'calendars', payload: {} };
    if (body.op === 'list_events') return parseListEvents(body);
    return fail('unknown_op', 'op must be calendars, list_events, or create_event');
  }

  if (method !== 'GET' && method !== 'POST') {
    return fail('method_not_allowed', 'Use GET or POST', 405);
  }
  return fail('not_found', 'Unknown agent calendar route', 404);
}
