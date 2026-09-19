import { useState } from 'react';
import { useVacationMode } from '@/hooks/useVacationMode';
import { useLocale } from '@/hooks/useLocale';
import {
  formatVacationDay,
  vacationStayProgress,
} from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';
import CenteredPopup from '@/components/CenteredPopup';
import { tryOpenSheet } from '@/lib/sheetGate';

const VacationModeBanner = ({
  selectedDate,
  variant = 'banner',
}: {
  selectedDate?: Date;
  variant?: 'banner' | 'header';
}) => {
  const { t, locale } = useLocale();
  const vacation = useVacationMode();
  const [sheet, setSheet] = useState(false);
  if (!vacation.enabledForCalendar || !vacation.snapshot.active) return null;

  const period = vacation.snapshot.activePeriods[0] ?? vacation.snapshot.upcomingPeriod;
  const onDate = selectedDate ?? new Date();
  const progress = period ? vacationStayProgress(period, onDate) : null;
  const title = vacation.snapshot.headlineTitle;
  const statusParts = [
    title,
    progress ? t('vacation.dayProgress', { day: progress.day, of: progress.of }) : null,
  ].filter(Boolean);

  const untilDate = period?.endAt
    ?? (vacation.prefs.manualUntil ? new Date(vacation.prefs.manualUntil) : null);
  const untilLabel = untilDate
    ? t('vacation.onUntil', {
        date: formatVacationDay(untilDate, getIntlLocale(locale), period?.timeZone),
      })
    : t('vacation.onUntilManual');

  const openSheet = () => tryOpenSheet(() => setSheet(true));

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={openSheet}
          aria-label={statusParts.length ? `${statusParts.join(' · ')} · ${t('vacation.onShort')}` : t('vacation.onShort')}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#4EB8C8]/80 bg-white px-3 text-[11px] font-semibold tracking-wide text-[#0B4A5C]"
        >
          {t('vacation.onShort')}
        </button>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="w-full px-5 py-1 text-center text-[13px] font-normal text-[#0B4A5C]"
        >
          <span className="block truncate">
            {[...statusParts, t('vacation.onShort')].filter(Boolean).join(' · ')}
          </span>
        </button>
      )}

      {sheet && (
        <CenteredPopup
          onClose={() => setSheet(false)}
          onExit={() => setSheet(false)}
          size="hug"
          zClassName="z-[80]"
        >
          <div className="px-1 py-1">
            {statusParts.length > 0 && (
              <p className="px-4 pb-1 pt-3 text-sm font-medium text-foreground">{statusParts.join(' · ')}</p>
            )}
            <p className={`px-4 pb-2 text-sm text-muted-foreground ${statusParts.length ? 'pt-0' : 'pt-3'}`}>
              {untilLabel}
            </p>
            <button
              type="button"
              onClick={() => vacation.setRevealHidden(!vacation.revealHidden)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
            >
              <span>{t('vacation.showWeekday')}</span>
              <span className="text-muted-foreground">{vacation.revealHidden ? t('vacation.on') : t('vacation.off')}</span>
            </button>
            <button
              type="button"
              onClick={() => vacation.setMuteHiddenNotifications(!vacation.prefs.muteHiddenNotifications)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
            >
              <span>{t('vacation.pauseWorkAlerts')}</span>
              <span className="text-muted-foreground">
                {vacation.prefs.muteHiddenNotifications ? t('vacation.on') : t('vacation.off')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                vacation.turnOff();
                setSheet(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-foreground"
            >
              {t('vacation.turnOffNow')}
            </button>
          </div>
        </CenteredPopup>
      )}
    </>
  );
};

export default VacationModeBanner;
