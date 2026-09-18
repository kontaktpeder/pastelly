import { useVacationMode } from '@/hooks/useVacationMode';
import { useLocale } from '@/hooks/useLocale';
import { formatVacationRange } from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';
import VacationModeToggle from '@/components/VacationModeToggle';

const VacationModeBanner = () => {
  const { t, locale } = useLocale();
  const vacation = useVacationMode();
  if (!vacation.enabledForCalendar || !vacation.snapshot.active) return null;

  const { snapshot, revealHidden, setRevealHidden } = vacation;
  const period = snapshot.activePeriods[0] ?? snapshot.upcomingPeriod;
  const range = period
    ? formatVacationRange(period.startAt, period.endAt, getIntlLocale(locale), period.timeZone)
    : null;
  const title = snapshot.headlineTitle;
  const heading = title
    ? t('vacation.bannerNamed', { title })
    : t('vacation.bannerOn');

  return (
    <div className="px-3 py-1 flex items-center justify-between gap-2 min-w-0">
      <p className="min-w-0 flex-1 text-[11px] font-semibold text-[#0B4A5C] truncate">
        {heading}
        {range ? ` · ${range}` : ''}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setRevealHidden(!revealHidden)}
          className="text-[11px] font-semibold text-[#0B4A5C] underline underline-offset-2"
        >
          {revealHidden ? t('vacation.hideRest') : t('vacation.showRest')}
        </button>
        <VacationModeToggle compact />
      </div>
    </div>
  );
};

export default VacationModeBanner;
