import { describe, expect, it } from 'vitest';
import {
  eventToGoogleBody,
  localDateTimeToRfc3339,
  type PastellyEventRow,
} from '../../supabase/functions/google-calendar/googleCalendar';

describe('Google Calendar event mapping', () => {
  it('keeps Oslo wall-clock times when exporting winter and summer events', () => {
    const winter = localDateTimeToRfc3339('2026-01-15', '09:30', 'Europe/Oslo');
    const summer = localDateTimeToRfc3339('2026-07-15', '09:30', 'Europe/Oslo');

    expect(winter).toBe('2026-01-15T09:30:00+01:00');
    expect(new Date(winter).toISOString()).toBe('2026-01-15T08:30:00.000Z');
    expect(summer).toBe('2026-07-15T09:30:00+02:00');
    expect(new Date(summer).toISOString()).toBe('2026-07-15T07:30:00.000Z');
  });

  it('exports timed events with the timezone offset in the same direction as the named zone', () => {
    const event: PastellyEventRow = {
      id: 'event-1',
      household_id: 'household-1',
      title: 'School pickup',
      event_date: '2026-01-15',
      end_date: null,
      start_time: '15:00',
      end_time: '16:00',
      day_part: 'afternoon',
      location: null,
      notes: null,
      updated_at: '2026-01-01T00:00:00Z',
    };

    expect(eventToGoogleBody(event, 'Europe/Oslo')).toMatchObject({
      start: { dateTime: '2026-01-15T15:00:00+01:00', timeZone: 'Europe/Oslo' },
      end: { dateTime: '2026-01-15T16:00:00+01:00', timeZone: 'Europe/Oslo' },
    });
  });
});
