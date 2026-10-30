export type MonthTheme = {
  /** Month accent — month name, year, weekdays, grid, day numbers */
  base: string;
  light: string;
  dark: string;
  /**
   * Readable label ink on cream paper (≥ 4.5:1). Use for month picker text;
   * keep `base` for chrome / soft fills.
   */
  ink: string;
  /** Soft wash of `base` (~14 %) for picker tiles */
  softTile: string;
  /** Label on `base` chips / strong fills */
  textOnStrong: string;
  /** Label on the soft calendar month wash */
  textOnLight: string;
  gradient: string;
  /** Calendar sheet background for this month */
  paper: string;
};

/**
 * Shared pastels for events and paper. Month chrome uses MONTH_COLORS.
 */
export const PASTEL = {
  mustard: "#F5B832",
  periwinkle: "#8FA0F0",
  cream: "#F5C4A0",
  teal: "#4EB8C8",
  coral: "#FF7E6C",
  sage: "#8FDC7A",
  blush: "#FFA0B8",
  /** Clean white — pastels read clearer than on warm cream */
  paper: "#FFFFFF",
  /** Soft cream wash for the whole calendar shell */
  calendarPaper: "#F9F4E8",
  ink: "#3A2A38",
} as const;

/**
 * One accent per month (Jan→Dec).
 * Pale palette tones (Jan/Mar/Jun/Aug/Sep/Oct/Dec) swapped to deep
 * counterparts so cream paper keeps strong contrast; the rest deepened too.
 */
export const MONTH_COLORS = [
  '#a10b56', // Jan
  '#a260ff', // Feb — was July
  '#09a953', // Mar
  '#40e0d0', // Apr — light turquoise
  '#FA008A', // May — Pantone 17-2435 TN Pink Glo
  '#0212ee', // Jun
  '#edb900', // Jul
  '#9db812', // Aug
  '#6b270d', // Sep
  '#ff7b30', // Oct
  '#2c9fc7', // Nov
  '#d20001', // Dec
];

/** Sunday weekday label color — December red; in December use July accent. */
export function sundayAccentForMonth(monthIndex: number): string {
  return monthIndex === 11 ? MONTH_COLORS[6]! : MONTH_COLORS[11]!;
}

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const n = parseInt(value, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function mix(hexA: string, hexB: string, amount: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    Math.round(a.r + (b.r - a.r) * t),
    Math.round(a.g + (b.g - a.g) * t),
    Math.round(a.b + (b.b - a.b) * t),
  );
}

function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(a: string, b: string): number {
  const luma = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
  };
  const hi = Math.max(luma(a), luma(b));
  const lo = Math.min(luma(a), luma(b));
  return (hi + 0.05) / (lo + 0.05);
}

/** White when it stays readable, otherwise ink darkened until it clears 4.5:1. */
export function textOnStrongColor(fill: string): string {
  if (contrastRatio(fill, '#FFFFFF') >= 4.5) return '#FFFFFF';
  if (contrastRatio(fill, PASTEL.ink) >= 4.5) return PASTEL.ink;
  for (let t = 0.2; t <= 1; t += 0.1) {
    const next = mix(PASTEL.ink, '#000000', t);
    if (contrastRatio(fill, next) >= 4.5) return next;
  }
  return '#000000';
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** Same hue as the fill, shaded like month-overview labels. */
export function shadeInk(fill: string): string {
  return mix(fill, PASTEL.ink, 0.46);
}

/**
 * Knæsj same-hue accent — soft fill stays pastel; icon almost lights up.
 */
export function punchInk(fill: string): string {
  const { r, g, b } = hexToRgb(fill);
  const { h, s, l } = rgbToHsl(r, g, b);
  const nextS = Math.min(0.9, Math.max(s * 2.15, 0.68));
  const nextL = Math.min(0.42, Math.max(0.3, l * 0.48));
  const out = hslToRgb(h, nextS, nextL);
  return rgbToHex(out.r, out.g, out.b);
}

/** Always white month labels on pastel bands. */
export function textOnFill(_fill: string): string {
  return "#FFFFFF";
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Keep saturated fill when contrast vs paper clears `minRatio` (default 3:1 —
 * large bold month labels). Darken only until the ratio is met.
 */
export function readableInkOnPaper(
  fill: string,
  paper: string = PASTEL.calendarPaper,
  minRatio = 3,
): string {
  if (contrastRatio(fill, paper) >= minRatio) return fill;
  let best = shadeInk(fill);
  if (contrastRatio(best, paper) >= minRatio) return best;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const next = mix(fill, '#000000', t);
    if (contrastRatio(next, paper) >= minRatio) return next;
    best = next;
  }
  return best;
}

/** Calendar chrome uses `base` as-is; picker labels use darker `ink` on cream. */
export function getMonthTheme(date: Date): MonthTheme {
  const base = MONTH_COLORS[date.getMonth()]!;
  const paper = PASTEL.calendarPaper;
  const light = mix(base, paper, 0.35);
  const dark = base;
  const ink = readableInkOnPaper(base, paper);
  const softTile = withAlpha(base, 0.14);
  const textOnStrong = textOnStrongColor(base);
  const textOnLight = base;
  const gradient = light;
  return { base, light, dark, ink, softTile, textOnStrong, textOnLight, gradient, paper };
}
