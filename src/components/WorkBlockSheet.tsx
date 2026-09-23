import { BriefcaseBusiness } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { addressDisplayLabel } from '@/lib/eventLocation';

interface WorkBlockSheetProps {
  event: DisplayEvent;
  onClose: () => void;
}

const WorkBlockSheet = ({ event, onClose }: WorkBlockSheetProps) => {
  const { t } = useLocale();
  const start = event.start_time?.slice(0, 5);
  const end = event.end_time?.slice(0, 5);
  const timeLabel = start ? (end ? `${start}–${end}` : start) : null;

  return (
    <CenteredPopup onClose={onClose} onExit={onClose} size="hug" nest zClassName="z-[60]" backdrop="none">
      <div className="px-5 pt-2 pb-2" data-sheet-scroll>
        <div className="mb-2 rounded-2xl border border-border/50 bg-muted/70 p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BriefcaseBusiness size={14} />
            Work
          </div>
          <h2 className="mb-1 text-xl font-bold">{event.title}</h2>
          {timeLabel && <p className="text-sm text-muted-foreground">{timeLabel}</p>}
          {event.location && (
            <p className="mt-1 text-sm text-muted-foreground">{addressDisplayLabel(event.location)}</p>
          )}
          {event.notes && <p className="mt-3 text-sm">{event.notes}</p>}
          <p className="mt-3 text-xs text-muted-foreground">{t('event.workBlockHint')}</p>
        </div>
      </div>
      {event.workUrl ? (
        <PopupStickyFooter>
          <a
            href={event.workUrl}
            className="block w-full rounded-2xl bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground"
          >
            {t('event.openInWork')}
          </a>
        </PopupStickyFooter>
      ) : null}
    </CenteredPopup>
  );
};

export default WorkBlockSheet;
