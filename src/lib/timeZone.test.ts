import { describe, expect, it } from 'vitest';
import {
  getZonedParts,
  zonedLocalToUtcMs,
  zonedDateAndTimeToIso,
  civilDateAndTimeFromInstant,
  startOfNextWorkdayMs,
  calendarDaysBetweenZoned,
  resolveTimeZone,
} from './timeZone';

describe('timeZone', () => {
  it('resolves invalid zones to Europe/Oslo', () => {
    expect(resolveTimeZone('Not/AZone')).toBe('Europe/Oslo');
    expect(resolveTimeZone('')).toBe('Europe/Oslo');
  });

  it('converts Oslo winter civil time to UTC', () => {
    // 15 Jan 2026 08:00 Europe/Oslo = 07:00 UTC (CET)
    const ms = zonedLocalToUtcMs(2026, 1, 15, 8, 0, 0, 'Europe/Oslo');
    expect(new Date(ms).toISOString()).toBe('2026-01-15T07:00:00.000Z');
  });

  it('converts Oslo summer civil time to UTC', () => {
    // 15 Jul 2026 08:00 Europe/Oslo = 06:00 UTC (CEST)
    const ms = zonedLocalToUtcMs(2026, 7, 15, 8, 0, 0, 'Europe/Oslo');
    expect(new Date(ms).toISOString()).toBe('2026-07-15T06:00:00.000Z');
  });

  it('converts Madrid civil time independently of the host offset', () => {
    const ms = zonedLocalToUtcMs(2026, 10, 3, 8, 0, 0, 'Europe/Madrid');
    const parts = getZonedParts(new Date(ms), 'Europe/Madrid');
    expect(parts.dateStr).toBe('2026-10-03');
    expect(parts.hour).toBe(8);
    expect(parts.minute).toBe(0);
  });

  it('next workday from Wednesday is Thursday 00:00', () => {
    const wed = new Date('2026-10-07T15:00:00+02:00'); // Wed in Oslo (CEST)
    const next = startOfNextWorkdayMs(wed, 'Europe/Oslo');
    const parts = getZonedParts(new Date(next), 'Europe/Oslo');
    expect(parts.dateStr).toBe('2026-10-08');
    expect(parts.hour).toBe(0);
    expect(parts.weekday).toBe(4);
  });

  it('next workday from Friday is Monday', () => {
    const fri = new Date('2026-10-09T15:00:00+02:00');
    const next = startOfNextWorkdayMs(fri, 'Europe/Oslo');
    const parts = getZonedParts(new Date(next), 'Europe/Oslo');
    expect(parts.dateStr).toBe('2026-10-12');
    expect(parts.weekday).toBe(1);
  });

  it('next workday from Saturday is Monday', () => {
    const sat = new Date('2026-10-10T12:00:00+02:00');
    const next = startOfNextWorkdayMs(sat, 'Europe/Oslo');
    const parts = getZonedParts(new Date(next), 'Europe/Oslo');
    expect(parts.dateStr).toBe('2026-10-12');
  });

  it('counts calendar days in a destination zone', () => {
    const now = new Date('2026-09-19T10:00:00+02:00');
    const start = new Date('2026-10-03T06:00:00.000Z'); // 08:00 Madrid
    expect(calendarDaysBetweenZoned(now, start, 'Europe/Madrid')).toBe(14);
  });

  it('seeds countdown edit fields in the destination zone so save-without-change is a no-op', () => {
    const iso = '2026-10-03T06:00:00.000Z'; // 08:00 Europe/Madrid
    const instant = new Date(iso);
    const bali = getZonedParts(instant, 'Asia/Makassar');
    expect(bali.hour).toBe(14);

    const wall = civilDateAndTimeFromInstant(instant, 'Europe/Madrid');
    expect(wall.timeHm).toBe('08:00');
    expect(zonedDateAndTimeToIso(wall.date, wall.timeHm, 'Europe/Madrid')).toBe(iso);

    const endIso = '2026-10-15T21:59:59.000Z';
    const endWall = civilDateAndTimeFromInstant(new Date(endIso), 'Europe/Madrid');
    expect(endWall.timeHm).toBe('23:59');
    expect(zonedDateAndTimeToIso(endWall.date, endWall.timeHm, 'Europe/Madrid')).toBe(
      '2026-10-15T21:59:00.000Z',
    );
  });
});
