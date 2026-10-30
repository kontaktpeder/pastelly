import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { getMonthTheme, PASTEL, textOnStrongColor } from '@/lib/monthTheme';
import { useLocale } from '@/hooks/useLocale';

type PickerMode = 'month' | 'year';

type YearMonthPickerProps = {
  /** Month the calendar was showing when the picker opened. */
  year: number;
  month: number;
  onJumpToMonth: (date: Date) => void | Promise<void>;
  onClose: () => void;
};

const EASE = [0.32, 0.72, 0, 1] as const;
const SLIDE_MS = 0.2;
const TITLE_YEAR_CLASS = 'font-calendar text-[2.75rem] font-black tabular-nums leading-none tracking-tight';
const TITLE_DECADE_CLASS = 'font-calendar text-[1.85rem] font-black tabular-nums leading-none tracking-tight';

function decadeStartFor(y: number) {
  return Math.floor(y / 12) * 12;
}

/**
 * Full-screen month/year picker.
 * Chrome ink follows the calendar's current month; month labels use each month's
 * calendar color (text only — no soft tiles). Mode switch is instant (no zoom glitch).
 */
const YearMonthPicker = ({ year, month, onJumpToMonth, onClose }: YearMonthPickerProps) => {
  const { dateLocale, t } = useLocale();
  const now = new Date();
  /** Accent = the month the calendar was on when the picker opened. */
  const accent = getMonthTheme(new Date(year, month, 1)).base;

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
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: PASTEL.calendarPaper, color: accent }}
    >
      {/* Year / decade chrome — no “Velg …” label, no close X */}
      <div className="relative z-10 flex shrink-0 items-center justify-between px-2 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => (mode === 'month' ? pageYear(-1) : pageDecade(-1))}
          className="flex h-11 w-11 items-center justify-center rounded-full active:bg-black/5"
          aria-label={t('picker.prev')}
        >
          <ChevronLeft size={26} strokeWidth={2.4} style={{ color: accent }} />
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
              style={{ color: accent }}
              animate={{ x: slideX, opacity: pageDir === 0 ? 1 : 0.35 }}
              transition={{ duration: SLIDE_MS, ease: EASE }}
            >
              {viewYear}
            </motion.span>
            <ChevronDown size={22} strokeWidth={2.6} className="mt-1 opacity-70" style={{ color: accent }} />
          </button>
        ) : (
          <motion.span
            className={TITLE_DECADE_CLASS}
            style={{ color: accent }}
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
          <ChevronRight size={26} strokeWidth={2.4} style={{ color: accent }} />
        </button>
      </div>

      <div className="relative z-0 min-h-0 flex-1 overflow-hidden px-3">
        {mode === 'month' ? (
          <div
            className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
            style={{ padding: 6 }}
          >
            {months.map((m) => {
              const theme = getMonthTheme(new Date(viewYear, m, 1));
              const isTodayMonth = now.getFullYear() === viewYear && now.getMonth() === m;
              return (
                <button
                  key={m}
                  type="button"
                  data-picker-cell={m}
                  onClick={() => selectMonth(m)}
                  className="relative flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl active:opacity-70"
                >
                  <span
                    className="font-calendar text-[1.65rem] font-black capitalize leading-none tracking-tight"
                    style={{ color: theme.base }}
                  >
                    {format(new Date(viewYear, m, 1), 'MMM', { locale: dateLocale })}
                  </span>
                  {isTodayMonth ? (
                    <span
                      className="pointer-events-none absolute bottom-2.5 h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: theme.base }}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
            style={{ padding: 6 }}
          >
            {years.map((y) => {
              const isTodayYear = now.getFullYear() === y;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => goMonthMode(y)}
                  className="relative flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl active:opacity-70"
                >
                  <span
                    className="font-calendar text-[1.65rem] font-black tabular-nums leading-none tracking-tight"
                    style={{ color: accent }}
                  >
                    {y}
                  </span>
                  {isTodayYear ? (
                    <span
                      className="pointer-events-none absolute bottom-2.5 h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: accent }}
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative z-10 shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={goToday}
          className="mx-auto flex min-h-12 w-full max-w-sm items-center justify-center rounded-full text-base font-bold active:opacity-90"
          style={{ backgroundColor: accent, color: textOnStrongColor(accent) }}
        >
          {t('common.today')}
        </button>
      </div>
    </div>
  );
};

export default YearMonthPicker;
