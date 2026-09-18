import { Umbrella } from 'lucide-react';
import { useVacationMode } from '@/hooks/useVacationMode';
import { useLocale } from '@/hooks/useLocale';

const VacationModeBanner = () => {
  const { t } = useLocale();
  const vacation = useVacationMode();
  if (!vacation.enabledForCalendar || !vacation.snapshot.active) return null;

  const { revealHidden, setRevealHidden } = vacation;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[#0B4A5C]">
        <Umbrella size={14} strokeWidth={2.4} className="shrink-0" aria-hidden />
        <span className="truncate">{t('vacation.bannerOn')}</span>
      </p>
      <button
        type="button"
        onClick={() => setRevealHidden(!revealHidden)}
        className="shrink-0 text-[13px] font-semibold text-[#2A7CA8] underline underline-offset-2"
      >
        {revealHidden ? t('vacation.hideRest') : t('vacation.showRest')}
      </button>
    </div>
  );
};

export default VacationModeBanner;
