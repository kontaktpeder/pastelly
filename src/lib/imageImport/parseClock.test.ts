import { describe, expect, it } from 'vitest';
import {
  isOvernight,
  parseDayHeader,
  parseRoleAndPlace,
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
    expect(parseDayHeader('Sunday 18')).toBe(18);
    expect(parseDayHeader('18')).toBe(18);
    expect(parseDayHeader('Your schedule 18 Sunday')).toBe(18);
    expect(parseDayHeader('21 Wed')).toBe(21);
    expect(parseDayHeader('18 Sun')).toBe(18);
    expect(parseDayHeader('17 «& Preference: Available')).toBe(17);
    expect(parseDayHeader('22 «& Preference: Available')).toBe(22);
    expect(parseDayHeader('4 October 2026')).toBeNull();
    expect(parseDayHeader('2) ed [XN ]')).toBeNull();
    expect(parseDayHeader('6:00PM -11:00PM')).toBeNull();
    expect(yearFromText('October 2026')).toBe(2026);
    expect(yearFromText('Oct 19-25')).toBeNull();
  });
});

describe('role text', () => {
  it('repairs a misread job title and drops icon junk', () => {
    expect(parseRoleAndPlace('Servitgr, Basso Social Oslo AS ) ed [XN ]')).toEqual({
      title: 'Servitør',
      location: 'Basso Social Oslo AS',
    });
    expect(parseRoleAndPlace('Servitør, Basso Social Oslo AS')).toEqual({
      title: 'Servitør',
      location: 'Basso Social Oslo AS',
    });
  });
});

describe('messy clocks', () => {
  it('reads times without a colon when am/pm is present', () => {
    expect(parseTimeRange('6 00 PM - 11 00 PM')).toEqual({
      startTime: '18:00',
      endTime: '23:00',
    });
    expect(parseTimeRange('600pm-1100pm')).toEqual({
      startTime: '18:00',
      endTime: '23:00',
    });
  });
});
