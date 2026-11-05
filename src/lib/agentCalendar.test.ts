import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  dayPartForTime,
  parseAgentCall,
  parseCreateEvent,
  readBearerToken,
  sha256Hex,
} from '../../supabase/functions/agent-calendar/agentCalendar';

const CALENDAR = '11111111-1111-4111-8111-111111111111';

describe('agent calendar token', () => {
  it('accepts only a pst_ bearer of 64 hex chars', () => {
    const token = `pst_${'ab'.repeat(32)}`;
    expect(readBearerToken(`Bearer ${token}`)).toBe(token);
    expect(readBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.a.b')).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });

  it('hashes tokens the same way Postgres pgcrypto does', async () => {
    const token = 'pst_test';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(await sha256Hex(token)).toBe(expected);
    expect(expected).toBe('5a02294a08eb2ab56455cece9956531771fa76d12509260dabc6585dc84ec93e');
  });
});

describe('day parts', () => {
  it('maps clock times onto the calendar day parts', () => {
    expect(dayPartForTime(null)).toBe('all_day');
    expect(dayPartForTime('05:59')).toBe('night');
    expect(dayPartForTime('08:30')).toBe('morning');
    expect(dayPartForTime('11:15')).toBe('late_morning');
    expect(dayPartForTime('12:00')).toBe('afternoon');
    expect(dayPartForTime('18:00')).toBe('evening');
  });
});

describe('parseAgentCall', () => {
  it('lists calendars from GET or a POST op', () => {
    expect(
      parseAgentCall({
        method: 'GET',
        pathname: '/functions/v1/agent-calendar/calendars',
        searchParams: new URLSearchParams(),
        body: null,
      }).ok,
    ).toBe(true);
    const posted = parseAgentCall({
      method: 'POST',
      pathname: '/agent-calendar',
      searchParams: new URLSearchParams(),
      body: { op: 'calendars' },
    });
    expect(posted).toMatchObject({ ok: true, op: 'calendars' });
  });

  it('reads a date range for one calendar', () => {
    const parsed = parseAgentCall({
      method: 'GET',
      pathname: '/functions/v1/agent-calendar/events',
      searchParams: new URLSearchParams({
        calendar_id: CALENDAR,
        from: '2026-11-05',
        to: '2026-11-05',
      }),
      body: null,
    });
    expect(parsed).toMatchObject({
      ok: true,
      op: 'list_events',
      payload: { calendar_id: CALENDAR, from: '2026-11-05', to: '2026-11-05' },
    });
  });

  it('rejects an impossible date and an oversized range', () => {
    expect(parseCreateEvent({ calendar_id: CALENDAR, title: 'Møte', event_date: '2026-02-31' })).toMatchObject({
      ok: false,
      error: 'invalid_date',
    });
    expect(
      parseAgentCall({
        method: 'POST',
        pathname: '/agent-calendar',
        searchParams: new URLSearchParams(),
        body: { op: 'list_events', calendar_id: CALENDAR, from: '2026-01-01', to: '2027-06-01' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid_range' });
  });

  it('builds a timed meeting with afternoon day part and wall-clock times', () => {
    const parsed = parseCreateEvent({
      calendar_id: CALENDAR,
      title: '  Smaking hos Antonietta  ',
      event_date: '2026-11-05',
      start_time: '12:00:00',
      end_time: '13:00',
      location: 'Niels Juels gate 51',
      notes: 'Egne arancini.',
      category: 'meeting',
    });
    expect(parsed).toMatchObject({
      ok: true,
      op: 'create_event',
      payload: {
        title: 'Smaking hos Antonietta',
        event_date: '2026-11-05',
        end_date: '2026-11-05',
        start_time: '12:00',
        end_time: '13:00',
        day_part: 'afternoon',
        day_part_start: 'afternoon',
        category: 'meeting',
        location: 'Niels Juels gate 51',
        visibility_type: 'all_members',
      },
    });
  });

  it('rejects an end time before the start on the same day', () => {
    expect(
      parseCreateEvent({
        calendar_id: CALENDAR,
        title: 'Vakt',
        event_date: '2026-11-05',
        start_time: '17:00',
        end_time: '13:00',
      }),
    ).toMatchObject({ ok: false, error: 'end_before_start' });
  });
});
