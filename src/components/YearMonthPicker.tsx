import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CenteredPopup from '@/components/CenteredPopup';
import { getMonthTheme, PASTEL } from '@/lib/monthTheme';
import { useLocale } from '@/hooks/useLocale';

type PickerMode = 'month' | 'year';

type YearMonthPickerProps = {
  /** Month the calendar was showing when the picker opened. */
  year: number;
  month: number;
  onJumpToMonth: (date: Date) => void | Promise<void>;
  onClose: () => void;
};

/** Warm gray on calendar cream — year chrome + Today. */
const PICKER_GRAY = '#6B6560';

const EASE = [0.32, 0.72, 0, 1] as const;
const SLIDE_MS = 0.2;
const TITLE_YEAR_CLASS =
  'font-digits text-[2.85rem] font-black tabular-nums leading-none tracking-tighter';
const TITLE_DECADE_CLASS =
  'font-digits text-[1.7rem] font-black tabular-nums leading-none tracking-tighter';

function decadeStartFor(y: number) {
  return Math.floor(y / 12) * 12;
}

/**
 * Month/year picker as a fixed half sheet (swipe dismiss, no full expand).
 * Month labels keep calendar colors; year chrome + Today use fixed gray.
 */
const YearMonthPicker = ({ year, month, onJumpToMonth, onClose }: YearMonthPickerProps) => {
  const { dateLocale, t } = useLocale();
  const now = new Date();

  const [mode, setMode] = useState<PickerMode>('month');
  const [viewYear, setViewYear] = useState(year);
  const [decadeStart, setDecadeStart] = useState(() => decadeStartFor(year));
  const [pageDir, setPageDir] = useState(0);
  const busyRef = useRef(false);

  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  const goMonthMode = (nextYear: number) => {
    setViewYear(nextYear);
    setMode('month');
  };

  const goYearMode = () => {
    setDecadeStart(decadeStartFor(viewYear));
    setMode('year');
  };

  const pageYear = (dir: -1 | 1) => {
    setPageDir(dir);
    setViewYear((y) => y + dir);
    window.setTimeout(() => setPageDir(0), SLIDE_MS * 1000 + 20);
  };

  const pageDecade = (dir: -1 | 1) => {
    setPageDir(dir);
    setDecadeStart((s) => s + dir * 12);
    window.setTimeout(() => setPageDir(0), SLIDE_MS * 1000 + 20);
  };

  const commit = async (d: Date) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await onJumpToMonth(d);
      onClose();
    } finally {
      busyRef.current = false;
    }
  };

  const selectMonth = (m: number) => {
    void commit(new Date(viewYear, m, 1));
  };

  const goToday = () => {
    void commit(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const slideX = pageDir === 0 ? 0 : pageDir * 24;

  return (
    <CenteredPopup
      variant="half"
      onClose={onClose}
      onExit={onClose}
      zClassName="z-[55]"
      chrome={{ paper: PASTEL.calendarPaper, accent: PICKER_GRAY }}
    >
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2" style={{ color: PICKER_GRAY }}>
        <div className="flex shrink-0 items-center justify-between px-1 pb-2 pt-1">
          <button
            type="button"
            onClick={() => (mode === 'month' ? pageYear(-1) : pageDecade(-1))}
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-black/5"
            aria-label={t('picker.prev')}
          >
            <ChevronLeft size={26} strokeWidth={2.4} style={{ color: PICKER_GRAY }} />
          </button>

          {mode === 'month' ? (
            <button
              type="button"
              onClick={goYearMode}
              className="flex min-h-11 items-center gap-1 px-2"
              aria-label={t('picker.zoomOutYears')}
            >
              <motion.span
                className={TITLE_YEAR_CLASS}
                style={{ color: PICKER_GRAY }}
                animate={{ x: slideX, opacity: pageDir === 0 ? 1 : 0.35 }}
                transition={{ duration: SLIDE_MS, ease: EASE }}
              >
                {viewYear}
              </motion.span>
              <ChevronDown
                size={22}
                strokeWidth={2.6}
                className="mt-1 opacity-70"
                style={{ color: PICKER_GRAY }}
              />
            </button>
          ) : (
            <motion.span
              className={TITLE_DECADE_CLASS}
              style={{ color: PICKER_GRAY }}
              animate={{ x: slideX, opacity: pageDir === 0 ? 1 : 0.35 }}
              transition={{ duration: SLIDE_MS, ease: EASE }}
            >
              {decadeStart}–{decadeStart + 11}
            </motion.span>
          )}

          <button
            type="button"
            onClick={() => (mode === 'month' ? pageYear(1) : pageDecade(1))}
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-black/5"
            aria-label={t('picker.next')}
          >
            <ChevronRight size={26} strokeWidth={2.4} style={{ color: PICKER_GRAY }} />
          </button>
        </div>

        {/* Fill the sheet — 4×3 grid stretches to full body height */}
        <div className="relative min-h-0 flex-1 px-1">
          {mode === 'month' ? (
            <div className="grid h-full grid-cols-3 grid-rows-4 gap-1">
              {months.map((m) => {
                const theme = getMonthTheme(new Date(viewYear, m, 1));
                const isTodayMonth = now.getFullYear() === viewYear && now.getMonth() === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-picker-cell={m}
                    onClick={() => selectMonth(m)}
                    className="relative flex h-full min-h-0 flex-col items-center justify-center rounded-2xl active:opacity-70"
                  >
                    <span
                      className="font-calendar text-[clamp(1.35rem,5.5vw,1.85rem)] font-black capitalize leading-none tracking-tight"
                      style={{ color: theme.base }}
                    >
                      {format(new Date(viewYear, m, 1), 'MMM', { locale: dateLocale })}
                    </span>
                    {isTodayMonth ? (
                      <span
                        className="pointer-events-none absolute bottom-[12%] h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: theme.base }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid h-full grid-cols-3 grid-rows-4 gap-1">
              {years.map((y) => {
                const isTodayYear = now.getFullYear() === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => goMonthMode(y)}
                    className="relative flex h-full min-h-0 flex-col items-center justify-center rounded-2xl active:opacity-70"
                  >
                    <span
                      className="font-digits text-[clamp(1.55rem,6.5vw,2.15rem)] font-black tabular-nums leading-none tracking-tighter"
                      style={{ color: PICKER_GRAY }}
                    >
                      {y}
                    </span>
                    {isTodayYear ? (
                      <span
                        className="pointer-events-none absolute bottom-[12%] h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: PICKER_GRAY }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-center pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
          <button
            type="button"
            onClick={goToday}
            className="min-h-9 px-3 text-[0.8rem] font-semibold tracking-wide active:opacity-60"
            style={{ color: PICKER_GRAY, opacity: 0.72 }}
          >
            {t('common.today')}
          </button>
        </div>
      </div>
    </CenteredPopup>
  );
};

export default YearMonthPicker;
