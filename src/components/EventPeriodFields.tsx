import { addDays, format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';

const FIELD =
  'min-w-0 box-border appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary';
const ADD_BTN =
  'shrink-0 rounded-xl bg-muted active:bg-muted/70 px-3 py-3 text-sm font-medium whitespace-nowrap min-w-[4.75rem] transition-colors';

interface EventPeriodFieldsProps {
  isHotel: boolean;
  startDate: Date;
  endDate: Date | null;
  startTime: string;
  endTime: string | null;
  onStartDate: (date: Date) => void;
  onEndDate: (date: Date | null) => void;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  compactEndDate?: boolean;
}

const EventPeriodFields = ({
  isHotel,
  startDate,
  endDate,
  startTime,
  endTime,
  onStartDate,
  onEndDate,
  onStartTime,
  onEndTime,
  compactEndDate = false,
}: EventPeriodFieldsProps) => {
  const { t } = useLocale();
  const isMultiDay = !!endDate;

  const setStart = (value: string) => {
    const next = new Date(value + 'T12:00:00');
    onStartDate(next);
    if (isHotel) {
      if (!endDate || endDate <= next) onEndDate(addDays(next, 1));
    } else if (endDate && endDate <= next) {
      onEndDate(null);
    }
  };

  if (isHotel) {
    const checkout = endDate ?? addDays(startDate, 1);
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">{t('event.checkIn')}</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={format(startDate, 'yyyy-MM-dd')}
              onChange={(e) => setStart(e.target.value)}
              className={`flex-1 ${FIELD}`}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => onStartTime(e.target.value)}
              className={`w-[7.75rem] ${FIELD}`}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('event.hotelHint')}</p>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">{t('event.checkOut')}</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={format(checkout, 'yyyy-MM-dd')}
              min={format(addDays(startDate, 1), 'yyyy-MM-dd')}
              onChange={(e) => onEndDate(new Date(e.target.value + 'T12:00:00'))}
              className={`flex-1 ${FIELD}`}
            />
            <input
              type="time"
              value={endTime || '11:00'}
              onChange={(e) => onEndTime(e.target.value)}
              className={`w-[7.75rem] ${FIELD}`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">
          {isMultiDay ? t('event.firstDay') : t('event.date')}
        </label>
        <div className="flex gap-2">
          <input
            type="date"
            value={format(startDate, 'yyyy-MM-dd')}
            onChange={(e) => setStart(e.target.value)}
            className={`flex-1 ${FIELD}`}
          />
          {!isMultiDay && (
            <button type="button" onClick={() => onEndDate(addDays(startDate, 1))} className={ADD_BTN}>
              {t('event.addLastDay')}
            </button>
          )}
        </div>
        {isMultiDay && (
          <p className="mt-1 text-xs text-muted-foreground">{t('event.periodHint')}</p>
        )}
      </div>

      {endDate && (
        <div className={`flex items-center gap-2 ${compactEndDate ? 'mt-2' : ''}`}>
          <div className="flex-1 min-w-0">
            {!compactEndDate && (
              <label className="text-sm font-medium mb-2 block">{t('event.lastDay')}</label>
            )}
            <input
              type="date"
              value={format(endDate, 'yyyy-MM-dd')}
              onChange={(e) => onEndDate(new Date(e.target.value + 'T12:00:00'))}
              min={format(addDays(startDate, 1), 'yyyy-MM-dd')}
              className={`w-full ${FIELD}`}
            />
          </div>
          <button
            type="button"
            onClick={() => onEndDate(null)}
            className={`${compactEndDate ? '' : 'mt-7'} p-2 rounded-full hover:bg-muted text-muted-foreground`}
            aria-label={t('event.date')}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default EventPeriodFields;
