import { MONTH_COLORS, textOnStrongColor, withAlpha } from '@/lib/monthTheme';

/** Same month accents as the category tokens, kept as member color names. */
const MEMBER_HEX: Record<string, string> = {
  'pastel-blue': MONTH_COLORS[5]!,
  'pastel-peach': MONTH_COLORS[9]!,
  'pastel-lavender': MONTH_COLORS[1]!,
  'pastel-mint': MONTH_COLORS[3]!,
  'pastel-rose': MONTH_COLORS[4]!,
  'pastel-yellow': MONTH_COLORS[6]!,
};

/** Solid fill, contrasting letter, and a light wash for larger rows. */
export function memberAccent(token: string | null | undefined) {
  const fill = MEMBER_HEX[token ?? ''] ?? MEMBER_HEX['pastel-blue']!;
  return { fill, text: textOnStrongColor(fill), wash: withAlpha(fill, 0.16) };
}

export const MEMBER_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'pastel-blue': { bg: 'bg-member-blue', text: 'text-foreground', dot: 'bg-member-blue' },
  'pastel-peach': { bg: 'bg-member-peach', text: 'text-foreground', dot: 'bg-member-peach' },
  'pastel-lavender': { bg: 'bg-member-lavender', text: 'text-foreground', dot: 'bg-member-lavender' },
  'pastel-mint': { bg: 'bg-member-mint', text: 'text-foreground', dot: 'bg-member-mint' },
  'pastel-rose': { bg: 'bg-member-rose', text: 'text-foreground', dot: 'bg-member-rose' },
  'pastel-yellow': { bg: 'bg-member-yellow', text: 'text-foreground', dot: 'bg-member-yellow' },
};

export const COLOR_TOKEN_OPTIONS = [
  'pastel-blue',
  'pastel-peach',
  'pastel-lavender',
  'pastel-mint',
  'pastel-rose',
  'pastel-yellow',
] as const;

export const DAY_PART_LABELS: Record<string, string> = {
  morning: 'Morgen',
  late_morning: 'Formiddag',
  afternoon: 'Ettermiddag',
  evening: 'Kveld',
  night: 'Natt',
  full_diem: 'Hele døgnet',
  all_day: 'Hele dagen',
};

export const DAY_PART_COLORS: Record<string, string> = {
  morning: 'bg-daypart-morning',
  late_morning: 'bg-daypart-late-morning',
  afternoon: 'bg-daypart-afternoon',
  evening: 'bg-daypart-evening',
  night: 'bg-daypart-night',
};

export function getMemberColor(token: string) {
  return MEMBER_COLORS[token] || MEMBER_COLORS['pastel-blue'];
}
