import { useVacationMode } from '@/hooks/useVacationMode';
import { useLocale } from '@/hooks/useLocale';
import { formatVacationRange } from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';
import VacationModeToggle from '@/components/VacationModeToggle';

const VacationModeBanner = () => {
  const { t, locale } = useLocale();
  const vacation = useVacationMode();
  if (!vacation.enabledForCalendar) return null;

  const { snapshot, revealHidden, setRevealHidden } = vacation;
  const period = snapshot.activePeriods[0] ?? snapshot.upcomingPeriod;
  const range = period
    ? formatVacationRange(period.startAt, period.endAt, getIntlLocale(locale), period.timeZone)
    : null;

  const title = snapshot.headlineTitle;
  const heading = snapshot.active
    ? title
      ? t('vacation.bannerNamed', { title })
      : t('vacation.bannerOn')
    : t('vacation.mode');

  return (
    <div className="px-3 pb-2 pt-1 space-y-2">
      <div
        className="rounded-2xl px-3 py-2.5 relative overflow-hidden"
        style={{
          background: snapshot.active
            ? 'linear-gradient(135deg, #CFF7F2 0%, #7EE0D6 40%, #4EB8C8 100%)'
            : 'linear-gradient(135deg, #E8F7FA 0%, #D4EEF4 100%)',
        }}
      >
        <span className="pointer-events-none absolute -right-2 -top-3 text-4xl opacity-40" aria-hidden>
          {snapshot.active ? '☀️' : '🌊'}
        </span>
        <div className="relative flex items-center justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1 pr-1">
            <p className="text-sm font-extrabold text-[#083344] truncate">{heading}</p>
            {snapshot.active && range && (
              <p className="text-[11px] font-medium text-[#0B4A5C]/80 break-words">{range}</p>
            )}
            {snapshot.autoSuppressed && (
              <p className="text-[11px] font-medium text-[#0B4A5C]/80 mt-0.5 break-words leading-snug">{t('vacation.overridden')}</p>
            )}
          </div>
          <div className="shrink-0">
            <VacationModeToggle compact />
          </div>
        </div>
      </div>

      {snapshot.active && (
        <button
          type="button"
          onClick={() => setRevealHidden(!revealHidden)}
          className="w-full text-center text-[12px] font-semibold text-[#0B4A5C] underline underline-offset-2"
        >
          {revealHidden ? t('vacation.hideRest') : t('vacation.showRest')}
        </button>
      )}
    </div>
  );
};

export default VacationModeBanner;
