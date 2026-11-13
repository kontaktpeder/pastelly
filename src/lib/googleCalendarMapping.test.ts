import { describe, expect, it } from 'vitest';
import {
  eventToGoogleBody,
  localDateTimeToRfc3339,
  type PastellyEventRow,
} from '../../supabase/functions/google-calendar/googleCalendar';

function event(overrides: Partial<PastellyEventRow>): PastellyEventRow {
  return {
    id: 'event-1',
    household_id: 'household-1',
    title: 'Dentist',
    event_date: '2026-01-15',
    end_date: null,
    start_time: '09:00',
    end_time: '10:00',
    day_part: 'morning',
    location: null,
    notes: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Google Calendar event mapping', () => {
  it('serializes Oslo winter wall-clock time with the correct positive offset', () => {
    expect(localDateTimeToRfc3339('2026-01-15', '09:00', 'Europe/Oslo')).toBe(
      '2026-01-15T09:00:00+01:00',
    );
  });

  it('serializes Oslo summer wall-clock time with the DST offset', () => {
    expect(localDateTimeToRfc3339('2026-07-15', '09:00', 'Europe/Oslo')).toBe(
      '2026-07-15T09:00:00+02:00',
    );
  });

  it('keeps timed Pastelly events at the same local time in Google', () => {
    const body = eventToGoogleBody(event({}), 'Europe/Oslo');

    expect(body.start).toEqual({
      dateTime: '2026-01-15T09:00:00+01:00',
      timeZone: 'Europe/Oslo',
    });
    expect(body.end).toEqual({
      dateTime: '2026-01-15T10:00:00+01:00',
      timeZone: 'Europe/Oslo',
    });
  });
});
