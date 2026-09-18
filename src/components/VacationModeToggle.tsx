import { useState } from 'react';
import { format } from 'date-fns';
import { useVacationMode, endOfLocalDateIso } from '@/hooks/useVacationMode';
import { useLocale } from '@/hooks/useLocale';
import { formatVacationRange } from '@/lib/vacationMode';
import { startOfNextWorkdayMs } from '@/lib/timeZone';
import { getIntlLocale } from '@/lib/i18n';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';

const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary w-full';

interface VacationModeToggleProps {
  compact?: boolean;
}

const VacationModeToggle = ({ compact = false }: VacationModeToggleProps) => {
  const { t, locale, dateLocale } = useLocale();
  const vacation = useVacationMode();
  const [sheet, setSheet] = useState(false);
  const [untilDate, setUntilDate] = useState(() => new Date());
  const [pickedCountdown, setPickedCountdown] = useState<string | null>(null);

  if (!vacation.enabledForCalendar) return null;

  const active = vacation.snapshot.active;
  const holidayPeriods = vacation.periods;

  const applyOn = (until: string | null, source: 'now' | 'until_date' | 'until_workday' | 'countdown', countdownId?: string) => {
    vacation.turnOn({ until, source, countdownId });
    setSheet(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (active) vacation.turnOff();
          else setSheet(true);
        }}
        className={
          compact
            ? 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide'
            : 'flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5'
        }
        style={{
          background: active
            ? 'linear-gradient(135deg, #7EE0D6 0%, #4EB8C8 55%, #2A7CA8 100%)'
            : compact
              ? 'rgba(255,255,255,0.72)'
              : 'hsl(var(--muted))',
          color: active ? '#083344' : undefined,
        }}
        aria-pressed={active}
      >
        <span className={compact ? '' : 'text-sm font-semibold'}>
          {compact ? t('vacation.mode') : t('vacation.toggle')}
        </span>
        <span className={`font-bold ${compact ? '' : 'text-sm'}`}>
          {active ? t('vacation.on') : t('vacation.off')}
        </span>
      </button>

      {sheet && (
        <CenteredPopup onClose={() => setSheet(false)} onExit={() => setSheet(false)} size="sheet" zClassName="z-[80]">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 pb-4" data-sheet-scroll>
            <h2 className="text-xl font-bold text-center">{t('vacation.turnOn')}</h2>
            <p className="text-sm text-muted-foreground text-center mt-1 mb-4">{t('vacation.layerHint')}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('vacation.chooseHowLong')}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => applyOn(null, 'now')}
                className="w-full text-left rounded-2xl bg-muted p-4"
              >
                <p className="font-semibold">{t('vacation.justNow')}</p>
                <p className="text-sm text-muted-foreground">{t('vacation.justNowHint')}</p>
              </button>

              <div className="rounded-2xl bg-muted p-4 space-y-3">
                <p className="font-semibold">{t('vacation.untilDate')}</p>
                <input
                  type="date"
                  className={FIELD}
                  value={format(untilDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    if (y && m && d) setUntilDate(new Date(y, m - 1, d));
                  }}
                />
                <button
                  type="button"
                  onClick={() => applyOn(endOfLocalDateIso(untilDate, vacation.timeZone), 'until_date')}
                  className="w-full rounded-xl bg-cyan-200 text-cyan-950 py-2.5 text-sm font-semibold"
                >
                  {t('vacation.untilDate')}
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  applyOn(
                    new Date(startOfNextWorkdayMs(new Date(), vacation.timeZone)).toISOString(),
                    'until_workday',
                  )
                }
                className="w-full text-left rounded-2xl bg-muted p-4"
              >
                <p className="font-semibold">{t('vacation.untilWorkday')}</p>
              </button>

              <div className="rounded-2xl bg-muted p-4 space-y-2">
                <p className="font-semibold">{t('vacation.useCountdown')}</p>
                {holidayPeriods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('vacation.noCountdowns')}</p>
                ) : (
                  holidayPeriods.map((p) => {
                    const range = formatVacationRange(
                      p.startAt,
                      p.endAt,
                      getIntlLocale(locale),
                      p.timeZone,
                    );
                    const selected = pickedCountdown === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPickedCountdown(p.id);
                          applyOn(p.endAt.toISOString(), 'countdown', p.id);
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2.5 ${
                          selected ? 'bg-cyan-200 ring-2 ring-cyan-400' : 'bg-background'
                        }`}
                      >
                        <p className="text-sm font-semibold">{p.title}</p>
                        <p className="text-xs text-muted-foreground">{range}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <label className="mt-4 flex items-start gap-3 rounded-2xl bg-muted/70 p-4 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-cyan-700"
                checked={vacation.prefs.muteHiddenNotifications}
                onChange={(e) => vacation.setMuteHiddenNotifications(e.target.checked)}
              />
              <span>
                <span className="block font-semibold text-sm">{t('vacation.muteHidden')}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {t('vacation.muteHiddenHint')}
                </span>
              </span>
            </label>
          </div>
          <PopupStickyFooter>
            <button
              type="button"
              onClick={() => setSheet(false)}
              className="w-full py-2 text-sm font-medium text-muted-foreground underline underline-offset-2"
            >
              {t('common.cancel')}
            </button>
          </PopupStickyFooter>
        </CenteredPopup>
      )}
    </>
  );
};

export default VacationModeToggle;
