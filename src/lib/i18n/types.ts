export type AppLocale = 'nb' | 'en';

export const APP_LOCALES: { value: AppLocale; label: string; nativeLabel: string }[] = [
  { value: 'nb', label: 'Norwegian', nativeLabel: 'Norsk' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
];

export function resolveAppLocale(value: string | null | undefined): AppLocale {
  const v = (value ?? '').toLowerCase().trim();
  if (v === 'nb' || v.startsWith('nb') || v === 'no' || v.startsWith('nor')) return 'nb';
  if (v === 'en' || v.startsWith('en')) return 'en';
  // Default for first launch / unknown values: English
  return 'en';
}

/**
 * Locale for a newly created calendar.
 * Prefer the language the user just chose (app locale); fall back to English.
 */
export function defaultLocaleForKind(
  _kind: string | null | undefined,
  preferred?: AppLocale | string | null,
): AppLocale {
  if (preferred) return resolveAppLocale(preferred);
  return 'en';
}

/**
 * effective = calendar locale if set, else app locale, else English.
 * Pass calendarLocale from households.locale.
 */
export function resolveEffectiveLocale(
  calendarLocale: string | null | undefined,
  appLocale: string | null | undefined,
): AppLocale {
  if (calendarLocale) return resolveAppLocale(calendarLocale);
  if (appLocale) return resolveAppLocale(appLocale);
  return 'en';
}

export const APP_LOCALE_STORAGE_KEY = 'pastelly_app_locale';
