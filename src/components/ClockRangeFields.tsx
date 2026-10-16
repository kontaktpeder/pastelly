import { useLocale } from '@/hooks/useLocale';

const TIME_FIELD =
  'h-10 min-w-0 w-full box-border appearance-none rounded-xl border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary';

interface ClockRangeFieldsProps {
  startTime: string;
  endTime: string | null;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  onClearEnd: () => void;
  onAddHour: () => void;
}

/** Start and end sit on one row, with slightly shorter fields than the date inputs. */
const ClockRangeFields = ({
  startTime,
  endTime,
  onStartTime,
  onEndTime,
  onClearEnd,
  onAddHour,
}: ClockRangeFieldsProps) => {
  const { t } = useLocale();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t('event.clock')}</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => onStartTime(e.target.value)}
            className={TIME_FIELD}
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1 flex h-4 items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{t('event.endTime')}</span>
            {endTime && (
              <button
                type="button"
                onClick={onClearEnd}
                className="-mr-1 flex h-4 w-4 items-center justify-center text-muted-foreground"
                aria-label={t('common.close')}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </span>
          <input
            type="time"
            value={endTime || ''}
            onChange={(e) => onEndTime(e.target.value)}
            className={TIME_FIELD}
          />
        </label>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAddHour}
          className="h-10 min-w-[7.5rem] rounded-xl bg-muted px-5 text-sm font-semibold text-foreground active:bg-muted/70"
        >
          {t('event.addHour')}
        </button>
      </div>
    </div>
  );
};

export default ClockRangeFields;
