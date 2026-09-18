import {
  Heart,
  BriefcaseBusiness,
  Users,
  PartyPopper,
  AlertTriangle,
  Plane,
  MoreHorizontal,
  UsersRound,
  Handshake,
  Flag,
  Target,
  ClipboardList,
  User,
  BookOpen,
  Umbrella,
  Coffee,
  Salad,
  UtensilsCrossed,
  BedDouble,
  Mountain,
  Bike,
  Sun,
  ShoppingBag,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import type { CalendarKind } from '@/lib/calendarKinds';
import { resolveCalendarKind } from '@/lib/calendarKinds';
import { VACATION_CATEGORY_OPTIONS } from '@/lib/vacationMode';

export type HomeEventCategory =
  | 'couple'
  | 'work'
  | 'social'
  | 'celebration'
  | 'important'
  | 'travel'
  | 'school'
  | 'meeting'
  | 'other';

/** WORK core–aligned categories for jobbkalender. */
export type WorkEventCategory =
  | 'meeting'
  | 'production'
  | 'development'
  | 'admin'
  | 'personal'
  | 'travel'
  | 'other';

/** Legacy work keys still readable on old events. */
export type LegacyWorkEventCategory = 'client' | 'deadline' | 'focus';

/** Holiday-layer categories — stored on the same events table. */
export type VacationEventCategory =
  | 'beach'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'hotel'
  | 'outing'
  | 'activity'
  | 'relaxation'
  | 'shopping'
  | 'practical';

/** All persisted category keys (home + work + legacy + vacation). */
export type EventCategory =
  | HomeEventCategory
  | WorkEventCategory
  | LegacyWorkEventCategory
  | VacationEventCategory;

export type EventPriority = 'normal' | 'high';

type CategoryMeta = {
  label: string;
  Icon: LucideIcon;
  chipBg: string;
  chipText: string;
  iconColor: string;
};

export const EVENT_CATEGORY_META: Record<EventCategory, CategoryMeta> = {
  couple: {
    label: 'Vi to',
    Icon: Heart,
    chipBg: 'bg-primary/20',
    chipText: 'text-foreground',
    iconColor: 'text-pink-500',
  },
  work: {
    label: 'Jobb',
    Icon: BriefcaseBusiness,
    chipBg: 'bg-calendar-accent/60',
    chipText: 'text-foreground',
    iconColor: 'text-blue-500',
  },
  social: {
    label: 'Sosialt',
    Icon: Users,
    chipBg: 'bg-list-accent/70',
    chipText: 'text-foreground',
    iconColor: 'text-purple-500',
  },
  celebration: {
    label: 'Fest',
    Icon: PartyPopper,
    chipBg: 'bg-member-yellow/60',
    chipText: 'text-foreground',
    iconColor: 'text-amber-500',
  },
  important: {
    label: 'Viktig',
    Icon: AlertTriangle,
    chipBg: 'bg-member-peach/65',
    chipText: 'text-foreground',
    iconColor: 'text-orange-500',
  },
  travel: {
    label: 'Reise',
    Icon: Plane,
    chipBg: 'bg-member-mint/60',
    chipText: 'text-foreground',
    iconColor: 'text-teal-500',
  },
  beach: {
    label: 'Strand og bading',
    Icon: Umbrella,
    chipBg: 'bg-cyan-100',
    chipText: 'text-foreground',
    iconColor: 'text-cyan-600',
  },
  breakfast: {
    label: 'Frokost',
    Icon: Coffee,
    chipBg: 'bg-amber-100',
    chipText: 'text-foreground',
    iconColor: 'text-amber-500',
  },
  lunch: {
    label: 'Lunsj',
    Icon: Salad,
    chipBg: 'bg-orange-100',
    chipText: 'text-foreground',
    iconColor: 'text-orange-500',
  },
  dinner: {
    label: 'Middag / spise ute',
    Icon: UtensilsCrossed,
    chipBg: 'bg-rose-100',
    chipText: 'text-foreground',
    iconColor: 'text-rose-500',
  },
  hotel: {
    label: 'Hotell og overnatting',
    Icon: BedDouble,
    chipBg: 'bg-sky-100',
    chipText: 'text-foreground',
    iconColor: 'text-sky-600',
  },
  outing: {
    label: 'Utflukt og opplevelse',
    Icon: Mountain,
    chipBg: 'bg-violet-100',
    chipText: 'text-foreground',
    iconColor: 'text-violet-500',
  },
  activity: {
    label: 'Aktivitet',
    Icon: Bike,
    chipBg: 'bg-green-100',
    chipText: 'text-foreground',
    iconColor: 'text-green-600',
  },
  relaxation: {
    label: 'Avslapning',
    Icon: Sun,
    chipBg: 'bg-yellow-100',
    chipText: 'text-foreground',
    iconColor: 'text-yellow-500',
  },
  shopping: {
    label: 'Shopping',
    Icon: ShoppingBag,
    chipBg: 'bg-pink-100',
    chipText: 'text-foreground',
    iconColor: 'text-pink-500',
  },
  practical: {
    label: 'Praktisk / reservasjon',
    Icon: Ticket,
    chipBg: 'bg-teal-100',
    chipText: 'text-foreground',
    iconColor: 'text-teal-600',
  },
  school: {
    label: 'Skole',
    Icon: BookOpen,
    chipBg: 'bg-green-100',
    chipText: 'text-foreground',
    iconColor: 'text-green-600',
  },
  meeting: {
    label: 'Møte',
    Icon: Handshake,
    chipBg: 'bg-amber-100',
    chipText: 'text-foreground',
    iconColor: 'text-amber-500',
  },
  production: {
    label: 'Produksjon',
    Icon: BriefcaseBusiness,
    chipBg: 'bg-green-100',
    chipText: 'text-foreground',
    iconColor: 'text-green-500',
  },
  development: {
    label: 'Utvikling',
    Icon: Target,
    chipBg: 'bg-blue-100',
    chipText: 'text-foreground',
    iconColor: 'text-blue-500',
  },
  admin: {
    label: 'Administrasjon',
    Icon: ClipboardList,
    chipBg: 'bg-purple-100',
    chipText: 'text-foreground',
    iconColor: 'text-purple-500',
  },
  personal: {
    label: 'Personlig',
    Icon: User,
    chipBg: 'bg-orange-100',
    chipText: 'text-foreground',
    iconColor: 'text-orange-500',
  },
  // Legacy — still render old events
  client: {
    label: 'Kunde',
    Icon: UsersRound,
    chipBg: 'bg-teal-100',
    chipText: 'text-foreground',
    iconColor: 'text-teal-500',
  },
  deadline: {
    label: 'Frist',
    Icon: Flag,
    chipBg: 'bg-orange-100',
    chipText: 'text-foreground',
    iconColor: 'text-orange-500',
  },
  focus: {
    label: 'Fokus',
    Icon: Target,
    chipBg: 'bg-purple-100',
    chipText: 'text-foreground',
    iconColor: 'text-purple-500',
  },
  other: {
    label: 'Annet',
    Icon: MoreHorizontal,
    chipBg: 'bg-muted',
    chipText: 'text-foreground',
    iconColor: 'text-muted-foreground',
  },
};

export const HOME_CATEGORY_OPTIONS: EventCategory[] = [
  'couple',
  'work',
  'social',
  'celebration',
  'important',
  'travel',
  'school',
  'meeting',
  'other',
];

/** Aligns with WORK core work_types (+ Personlig, Reise). */
export const WORK_CATEGORY_OPTIONS: EventCategory[] = [
  'meeting',
  'production',
  'development',
  'admin',
  'personal',
  'travel',
  'other',
];

/** @deprecated Prefer getCategoryOptionsForKind — kept for callers that assume home. */
export const CATEGORY_OPTIONS = HOME_CATEGORY_OPTIONS;

export const VACATION_ADD_OPTIONS: EventCategory[] = [...VACATION_CATEGORY_OPTIONS];

export function getCategoryOptionsForKind(
  kind: CalendarKind | string | null | undefined,
  opts?: { vacationMode?: boolean },
): EventCategory[] {
  if (opts?.vacationMode && resolveCalendarKind(kind) !== 'work') {
    return VACATION_ADD_OPTIONS;
  }
  return resolveCalendarKind(kind) === 'work'
    ? WORK_CATEGORY_OPTIONS
    : HOME_CATEGORY_OPTIONS;
}

export function getEventCategoryMeta(category: string | null | undefined) {
  if (!category) return null;
  return EVENT_CATEGORY_META[category as EventCategory] ?? null;
}

export function isHighPriority(priority: string | null | undefined) {
  return priority === 'high';
}

/** Sort rank for calendar day marks (lower = earlier). */
export const CATEGORY_SORT_ORDER: Record<string, number> = {
  important: 0,
  deadline: 1,
  work: 2,
  meeting: 3,
  school: 4,
  production: 5,
  development: 6,
  admin: 7,
  personal: 8,
  client: 9,
  focus: 10,
  couple: 11,
  celebration: 12,
  social: 13,
  travel: 14,
  beach: 15,
  breakfast: 16,
  lunch: 17,
  dinner: 18,
  hotel: 19,
  outing: 20,
  activity: 21,
  relaxation: 22,
  shopping: 23,
  practical: 24,
  other: 25,
};
