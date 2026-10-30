import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/types';
import { useLocale } from '@/hooks/useLocale';

function LocalePicker({
  value,
  onChange,
  disabled,
}: {
  value: AppLocale;
  onChange: (locale: AppLocale) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {APP_LOCALES.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className="rounded-lg px-3 py-2.5 text-left text-base font-medium"
          style={
            value === opt.value
              ? {
                  backgroundColor: 'color-mix(in srgb, var(--sheet-accent, hsl(var(--primary))) 16%, transparent)',
                  boxShadow: 'inset 0 0 0 2px var(--sheet-accent, hsl(var(--primary)))',
                  color: 'var(--sheet-accent, hsl(var(--primary)))',
                }
              : { boxShadow: 'inset 0 0 0 1px var(--sheet-rule, hsl(var(--border)))' }
          }
        >
          {opt.nativeLabel}
        </button>
      ))}
    </div>
  );
}

/** App language — lives in Generelt folder */
export function AppLocaleSettings() {
  const { appLocale, setAppLocale, t } = useLocale();
  const mutation = useMutation({
    mutationFn: (next: AppLocale) => setAppLocale(next),
  });

  return (
    <div className="space-y-2">
      <div>
        <p className="text-base font-medium">{t('locale.app')}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{t('locale.appHint')}</p>
      </div>
      <LocalePicker
        value={appLocale}
        disabled={mutation.isPending}
        onChange={(next) => mutation.mutate(next)}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{(mutation.error as Error)?.message}</p>
      )}
    </div>
  );
}

/** Calendar language — lives in Denne kalenderen folder (owners) */
export function CalendarLocaleSettings({
  householdId,
  locale,
  canEdit,
}: {
  householdId: string;
  locale: string | null | undefined;
  canEdit: boolean;
}) {
  const { setCalendarLocale, t } = useLocale();
  const queryClient = useQueryClient();
  const value = (locale === 'en' ? 'en' : 'nb') as AppLocale;

  const mutation = useMutation({
    mutationFn: (next: AppLocale) => setCalendarLocale(householdId, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-household-context'] });
    },
  });

  if (!canEdit) {
    return (
      <div>
        <p className="text-base font-medium">{t('locale.calendar')}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {value === 'en' ? t('locale.en') : t('locale.nb')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-base font-medium">{t('locale.calendar')}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{t('locale.calendarHint')}</p>
      </div>
      <LocalePicker
        value={value}
        disabled={mutation.isPending}
        onChange={(next) => mutation.mutate(next)}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{(mutation.error as Error)?.message}</p>
      )}
    </div>
  );
}
