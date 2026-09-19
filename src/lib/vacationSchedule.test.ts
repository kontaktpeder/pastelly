import { describe, expect, it } from 'vitest';
import {
  applyVacationCategoryTiming,
  vacationCategoryTiming,
  vacationQuickAddPayload,
} from './vacationSchedule';

describe('vacation category times', () => {
  it('uses 09:00 for breakfast and 19:00 for dinner', () => {
    expect(vacationCategoryTiming('breakfast')).toEqual({
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(vacationCategoryTiming('dinner')).toEqual({
      startTime: '19:00',
      endTime: '21:00',
    });
  });

  it('makes hotel a timed stay from check-in to the next day', () => {
    const patch = applyVacationCategoryTiming('hotel', {
      startDate: new Date(2026, 8, 14),
      endDate: null,
    });
    expect(patch?.startTime).toBe('15:00');
    expect(patch?.endTime).toBe('11:00');
    expect(patch?.endDate).toEqual(new Date(2026, 8, 15));
    expect(patch?.timedStay).toBe(true);
  });

  it('keeps an already chosen last day for hotel', () => {
    const last = new Date(2026, 8, 20);
    const patch = applyVacationCategoryTiming('hotel', {
      startDate: new Date(2026, 8, 14),
      endDate: last,
    });
    expect(patch?.endDate).toBe(last);
  });

  it('builds a quick-add dinner on the selected day', () => {
    const payload = vacationQuickAddPayload('dinner', new Date(2026, 8, 18));
    expect(payload.event_date).toBe('2026-09-18');
    expect(payload.start_time).toBe('19:00');
    expect(payload.end_time).toBe('21:00');
  });
});
