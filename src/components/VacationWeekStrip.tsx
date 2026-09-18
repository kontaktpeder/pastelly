import { format, isSameDay, isToday } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import { useLongPress } from '@/hooks/useLongPress';
import {
  buildSpanSegmentsByDate,
} from '@/lib/multiDaySpans';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import { formatVacationRange } from '@/lib/vacationMode';
import { getIntlLocale } from '@/lib/i18n';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';

const SELECTED_FILL = '#4EB8C8';
const SELECTED_INK = '#FFFFFF';
const TODAY_RING = '#4EB8C8';
const MAX_VISIBLE_SPAN_LANES = 2;

type WeekSpanBar = {
  key: string;
  title: string;
  rangeLabel: string;
  startCol: number;
  span: number;
  lane: number;
  soft: string;
  ink: string;
};

function collectWeekSpanBars(
  days: Date[],
  eventsByDate: Record<string, DisplayEvent[]>,
  members: HouseholdMember[],
  locale: string,
): WeekSpanBar[] {
  const spanByDate = buildSpanSegmentsByDate(days, eventsByDate);
  const bars = new Map<string, WeekSpanBar>();

  days.forEach((day, index) => {
    const segs = spanByDate.get(format(day, 'yyyy-MM-dd')) || [];
    for (const seg of segs) {
      if (seg.lane >= MAX_VISIBLE_SPAN_LANES) continue;
      const key = `${seg.event.id}-${seg.lane}`;
      const existing = bars.get(key);
      if (existing) {
        existing.span = index + 1 - existing.startCol + 1;
        continue;
      }
      const ev = seg.event as DisplayEvent;
      const member = members.find((m) => m.id === ev.owner_member_id);
      const visuals = resolveCategoryVisuals(ev.category, getMemberColorMap(member));
      const start = new Date(`${ev.event_date}T12:00:00`);
      const end = new Date(`${(ev.end_date || ev.event_date)}T12:00:00`);
      bars.set(key, {
        key,
        title: ev.title,
        rangeLabel: formatVacationRange(start, end, locale, undefined, 'short'),
        startCol: index + 1,
        span: 1,
        lane: seg.lane,
        soft: visuals.soft,
        ink: visuals.ink,
      });
    }
  });

  return [...bars.values()];
}

export function VacationWeekHeader({
  monthLabel,
  weekCaption,
  onPrev,
  onNext,
  onTitleClick,
  canPrev = true,
  canNext = true,
  showToday = false,
  onToday,
}: {
  monthLabel: string;
  weekCaption: string;
  onPrev: () => void;
  onNext: () => void;
  onTitleClick?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  showToday?: boolean;
  onToday?: () => void;
}) {
  return (
    <div className="relative shrink-0 px-2 pt-1 pb-0.5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Forrige uke"
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 disabled:opacity-25"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onTitleClick}
          className="min-h-11 min-w-0 flex-1 px-2 text-center"
          disabled={!onTitleClick}
        >
          <h2 className="text-lg font-extrabold capitalize tracking-wide text-foreground">{monthLabel}</h2>
          <p className="text-[13px] font-medium text-muted-foreground">{weekCaption}</p>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Neste uke"
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 disabled:opacity-25"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {showToday && onToday && (
        <div className="flex justify-center pb-1">
          <button
            type="button"
            onClick={onToday}
            className="min-h-7 rounded-full px-2.5 text-[11px] font-semibold tracking-wide text-[#2A7CA8]"
          >
            I dag
          </button>
        </div>
      )}
    </div>
  );
}

export function VacationWeekStrip({
  width,
  days,
  weekdayLabels,
  selectedDate,
  eventsByDate,
  members,
  interactive,
  rangeStart,
  rangeEnd,
  onSelectDate,
  onLongPress,
  onPressLock,
  onPressUnlock,
}: {
  width: number;
  days: Date[];
  weekdayLabels: string[];
  selectedDate: Date;
  eventsByDate: Record<string, DisplayEvent[]>;
  members: HouseholdMember[];
  interactive: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  onSelectDate: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
}) {
  const { locale } = useLocale();
  const bars = collectWeekSpanBars(days, eventsByDate, members, getIntlLocale(locale));
  const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
  const lanes = Array.from({ length: laneCount }, (_, i) => i);

  return (
    <div
      className={`shrink-0 px-2 pb-2 pt-1 ${interactive ? '' : 'pointer-events-none'}`}
      style={{ width: width || '33.333%' }}
    >
      {lanes.length > 0 && (
        <div className="mb-1.5 space-y-0.5">
          {lanes.map((lane) => (
            <div key={lane} className="grid grid-cols-7 gap-x-0.5">
              {bars
                .filter((bar) => bar.lane === lane)
                .map((bar) => (
                  <div
                    key={bar.key}
                    className="flex h-5 min-w-0 items-center rounded-full px-1.5"
                    style={{
                      gridColumn: `${bar.startCol} / span ${bar.span}`,
                      backgroundColor: bar.soft,
                      color: bar.ink,
                    }}
                  >
                    <span className="truncate text-[10px] font-semibold leading-none">
                      {bar.title}
                      {bar.rangeLabel ? ` · ${bar.rangeLabel}` : ''}
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7">
        {weekdayLabels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className={`pb-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.12em] ${
              i >= 5 ? 'text-primary/60' : 'text-foreground/50'
            }`}
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const inRange =
            !rangeStart || !rangeEnd || (dateStr >= rangeStart && dateStr <= rangeEnd);
          return (
            <VacationWeekDay
              key={dateStr}
              day={day}
              selected={isSameDay(day, selectedDate)}
              inRange={inRange}
              count={(eventsByDate[dateStr] || []).length}
              onSelectDate={onSelectDate}
              onLongPress={onLongPress}
              onPressLock={onPressLock}
              onPressUnlock={onPressUnlock}
            />
          );
        })}
      </div>
    </div>
  );
}

function VacationWeekDay({
  day,
  selected,
  inRange,
  count,
  onSelectDate,
  onLongPress,
  onPressLock,
  onPressUnlock,
}: {
  day: Date;
  selected: boolean;
  inRange: boolean;
  count: number;
  onSelectDate: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
}) {
  const { longPressHandlers, didFire } = useLongPress({
    onRecognize: onPressLock,
    onLongPress: () => onLongPress(day),
    onDisarm: onPressUnlock,
  });

  return (
    <button
      type="button"
      {...longPressHandlers}
      onClick={() => {
        if (didFire()) return;
        onSelectDate(day);
      }}
      className={`flex flex-col items-center gap-0.5 py-0.5 ${inRange ? '' : 'opacity-35'}`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
          selected
            ? 'font-bold'
            : isToday(day)
              ? 'font-bold'
              : 'text-foreground/85'
        }`}
        style={
          selected
            ? { backgroundColor: SELECTED_FILL, color: SELECTED_INK }
            : isToday(day)
              ? { boxShadow: `inset 0 0 0 1.5px ${TODAY_RING}`, color: '#0B4A5C' }
              : undefined
        }
      >
        {format(day, 'd')}
      </span>
      <span className="flex h-3 min-w-[1.25rem] items-center justify-center gap-0.5">
        {count <= 0 ? null : count <= 2 ? (
          Array.from({ length: count }, (_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-[#4EB8C8]" />
          ))
        ) : (
          <span className="text-[9px] font-bold tabular-nums text-[#0B4A5C]">{count}</span>
        )}
      </span>
    </button>
  );
}
