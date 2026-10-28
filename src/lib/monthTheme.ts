export type MonthTheme = {
  /** Month accent — month name, year, weekdays, grid, day numbers */
  base: string;
  light: string;
  dark: string;
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
const MONTH_COLORS = [
  PASTEL.coral, // Jan — coral (#FF7E6C)
  '#5c30ff', // Feb
  '#09a953', // Mar
  '#40e0d0', // Apr — light turquoise
  '#D63D7A', // May — deeper Bubble-Gum
  '#0212ee', // Jun
  '#a260ff', // Jul
  '#9db812', // Aug
  '#6b270d', // Sep
  '#ff7b30', // Oct
  '#2c9fc7', // Nov
  '#d20001', // Dec
];

/** Sundays use December red; in December they use July purple. */
export function sundayAccentForMonth(monthIndex: number): string {
  return monthIndex === 11 ? MONTH_COLORS[6]! : MONTH_COLORS[11]!;
}

export function sundayAccentForDate(date: Date): string {
  return sundayAccentForMonth(date.getMonth());
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

function relativeLuma(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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

/** Calendar chrome uses `base` as-is; year chips keep a soft wash of the same hue. */
export function getMonthTheme(date: Date): MonthTheme {
  const base = MONTH_COLORS[date.getMonth()]!;
  const paper = PASTEL.calendarPaper;
  const light = mix(base, paper, 0.35);
  const dark = base;
  const textOnStrong = relativeLuma(base) > 0.62 ? PASTEL.ink : '#FFFFFF';
  const textOnLight = base;
  const gradient = light;
  return { base, light, dark, textOnStrong, textOnLight, gradient, paper };
}
