import { format, type Locale } from 'date-fns';
import type { Event } from '@/hooks/useEvents';
import { isMultiDayEvent } from '@/lib/multiDaySpans';
import { isHotelCategory } from '@/lib/vacationSchedule';

export function formatEventStayLabel(
  ev: Pick<Event, 'event_date' | 'start_time' | 'end_time' | 'category'> & {
    end_date?: string | null;
  },
  opts: {
    dateLocale: Locale;
    firstDay: string;
    lastDay: string;
    checkIn: string;
    checkOut: string;
  },
): string | null {
  const start = new Date(ev.event_date + 'T12:00:00');
  const end = new Date((ev.end_date || ev.event_date) + 'T12:00:00');
  const startTime = ev.start_time?.slice(0, 5);
  const endTime = ev.end_time?.slice(0, 5);
  const startDay = format(start, 'd. MMM', { locale: opts.dateLocale });
  const endDay = format(end, 'd. MMM', { locale: opts.dateLocale });

  if (isHotelCategory(ev.category)) {
    return `${opts.checkIn} ${startDay}${startTime ? ` ${startTime}` : ''} · ${opts.checkOut} ${endDay}${endTime ? ` ${endTime}` : ''}`;
  }
  if (!isMultiDayEvent(ev as Event)) return null;
  return `${opts.firstDay} ${startDay} · ${opts.lastDay} ${endDay}`;
}
