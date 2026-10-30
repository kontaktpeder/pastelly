import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/hooks/useLocale';
import { DAY_PART_LABELS } from '@/lib/colors';
import { translateDayPart } from '@/lib/i18n';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import {
  useHideOverlayEvent,
  useUnhideOverlayEvent,
  useSetEventHiddenFromOtherCalendars,
} from '@/hooks/useHideOverlayEvent';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';

interface OverlayEventSheetProps {
  event: DisplayEvent;
  viewerHouseholdId: string;
  onClose: () => void;
  onOpenSourceCalendar: (householdId: string) => void;
}

const OverlayEventSheet = ({
  event,
  viewerHouseholdId,
  onClose,
  onOpenSourceCalendar,
}: OverlayEventSheetProps) => {
  const { t, locale } = useLocale();
  const hideOverlay = useHideOverlayEvent(viewerHouseholdId);
  const unhideOverlay = useUnhideOverlayEvent(viewerHouseholdId);
  const setHiddenForAll = useSetEventHiddenFromOtherCalendars();

  // Owners (and home co-editors) also get "hide for everyone".
  const { data: canEditSource = false } = useQuery({
    queryKey: ['can-edit-event', event.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_current_user_edit_event', {
        p_event_id: event.id,
      });
      if (error) throw error;
      return !!data;
    },
  });

  const timeLabel = (() => {
    if (event.start_time) {
      const start = event.start_time.slice(0, 5);
      return event.end_time ? `${start}–${event.end_time.slice(0, 5)}` : start;
    }
    const dps = event.day_part_start || event.day_part;
    return translateDayPart(locale, dps) || DAY_PART_LABELS[dps] || dps || null;
  })();

  const handleHideForMe = async () => {
    try {
      await hideOverlay.mutateAsync(event.id);
      onClose();
      toast(t('event.overlayHiddenForMe'), {
        action: {
          label: t('common.undo'),
          onClick: () => void unhideOverlay.mutateAsync(event.id).catch(() => {
            toast.error(t('common.error'));
          }),
        },
      });
    } catch (err) {
      console.error('[OverlayEventSheet] hide for me failed', err);
      toast.error(t('common.error'));
    }
  };

  const handleHideForAll = async () => {
    try {
      await setHiddenForAll.mutateAsync({ eventId: event.id, hidden: true });
      onClose();
      toast(t('event.overlayHiddenForAll'), {
        action: {
          label: t('common.undo'),
          onClick: () =>
            void setHiddenForAll
              .mutateAsync({ eventId: event.id, hidden: false })
              .catch(() => {
                toast.error(t('common.error'));
              }),
        },
      });
    } catch (err) {
      console.error('[OverlayEventSheet] hide for all failed', err);
      toast.error(t('common.error'));
    }
  };

  const pending = hideOverlay.isPending || setHiddenForAll.isPending;

  return (
    <CenteredPopup variant="compact" onClose={onClose} onExit={onClose} zClassName="z-[60]">
      <div className="px-5 pt-2 pb-2" data-sheet-scroll>
        <div className="rounded-2xl bg-muted/70 border border-border/50 p-5 mb-2">
          <h2 className="text-xl font-bold mb-1">{event.title}</h2>
          {timeLabel && (
            <p className="text-sm text-muted-foreground">{timeLabel}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {t('event.overlayHint')}
          </p>
        </div>
      </div>

      <PopupStickyFooter className="space-y-2">
        <button
          type="button"
          onClick={handleHideForMe}
          disabled={pending}
          className="w-full rounded-2xl border border-border py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {hideOverlay.isPending ? t('common.loading') : t('event.hideOverlayForMe')}
        </button>
        {canEditSource && (
          <button
            type="button"
            onClick={handleHideForAll}
            disabled={pending}
            className="w-full rounded-2xl border border-border py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {setHiddenForAll.isPending ? t('common.loading') : t('event.hideOverlayForAll')}
          </button>
        )}
        {event.sourceHouseholdId && (
          <button
            type="button"
            onClick={() => {
              onOpenSourceCalendar(event.sourceHouseholdId!);
              onClose();
            }}
            className="w-full rounded-2xl bg-primary text-primary-foreground py-3.5 text-sm font-semibold"
          >
            {t('event.openSourceCalendar')}
          </button>
        )}
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default OverlayEventSheet;
