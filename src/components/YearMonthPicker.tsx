import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getMonthTheme, PASTEL, textOnStrongColor, withAlpha } from '@/lib/monthTheme';
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
const ZOOM_MS = 0.22;
const SLIDE_MS = 0.2;
const TITLE_YEAR_CLASS = 'font-calendar text-[2.75rem] font-black tabular-nums leading-none tracking-tight text-foreground';
const TITLE_DECADE_CLASS =
  'font-calendar text-[1.85rem] font-black tabular-nums leading-none tracking-tight text-foreground';

function decadeStartFor(y: number) {
  return Math.floor(y / 12) * 12;
}

/**
 * Full-screen month/year picker.
 * Tap month / Today → await verified jump, then close.
 * Only the active mode grid is mounted (exiting grid has pointer-events: none).
 */
const YearMonthPicker = ({ year, month, onJumpToMonth, onClose }: YearMonthPickerProps) => {
  const { dateLocale, t } = useLocale();
  const now = new Date();
  const accent = getMonthTheme(now).ink;

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
      <div className="flex shrink-0 items-center justify-between px-5 pt-[max(0.85rem,env(safe-area-inset-top))] pb-1">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
          {mode === 'month' ? t('picker.selectMonth') : t('picker.selectYear')}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full active:bg-black/5"
          aria-label={t('common.close')}
        >
          <X size={22} strokeWidth={2.4} style={{ color: accent }} />
        </button>
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between px-2 pb-3 pt-1">
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
        <AnimatePresence initial={false} mode="popLayout">
          {mode === 'month' ? (
            <motion.div
              key="month-grid"
              className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
              style={{ padding: 6 }}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, pointerEvents: 'auto' }}
              exit={{ scale: 0.96, opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: ZOOM_MS, ease: EASE }}
            >
              {months.map((m) => {
                const theme = getMonthTheme(new Date(viewYear, m, 1));
                const isTodayMonth = now.getFullYear() === viewYear && now.getMonth() === m;
                const isSelected = year === viewYear && month === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-picker-cell={m}
                    onClick={() => selectMonth(m)}
                    className="relative flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl active:scale-[0.98]"
                    style={{
                      backgroundColor: theme.softTile,
                      boxShadow: isSelected ? `inset 0 0 0 2.5px ${theme.ink}` : undefined,
                    }}
                  >
                    <span
                      className="font-calendar text-[1.65rem] font-black capitalize leading-none tracking-tight"
                      style={{ color: theme.ink }}
                    >
                      {format(new Date(viewYear, m, 1), 'MMM', { locale: dateLocale })}
                    </span>
                    {isTodayMonth ? (
                      <span
                        className="pointer-events-none absolute bottom-2.5 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: theme.ink }}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="year-grid"
              className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
              style={{ padding: 6 }}
              initial={{ scale: 1.04, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, pointerEvents: 'auto' }}
              exit={{ scale: 1.04, opacity: 0, pointerEvents: 'none' }}
              transition={{ duration: ZOOM_MS, ease: EASE }}
            >
              {years.map((y) => {
                const isTodayYear = now.getFullYear() === y;
                const isSelected = viewYear === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => goMonthMode(y)}
                    className="relative flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl active:scale-[0.98]"
                    style={{
                      backgroundColor: withAlpha(accent, 0.14),
                      boxShadow: isSelected ? `inset 0 0 0 2.5px ${accent}` : undefined,
                    }}
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
            </motion.div>
          )}
        </AnimatePresence>
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
