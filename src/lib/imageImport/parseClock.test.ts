import { describe, expect, it } from 'vitest';
import {
  isOvernight,
  parseDayHeader,
  parseTimeRange,
  yearFromText,
} from './parseClock';

describe('parseTimeRange', () => {
  it('reads 12-hour shift times', () => {
    expect(parseTimeRange('6:00 PM - 11:00 PM')).toEqual({
      startTime: '18:00',
      endTime: '23:00',
    });
    expect(parseTimeRange('6:00pm-10:00pm')).toEqual({
      startTime: '18:00',
      endTime: '22:00',
    });
  });

  it('treats 12:00am as midnight', () => {
    expect(parseTimeRange('6:00pm-12:00am')).toEqual({
      startTime: '18:00',
      endTime: '00:00',
    });
    expect(isOvernight('18:00', '00:00')).toBe(true);
  });
});

describe('headers', () => {
  it('reads day + weekday and year', () => {
    expect(parseDayHeader('18 Sunday')).toBe(18);
    expect(parseDayHeader('19 Monday')).toBe(19);
    expect(yearFromText('October 2026')).toBe(2026);
    expect(yearFromText('Oct 19-25')).toBeNull();
  });
});
