import { describe, expect, it } from 'vitest';
import { nb } from 'date-fns/locale';
import { formatEventStayLabel } from './eventStay';

const labels = {
  dateLocale: nb,
  firstDay: 'Første dag',
  lastDay: 'Siste dag',
  checkIn: 'Innsjekk',
  checkOut: 'Utsjekk',
};

describe('event stay labels', () => {
  it('shows check-in and check-out for hotel', () => {
    expect(
      formatEventStayLabel(
        {
          category: 'hotel',
          event_date: '2026-09-14',
          end_date: '2026-09-20',
          start_time: '15:00',
          end_time: '11:00',
        },
        labels,
      ),
    ).toMatch(/Innsjekk 14\. sep.*15:00.*Utsjekk 20\. sep.*11:00/i);
  });

  it('shows first and last day for a multi-day outing', () => {
    expect(
      formatEventStayLabel(
        {
          category: 'outing',
          event_date: '2026-09-14',
          end_date: '2026-09-16',
          start_time: '10:00',
          end_time: '15:00',
        },
        labels,
      ),
    ).toBe('Første dag 14. sep. · Siste dag 16. sep.');
  });

  it('is silent for a single breakfast', () => {
    expect(
      formatEventStayLabel(
        {
          category: 'breakfast',
          event_date: '2026-09-18',
          start_time: '09:00',
          end_time: '10:00',
        },
        labels,
      ),
    ).toBeNull();
  });
});
