export type CalendarKind = 'home' | 'work';

export const CALENDAR_KINDS: {
  value: CalendarKind;
  label: string;
  defaultName: string;
  description: string;
}[] = [
  {
    value: 'home',
    label: 'Hjem',
    defaultName: 'Hjem',
    description: 'For deg og de nærmeste',
  },
  {
    value: 'work',
    label: 'Jobb',
    defaultName: 'Jobb',
    description: 'For jobb og samarbeid',
  },
];

type KindSource = {
  kind?: string | null;
  show_in_other_calendars?: boolean | null;
};

/** Resolve home|work even if older rows miss `kind`. */
export function resolveCalendarKind(source: KindSource | string | null | undefined): CalendarKind {
  if (source == null || typeof source === 'string') {
    const k = (typeof source === 'string' ? source : '').toLowerCase().trim();
    if (k === 'work' || k === 'jobb') return 'work';
    return 'home';
  }
  const k = (source.kind ?? '').toLowerCase().trim();
  if (k === 'work' || k === 'jobb') return 'work';
  if (k === 'home' || k === 'hjem') return 'home';
  // Missing kind: default home (do not infer from show_in_other_calendars —
  // home can also opt into leak).
  return 'home';
}

export function calendarKindLabel(source: KindSource | string | null | undefined): string {
  return resolveCalendarKind(source) === 'work' ? 'Jobb' : 'Hjem';
}

/** Localized kind label — prefer over calendarKindLabel in UI. */
export function calendarKindLabelLocalized(
  source: KindSource | string | null | undefined,
  t: (key: 'kind.home' | 'kind.work', params?: Record<string, string | number>) => string,
): string {
  return resolveCalendarKind(source) === 'work' ? t('kind.work') : t('kind.home');
}

/** Work defaults on; home can opt in via profile so events can leak both ways. */
export function defaultShowInOtherCalendars(kind: CalendarKind): boolean {
  return kind === 'work';
}
