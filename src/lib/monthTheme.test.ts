import { describe, expect, it } from 'vitest';
import { getMonthTheme } from './monthTheme';

function contrast(a: string, b: string): number {
  const lin = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luma = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const hi = Math.max(luma(a), luma(b));
  const lo = Math.min(luma(a), luma(b));
  return (hi + 0.05) / (lo + 0.05);
}

describe('month label on strong fills', () => {
  it('keeps button text readable on every month color', () => {
    for (let month = 0; month < 12; month += 1) {
      const theme = getMonthTheme(new Date(2026, month, 1));
      expect(contrast(theme.base, theme.textOnStrong)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
