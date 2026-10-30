import { useLayoutEffect, useRef, useState } from 'react';
import { format, type Locale } from 'date-fns';
import { getMonthTheme, withAlpha } from '@/lib/monthTheme';

function longestBox(el: HTMLElement): number {
  return Math.max(el.scrollHeight, el.scrollWidth, 1);
}

/** Vertical length of an uppercase month name at a probe size, off the sheet. */
function measureVerticalText(text: string, fontPx: number): number {
  const probe = document.createElement('span');
  probe.textContent = text;
  probe.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'visibility:hidden',
    'font-family:Montserrat,system-ui,sans-serif',
    'font-weight:900',
    'line-height:1',
    'letter-spacing:-0.025em',
    'text-transform:uppercase',
    'writing-mode:vertical-rl',
    'text-orientation:mixed',
    `font-size:${fontPx}px`,
  ].join(';');
  document.body.appendChild(probe);
  const length = longestBox(probe);
  probe.remove();
  return length;
}

/**
 * Weekday, day number, and a vertical month + year.
 * The digit shrinks on short screens so the content below keeps room.
 * Long month names shrink to the digit instead of pushing that content away.
 */
const DaySheetDateHeader = ({ date, dateLocale }: { date: Date; dateLocale: Locale }) => {
  const theme = getMonthTheme(date);
  const weekday = format(date, 'EEEE', { locale: dateLocale });
  const dayNum = format(date, 'd', { locale: dateLocale });
  const month = format(date, 'MMMM', { locale: dateLocale });
  const year = format(date, 'yyyy', { locale: dateLocale });
  const accessible = format(date, 'EEEE d. MMMM yyyy', { locale: dateLocale });

  const rootRef = useRef<HTMLDivElement>(null);
  const [dayPx, setDayPx] = useState(78);
  const [monthPx, setMonthPx] = useState(14);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const fit = () => {
      const weekEl = root.querySelector('[data-day-week]') as HTMLElement | null;
      const weekH = weekEl?.offsetHeight ?? 16;
      const budget = Math.min(window.innerHeight * 0.2, 128);
      let nextDay = Math.min(92, Math.max(48, budget - weekH));
      const perDigit = dayNum.length > 1 ? 1.28 : 0.92;
      const widthCap = Math.max(48, (root.clientWidth - 78) / perDigit);
      nextDay = Math.min(nextDay, widthCap);

      const probe = 48;
      const monthNeed = measureVerticalText(month, probe);
      let nextMonth = (probe * (nextDay * 0.92)) / monthNeed;
      nextMonth = Math.min(16, Math.max(11, nextMonth));

      setDayPx((prev) => (Math.abs(prev - nextDay) < 0.5 ? prev : nextDay));
      setMonthPx((prev) => (Math.abs(prev - nextMonth) < 0.5 ? prev : nextMonth));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    void document.fonts?.ready?.then(fit);
    return () => ro.disconnect();
  }, [weekday, month, year, dayNum]);

  const yearPx = Math.max(10, monthPx * 0.72);

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-10 pb-1"
      style={{ backgroundColor: theme.paper }}
    >
      <h2 className="sr-only">{accessible}</h2>
      <div className="flex items-end gap-2.5" aria-hidden>
        <div className="min-w-0 flex-1">
          <p
            data-day-week
            className="m-0 font-calendar text-[0.68rem] font-bold uppercase leading-none tracking-[0.2em]"
            style={{ color: theme.base }}
          >
            {weekday}
          </p>
          <p
            className="m-0 mt-1 font-calendar font-black tabular-nums leading-[0.78] tracking-tighter"
            style={{ color: theme.base, fontSize: dayPx }}
          >
            {dayNum}
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5 self-end"
          style={{ height: dayPx }}
        >
          <span
            className="w-px shrink-0 self-center"
            style={{ height: '74%', backgroundColor: theme.base }}
            aria-hidden
          />
          <span
            className="font-calendar font-black uppercase leading-none tracking-tight"
            style={{
              color: theme.base,
              fontSize: monthPx,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
            }}
          >
            {month}
          </span>
          <span
            className="font-calendar font-bold tabular-nums leading-none tracking-tight"
            style={{
              color: theme.base,
              fontSize: yearPx,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
            }}
          >
            {year}
          </span>
        </div>
      </div>
      <div
        className="mt-3 h-px w-full"
        style={{ backgroundColor: withAlpha(theme.base, 0.55) }}
      />
    </div>
  );
};

export default DaySheetDateHeader;
