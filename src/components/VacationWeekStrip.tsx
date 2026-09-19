import { format, isSameDay, isToday } from 'date-fns';
import { useLongPress } from '@/hooks/useLongPress';

const SELECTED_FILL = '#4EB8C8';
const SELECTED_INK = '#FFFFFF';
const TODAY_RING = '#4EB8C8';

export function VacationWeekHeader({
  rangeLabel,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
}: {
  rangeLabel: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  return (
    <div className="shrink-0 px-2 pt-1">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="Forrige uke"
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 disabled:opacity-25"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="min-w-0 flex-1 px-2 text-center text-base font-semibold tracking-tight text-foreground">
          {rangeLabel}
        </h2>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Neste uke"
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 disabled:opacity-25"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function VacationWeekStrip({
  width,
  days,
  weekdayLabels,
  selectedDate,
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
  interactive: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  onSelectDate: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
}) {
  return (
    <div
      className={`shrink-0 px-2 pb-3 pt-1 ${interactive ? '' : 'pointer-events-none'}`}
      style={{ width: width || '33.333%' }}
    >
      <div className="grid grid-cols-7">
        {weekdayLabels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className={`pb-1 text-center text-[10px] font-medium uppercase tracking-[0.12em] ${
              i >= 5 ? 'text-primary/55' : 'text-foreground/45'
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
  onSelectDate,
  onLongPress,
  onPressLock,
  onPressUnlock,
}: {
  day: Date;
  selected: boolean;
  inRange: boolean;
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
      className={`flex flex-col items-center py-0.5 ${inRange ? '' : 'opacity-35'}`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums"
        style={
          selected
            ? { backgroundColor: SELECTED_FILL, color: SELECTED_INK, fontWeight: 600 }
            : isToday(day)
              ? { boxShadow: `inset 0 0 0 1.5px ${TODAY_RING}`, color: '#0B4A5C' }
              : { color: 'inherit' }
        }
      >
        {format(day, 'd')}
      </span>
    </button>
  );
}
