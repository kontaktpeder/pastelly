import { addDays, format } from 'date-fns';
import { DAY_PART_ORDER, timeRangeToDayParts } from '@/lib/dayParts';
import type { EventCategory } from '@/lib/eventCategories';

export type VacationCategoryTiming = {
  startTime: string;
  endTime: string;
  /** Hotel-style stay: nights after the check-in day. */
  nights?: number;
};

/**
 * Standard times in vacation mode. The user can change them afterwards.
 * Breakfast 09, dinner/eating out 19 — the rest follow a typical holiday day.
 */
export const VACATION_CATEGORY_TIMING: Record<string, VacationCategoryTiming> = {
  breakfast: { startTime: '09:00', endTime: '10:00' },
  lunch: { startTime: '13:00', endTime: '14:00' },
  dinner: { startTime: '19:00', endTime: '21:00' },
  beach: { startTime: '11:00', endTime: '16:00' },
  outing: { startTime: '10:00', endTime: '15:00' },
  activity: { startTime: '10:00', endTime: '12:00' },
  relaxation: { startTime: '16:00', endTime: '18:00' },
  shopping: { startTime: '14:00', endTime: '16:00' },
  practical: { startTime: '10:00', endTime: '11:00' },
  travel: { startTime: '08:00', endTime: '12:00' },
  hotel: { startTime: '15:00', endTime: '11:00', nights: 1 },
};

export function isHotelCategory(category: string | null | undefined): boolean {
  return category === 'hotel';
}

export function vacationCategoryTiming(
  category: string | null | undefined,
): VacationCategoryTiming | null {
  if (!category) return null;
  return VACATION_CATEGORY_TIMING[category] ?? null;
}

export function applyVacationCategoryTiming(
  category: string,
  current: { startDate: Date; endDate: Date | null },
): {
  startTime: string;
  endTime: string;
  endDate: Date | null;
  dayParts: [number, number];
  timedStay: boolean;
} | null {
  const timing = vacationCategoryTiming(category);
  if (!timing) return null;
  const endDate =
    timing.nights && !current.endDate
      ? addDays(current.startDate, timing.nights)
      : current.endDate;
  return {
    startTime: timing.startTime,
    endTime: timing.endTime,
    endDate,
    dayParts: timeRangeToDayParts(timing.startTime, timing.endTime),
    timedStay: !!timing.nights || !!endDate,
  };
}

export function vacationQuickAddPayload(category: EventCategory, date: Date) {
  const timing = vacationCategoryTiming(category) ?? {
    startTime: '12:00',
    endTime: '13:00',
  };
  const eventDate = format(date, 'yyyy-MM-dd');
  const endDate = timing.nights
    ? format(addDays(date, timing.nights), 'yyyy-MM-dd')
    : eventDate;
  const [startIdx, endIdx] = timeRangeToDayParts(timing.startTime, timing.endTime);
  const startPart = DAY_PART_ORDER[startIdx] || 'afternoon';
  const endPart = DAY_PART_ORDER[endIdx] || startPart;
  return {
    event_date: eventDate,
    end_date: endDate,
    start_time: timing.startTime,
    end_time: timing.endTime,
    day_part: startPart === 'all_day' || startPart === 'full_diem' ? 'afternoon' : startPart,
    day_part_start: startPart,
    day_part_end: endPart,
  };
}
