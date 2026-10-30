import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getMonthTheme, PASTEL, textOnStrongColor, withAlpha } from '@/lib/monthTheme';
import { useLocale } from '@/hooks/useLocale';

type PickerMode = 'month' | 'year';

type YearMonthPickerProps = {
  /** Currently visible calendar month (selection source). */
  year: number;
  month: number;
  onJumpToMonth: (date: Date) => void;
  onClose: () => void;
};

const EASE = [0.32, 0.72, 0, 1] as const;
const ZOOM_MS = 0.28;
const SLIDE_MS = 0.2;
const TITLE_YEAR_CLASS = 'font-calendar text-[2.75rem] font-black tabular-nums leading-none tracking-tight text-foreground';
const TITLE_DECADE_CLASS =
  'font-calendar text-[1.85rem] font-black tabular-nums leading-none tracking-tight text-foreground';

function decadeStartFor(y: number) {
  return Math.floor(y / 12) * 12;
}

function cellCenterInGrid(grid: HTMLElement, index: number): { x: number; y: number } {
  const cell = grid.querySelector<HTMLElement>(`[data-picker-cell="${index}"]`);
  if (!cell) {
    const r = grid.getBoundingClientRect();
    return { x: r.width / 2, y: r.height / 2 };
  }
  const gr = grid.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  return {
    x: cr.left - gr.left + cr.width / 2,
    y: cr.top - gr.top + cr.height / 2,
  };
}

/**
 * Full-screen month/year picker. Tap month → jump + close.
 * Tap year header → zoom to year grid. Dot = today, filled tile = selected month.
 */
const YearMonthPicker = ({ year, month, onJumpToMonth, onClose }: YearMonthPickerProps) => {
  const { dateLocale, t } = useLocale();
  const now = new Date();
  const accent = getMonthTheme(now).ink;

  const [mode, setMode] = useState<PickerMode>('month');
  const [viewYear, setViewYear] = useState(year);
  const [decadeStart, setDecadeStart] = useState(() => decadeStartFor(year));
  const [origin, setOrigin] = useState({ x: '50%', y: '40%' });
  const [pageDir, setPageDir] = useState(0);

  const monthGridRef = useRef<HTMLDivElement>(null);
  const yearGridRef = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  const goMonthMode = (nextYear: number, fromIndex: number) => {
    const grid = yearGridRef.current;
    if (grid) {
      const c = cellCenterInGrid(grid, fromIndex);
      setOrigin({ x: `${c.x}px`, y: `${c.y}px` });
    }
    setViewYear(nextYear);
    setMode('month');
  };

  const goYearMode = () => {
    const grid = monthGridRef.current;
    // Origin near the year title cluster (top center of grid area)
    if (grid) {
      const r = grid.getBoundingClientRect();
      setOrigin({ x: `${r.width / 2}px`, y: '0px' });
    }
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

  const selectMonth = (m: number) => {
    // Parent jumps the strip under the overlay, then we fade out.
    onJumpToMonth(new Date(viewYear, m, 1));
    requestAnimationFrame(() => onClose());
  };

  const goToday = () => {
    onJumpToMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    requestAnimationFrame(() => onClose());
  };

  const slideX = pageDir === 0 ? 0 : pageDir * 24;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: PASTEL.calendarPaper, color: accent }}
    >
      {/* Header */}
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

      {/* Year / decade chrome */}
      <div className="flex shrink-0 items-center justify-between px-2 pb-3 pt-1">
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
              key={viewYear}
              initial={{ x: slideX, opacity: 0.35 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: SLIDE_MS, ease: EASE }}
              className={TITLE_YEAR_CLASS}
            >
              {viewYear}
            </motion.span>
            <ChevronDown size={22} strokeWidth={2.6} className="mt-1 opacity-70" style={{ color: accent }} />
          </button>
        ) : (
          <motion.span
            key={decadeStart}
            initial={{ x: slideX, opacity: 0.35 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: SLIDE_MS, ease: EASE }}
            className={TITLE_DECADE_CLASS}
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

      {/* Stacked grids — both mounted; zoom with shared transform-origin */}
      <div className="relative min-h-0 flex-1 overflow-hidden px-3">
        <motion.div
          ref={monthGridRef}
          className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
          style={{
            padding: 6,
            transformOrigin: `${origin.x} ${origin.y}`,
            pointerEvents: mode === 'month' ? 'auto' : 'none',
          }}
          animate={mode === 'month' ? 'on' : 'offOut'}
          variants={{
            on: { scale: 1, opacity: 1 },
            offOut: { scale: 0.88, opacity: 0 },
          }}
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
                  backgroundColor: isSelected ? theme.softTile : 'transparent',
                  boxShadow: isSelected ? `inset 0 0 0 2px ${theme.ink}` : undefined,
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

        <motion.div
          ref={yearGridRef}
          className="absolute inset-x-3 top-0 bottom-0 grid grid-cols-3 content-start gap-x-2 gap-y-2 pt-1"
          style={{
            padding: 6,
            transformOrigin: `${origin.x} ${origin.y}`,
            pointerEvents: mode === 'year' ? 'auto' : 'none',
          }}
          initial={false}
          animate={mode === 'year' ? 'on' : 'offIn'}
          variants={{
            on: { scale: 1, opacity: 1 },
            offIn: { scale: 1.12, opacity: 0 },
          }}
          transition={{ duration: ZOOM_MS, ease: EASE }}
        >
          {years.map((y, i) => {
            const isTodayYear = now.getFullYear() === y;
            const isSelected = viewYear === y;
            return (
              <button
                key={y}
                type="button"
                data-picker-cell={i}
                onClick={() => goMonthMode(y, i)}
                className="relative flex min-h-[4.75rem] flex-col items-center justify-center rounded-2xl active:scale-[0.98]"
                style={{
                  backgroundColor: isSelected ? withAlpha(accent, 0.14) : 'transparent',
                  boxShadow: isSelected ? `inset 0 0 0 2px ${accent}` : undefined,
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
      </div>

      {/* Single thumb-zone CTA */}
      <div className="shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
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
