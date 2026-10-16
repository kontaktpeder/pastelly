import { useLocale } from '@/hooks/useLocale';

const TIME_FIELD =
  'h-12 min-w-0 w-full box-border appearance-none rounded-xl border border-border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary';

interface ClockRangeFieldsProps {
  startTime: string;
  endTime: string | null;
  onStartTime: (value: string) => void;
  onEndTime: (value: string) => void;
  onClearEnd: () => void;
  onAddHour: () => void;
  onSubtractHour: () => void;
}

/** Start and end sit on one row, with slightly shorter fields than the date inputs. */
const ClockRangeFields = ({
  startTime,
  endTime,
  onStartTime,
  onEndTime,
  onClearEnd,
  onAddHour,
  onSubtractHour,
}: ClockRangeFieldsProps) => {
  const { t } = useLocale();

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="mb-1.5 block text-sm font-medium">{t('event.clock')}</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => onStartTime(e.target.value)}
            className={TIME_FIELD}
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 flex h-5 items-center justify-between text-sm font-medium">
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
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={onSubtractHour}
          className="h-8 rounded-xl border border-foreground/30 bg-transparent px-3 text-sm font-medium text-foreground active:bg-muted"
        >
          {t('event.subtractHour')}
        </button>
        <button
          type="button"
          onClick={onAddHour}
          className="h-8 rounded-xl bg-green-200 px-3 text-sm font-semibold text-green-900 active:bg-green-300"
        >
          {t('event.addHour')}
        </button>
      </div>
    </div>
  );
};

export default ClockRangeFields;
