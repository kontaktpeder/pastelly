import { format, isSameDay, isToday } from 'date-fns';
import { useLongPress } from '@/hooks/useLongPress';

export function VacationWeekStrip({
  width,
  days,
  selectedDate,
  interactive,
  rangeStart,
  rangeEnd,
  selectedFill,
  onSelectDate,
  onLongPress,
  onPressLock,
  onPressUnlock,
}: {
  width: number;
  days: Date[];
  selectedDate: Date;
  interactive: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  selectedFill: string;
  onSelectDate: (day: Date) => void;
  onLongPress: (day: Date) => void;
  onPressLock: () => void;
  onPressUnlock: () => void;
}) {
  return (
    <div
      className={`shrink-0 px-1 pb-2 pt-0.5 ${interactive ? '' : 'pointer-events-none'}`}
      style={{ width: width || '100%' }}
    >
      <div className="grid grid-cols-7">
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
              selectedFill={selectedFill}
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
  selectedFill,
  onSelectDate,
  onLongPress,
  onPressLock,
  onPressUnlock,
}: {
  day: Date;
  selected: boolean;
  inRange: boolean;
  selectedFill: string;
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
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums leading-none ${
          selected
            ? 'text-white'
            : isToday(day)
              ? 'border-[1.5px] border-primary text-primary font-bold'
              : 'text-foreground/90'
        }`}
        style={selected ? { backgroundColor: selectedFill } : undefined}
      >
        {format(day, 'd')}
      </span>
    </button>
  );
}
