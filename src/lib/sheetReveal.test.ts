import { describe, expect, it } from 'vitest';
import { sheetYToReveal } from './sheetMotion';

describe('sheetYToReveal', () => {
  const frameH = 1000;
  const halfY = Math.round(frameH * 0.45);

  it('stays at half when every event already fits there', () => {
    expect(sheetYToReveal(frameH, 200)).toBe(halfY);
    expect(sheetYToReveal(frameH, frameH - halfY)).toBe(halfY);
  });

  it('rolls up only as far as the events need', () => {
    expect(sheetYToReveal(frameH, 700)).toBe(300);
  });

  it('stops at full and leaves the rest to scroll', () => {
    expect(sheetYToReveal(frameH, 1000)).toBe(0);
    expect(sheetYToReveal(frameH, 1400)).toBe(0);
  });

  it('rounds the needed height up so the last row is not clipped', () => {
    expect(sheetYToReveal(frameH, 700.2)).toBe(299);
  });
});
