import type { EventCategory } from '@/lib/eventCategories';
import { getCategoryOptionsForKind } from '@/lib/eventCategories';
import { VACATION_QUICK_CATEGORIES } from '@/lib/vacationMode';
import type { CalendarKind } from '@/lib/calendarKinds';
import { translateCategory } from '@/lib/i18n';
import type { AppLocale } from '@/lib/i18n/types';
import { MONTH_COLORS, textOnStrongColor, withAlpha } from '@/lib/monthTheme';

export type CategoryColorToken = 'pink' | 'blue' | 'purple' | 'amber' | 'orange' | 'green' | 'teal' | 'red';

type MainCategory = Exclude<EventCategory, 'other'>;

export type CategoryColorMap = Partial<Record<MainCategory, CategoryColorToken>>;

export const DEFAULT_CATEGORY_COLOR_MAP: Record<MainCategory, CategoryColorToken> = {
  couple: 'pink',
  work: 'blue',
  social: 'purple',
  celebration: 'amber',
  important: 'orange',
  travel: 'teal',
  school: 'green',
  // WORK core hues (+ shared meeting on home)
  meeting: 'amber',
  production: 'green',
  development: 'blue',
  admin: 'purple',
  personal: 'orange',
  // Vacation layer
  beach: 'teal',
  breakfast: 'amber',
  lunch: 'orange',
  dinner: 'red',
  hotel: 'blue',
  outing: 'purple',
  activity: 'green',
  relaxation: 'pink',
  shopping: 'pink',
  practical: 'teal',
  // Legacy
  client: 'teal',
  deadline: 'orange',
  focus: 'purple',
};

/**
 * Month accents. `ink` sits on cream; `onFill` sits on the solid `rail`.
 */
export type CategoryVisuals = {
  /** Light wash for large rows */
  soft: string;
  /** Solid month color for chips and bars */
  rail: string;
  /** Icon on cream paper */
  ink: string;
  /** Picker dot */
  swatch: string;
  /** Icon drawn on `rail` */
  onFill: string;
};

/**
 * Icon choices use the month accents, not a separate pastel set.
 * pink → May, blue → June, purple → February, amber → July,
 * orange → October, green → March, teal → April, red → December.
 */
const TOKEN_MONTH: Record<CategoryColorToken, string> = {
  pink: MONTH_COLORS[4]!,
  blue: MONTH_COLORS[5]!,
  purple: MONTH_COLORS[1]!,
  amber: MONTH_COLORS[6]!,
  orange: MONTH_COLORS[9]!,
  green: MONTH_COLORS[2]!,
  teal: MONTH_COLORS[3]!,
  red: MONTH_COLORS[11]!,
};

function tokenVisuals(token: CategoryColorToken): CategoryVisuals {
  const color = TOKEN_MONTH[token];
  return {
    soft: withAlpha(color, 0.16),
    rail: color,
    ink: color,
    swatch: color,
    onFill: textOnStrongColor(color),
  };
}

/** Soft edge only — no chrome/glass rim. */
export function silverMarkRim(): string {
  return 'none';
}

/** Calendar marks use the solid month color when a rail is set. */
export function categoryMarkFill(soft: string, rail: string): string {
  const fill = rail || soft;
  if (fill.startsWith('hsl')) return fill;
  return fill;
}

/** @deprecated Prefer silverMarkRim — kept for any leftover call sites. */
export function categoryMarkOutline(_ink?: string, _strength?: number): string {
  return silverMarkRim();
}

/** Category tokens → month accent, with a contrasting glyph on the solid fill. */
const TOKEN_PALETTE: Record<CategoryColorToken, CategoryVisuals> = {
  pink: tokenVisuals('pink'),
  blue: tokenVisuals('blue'),
  purple: tokenVisuals('purple'),
  amber: tokenVisuals('amber'),
  orange: tokenVisuals('orange'),
  green: tokenVisuals('green'),
  teal: tokenVisuals('teal'),
  red: tokenVisuals('red'),
};

const OTHER_NEUTRAL: CategoryVisuals = {
  soft: 'hsl(var(--muted))',
  rail: 'hsl(var(--muted))',
  ink: 'hsl(var(--muted-foreground))',
  swatch: 'hsl(var(--muted-foreground))',
  onFill: 'hsl(var(--foreground))',
};

export const COLOR_TOKEN_OPTIONS: CategoryColorToken[] = [
  'pink',
  'blue',
  'purple',
  'amber',
  'orange',
  'green',
  'teal',
  'red',
];

export function getCategoryTokenVisuals(token: CategoryColorToken): CategoryVisuals {
  return TOKEN_PALETTE[token];
}

export function getColorTokenSwatch(token: CategoryColorToken): string {
  return TOKEN_PALETTE[token].swatch;
}

export function resolveCategoryVisuals(
  category: EventCategory | string | null | undefined,
  memberColorMap?: CategoryColorMap | null,
): CategoryVisuals {
  if (!category || category === 'other') return OTHER_NEUTRAL;
  const cat = category as MainCategory;
  if (!(cat in DEFAULT_CATEGORY_COLOR_MAP)) return OTHER_NEUTRAL;
  const token = memberColorMap?.[cat] ?? DEFAULT_CATEGORY_COLOR_MAP[cat];
  return TOKEN_PALETTE[token] ?? TOKEN_PALETTE[DEFAULT_CATEGORY_COLOR_MAP[cat]];
}

export function resolveCategoryLabel(
  category: EventCategory | string | null | undefined,
  categoryLabelOverride?: string | null,
  locale: AppLocale = 'nb',
): string {
  const cat = (category as EventCategory) || 'other';
  if (cat !== 'other') return translateCategory(locale, cat);
  const clean = categoryLabelOverride?.trim();
  return clean ? clean : translateCategory(locale, 'other');
}

/** Read a member's category_color_map from the row (jsonb) */
export function getMemberColorMap(member: { category_color_map?: unknown } | null | undefined): CategoryColorMap | null {
  if (!member) return null;
  const raw = (member as any).category_color_map;
  if (!raw || typeof raw !== 'object') return null;
  return raw as CategoryColorMap;
}

export function getColorableCategoriesForKind(
  kind: CalendarKind | string | null | undefined,
): MainCategory[] {
  const base = getCategoryOptionsForKind(kind).filter((c): c is MainCategory => c !== 'other');
  if (kind === 'work') return base;
  const extra = (VACATION_QUICK_CATEGORIES as readonly string[]).filter(
    (c): c is MainCategory => c !== 'other' && !base.includes(c as MainCategory),
  );
  return [...base, ...extra];
}
