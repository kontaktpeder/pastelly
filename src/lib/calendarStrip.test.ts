import { addMonths, addWeeks, startOfMonth, startOfWeek } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  applyCalendarStripChange,
  calendarStripAnchor,
  resolveVacationFocusDate,
  weekOverlapsYmd,
} from './calendarStrip';

const monday = { weekStartsOn: 1 as const };

describe('applyCalendarStripChange', () => {
  it('lets a week swipe move off the month-start week', () => {
    const prev = new Date(2026, 8, 18);
    const next = applyCalendarStripChange(prev, (d) => addWeeks(d, 1), true);
    expect(calendarStripAnchor(next, true).getTime()).toBe(
      startOfWeek(new Date(2026, 8, 21), monday).getTime(),
    );
    expect(next.getDate()).toBe(25);
  });

  it('does not no-op the way month-anchored week swipes did', () => {
    const prev = new Date(2026, 8, 18);
    const broken = (() => {
      const anchor = startOfMonth(prev);
      const nextAnchor = addWeeks(anchor, 1);
      const y = nextAnchor.getFullYear();
      const m = nextAnchor.getMonth();
      const lastDay = new Date(y, m + 1, 0).getDate();
      const day = Math.min(prev.getDate(), lastDay);
      return new Date(y, m, day);
    })();
    expect(startOfMonth(broken).getTime()).toBe(startOfMonth(prev).getTime());

    const fixed = applyCalendarStripChange(prev, (d) => addWeeks(d, 1), true);
    expect(startOfWeek(fixed, monday).getTime()).not.toBe(
      startOfWeek(startOfMonth(prev), monday).getTime(),
    );
  });

  it('keeps the focused day of month when swiping months', () => {
    const prev = new Date(2026, 0, 31);
    const next = applyCalendarStripChange(prev, (d) => addMonths(d, 1), false);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it('uses a direct week jump as the focused day', () => {
    const prev = new Date(2026, 8, 1);
    const jumped = new Date(2026, 8, 18);
    expect(applyCalendarStripChange(prev, jumped, true).getTime()).toBe(jumped.getTime());
  });
});

describe('resolveVacationFocusDate', () => {
  const range = { start: '2026-09-10', end: '2026-09-24' };

  it('keeps a focused day whose week already overlaps the trip', () => {
    const current = new Date(2026, 8, 16);
    const today = new Date(2026, 8, 10);
    expect(resolveVacationFocusDate(current, range, today).getTime()).toBe(current.getTime());
  });

  it('jumps from the month-start week to today when today is in the trip', () => {
    const current = new Date(2026, 8, 1);
    const today = new Date(2026, 8, 18);
    const next = resolveVacationFocusDate(current, range, today);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(8);
    expect(next.getDate()).toBe(18);
  });

  it('lands on the trip start when neither current nor today overlap', () => {
    const current = new Date(2026, 7, 1);
    const today = new Date(2026, 7, 20);
    const next = resolveVacationFocusDate(current, range, today);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(8);
    expect(next.getDate()).toBe(10);
  });
});

describe('weekOverlapsYmd', () => {
  it('treats a week as visible when any day sits in the trip', () => {
    const weekStart = startOfWeek(new Date(2026, 8, 7), monday);
    expect(weekOverlapsYmd(weekStart, { start: '2026-09-10', end: '2026-09-24' })).toBe(true);
    expect(weekOverlapsYmd(weekStart, { start: '2026-09-20', end: '2026-09-24' })).toBe(false);
  });
});
