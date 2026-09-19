import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useEventComments, useAddComment, useDeleteEvent, type Event } from '@/hooks/useEvents';
import { useMemberEventLeak, useSetMemberEventLeak } from '@/hooks/useMemberEventLeak';
import { getMemberColor } from '@/lib/colors';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { resolveCategoryVisuals, resolveCategoryLabel, getMemberColorMap } from '@/lib/categoryPresentation';
import { formatMultiDayLabel } from '@/lib/multiDaySpans';
import { formatEventStayLabel } from '@/lib/eventStay';
import { offerMapsChooser } from '@/lib/eventLocation';
import { isHotelCategory } from '@/lib/vacationSchedule';
import type { HouseholdMember } from '@/hooks/useHousehold';
import CenteredPopup from '@/components/CenteredPopup';
import PopupStickyFooter from '@/components/PopupStickyFooter';
import { scrollFocusIntoView } from '@/lib/scrollFocusIntoView';
import { canEditEvent } from '@/lib/canEditEvent';
import type { CalendarKind } from '@/lib/calendarKinds';
import { useLocale } from '@/hooks/useLocale';
import type { MessageKey } from '@/lib/i18n';

interface EventDetailSheetProps {
  event: Event;
  members: HouseholdMember[];
  currentMemberId: string;
  calendarKind?: CalendarKind | string;
  showInOtherCalendars?: boolean;
  onClose: () => void;
  onEdit?: (event: Event) => void;
  onQuickEdit?: (event: Event) => void;
}

const EventDetailSheet = ({
  event,
  members,
  currentMemberId,
  calendarKind = 'home',
  showInOtherCalendars = false,
  onClose,
  onEdit,
  onQuickEdit,
}: EventDetailSheetProps) => {
  const { t, dateLocale } = useLocale();
  const [comment, setComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: comments = [] } = useEventComments(event.id);
  const addComment = useAddComment();
  const deleteEvent = useDeleteEvent();
  const isOwnEvent = event.owner_member_id === currentMemberId;
  const canOptInLeak = showInOtherCalendars && !isOwnEvent && !event.hide_from_other_calendars;
  const { data: leaksToMyCalendars = false } = useMemberEventLeak(
    canOptInLeak ? event.id : undefined,
    canOptInLeak ? currentMemberId : undefined,
  );
  const setLeak = useSetMemberEventLeak();

  const owner = members.find((m) => m.id === event.owner_member_id);
  const ownerColor = owner ? getMemberColor(owner.color_token) : getMemberColor('pastel-blue');
  const editable = canEditEvent(event, currentMemberId, calendarKind);

  const mapsLabels = {
    title: t('event.openInMaps'),
    google: t('event.googleMaps'),
    apple: t('event.appleMaps'),
  };

  useEffect(() => {
    if (!event.location) return;
    offerMapsChooser(event.location, mapsLabels);
    // Show once per opened event so the address is easy to open in Maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.location]);

  const dayPartLabel = (key: string | null | undefined) => {
    if (!key) return '';
    const msgKey = `dayPart.${key}` as MessageKey;
    const translated = t(msgKey);
    return translated === msgKey ? key : translated;
  };

  const handleAddComment = () => {
    if (!comment.trim()) return;
    addComment.mutate({
      event_id: event.id,
      sender_member_id: currentMemberId,
      body: comment.trim(),
      household_id: event.household_id,
      event_title: event.title,
    });
    setComment('');
  };

  const handleDelete = async () => {
    try {
      await deleteEvent.mutateAsync(event.id);
      onClose();
    } catch (err: any) {
      toast.error(t('event.deleteFailed'), {
        description: err?.message ?? t('event.tryAgain'),
      });
    }
  };

  const handleToggleLeak = async (next: boolean) => {
    try {
      await setLeak.mutateAsync({ eventId: event.id, leak: next });
    } catch (err) {
      console.error('[EventDetailSheet] leak toggle failed', err);
      toast.error(t('common.error'));
    }
  };

  const getMemberById = (id: string) => members.find((m) => m.id === id);

  const stayLabel = formatEventStayLabel(event, {
    dateLocale,
    firstDay: t('event.firstDay'),
    lastDay: t('event.lastDay'),
    checkIn: t('event.checkIn'),
    checkOut: t('event.checkOut'),
  });
  const multiLabel =
    stayLabel ||
    formatMultiDayLabel(event, {
    dateLocale,
    daysLabel: (() => {
      const end = (event as any).end_date as string | undefined;
      if (!end) return '';
      const start = new Date(event.event_date + 'T12:00:00');
      const endD = new Date(end + 'T12:00:00');
      const days = Math.round((endD.getTime() - start.getTime()) / 86400000) + 1;
      return t('event.daysCount', { count: days });
    })(),
  });

  return (
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      detents={['half', 'full']}
      initialDetent="half"
      zClassName="z-[60]"
      backdrop="none"
    >
      <div className="flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 pt-2 pb-4 min-h-0" data-sheet-scroll>
        <div className={`rounded-2xl p-5 mb-4 ${ownerColor.bg}`}>
          <h2 className="text-xl font-bold mb-1">{event.title}</h2>
          <p className="text-sm text-muted-foreground">
            {owner?.display_name} · {format(new Date(event.event_date + 'T12:00:00'), 'd. MMMM yyyy', { locale: dateLocale })}
          </p>
          {multiLabel && (
            <p className="text-sm font-medium mt-0.5">{multiLabel}</p>
          )}
          {!isHotelCategory(event.category) && (
          <p className="text-sm text-muted-foreground">
            {(() => {
              const dps = (event as any).day_part_start as string | null;
              const dpe = (event as any).day_part_end as string | null;
              if (dps && dpe && dps !== dpe) {
                return `${dayPartLabel(dps)} – ${dayPartLabel(dpe)}`;
              }
              if (dps === 'full_diem') return dayPartLabel('full_diem');
              if (dps === 'all_day') return dayPartLabel('all_day');
              return dayPartLabel(event.day_part) || event.day_part;
            })()}
            {event.start_time && ` · ${event.start_time.slice(0, 5)}`}
            {event.end_time && `–${event.end_time.slice(0, 5)}`}
          </p>
          )}
          {event.location && (
            <button
              type="button"
              onClick={() => offerMapsChooser(event.location!, mapsLabels)}
              className="mt-2 block w-full text-left text-sm"
            >
              <span className="block">📍 {event.location}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t('event.openInMaps')}</span>
            </button>
          )}
          {event.notes && <p className="text-sm mt-2 text-muted-foreground">{event.notes}</p>}
          {(() => {
            const meta = EVENT_CATEGORY_META[(event.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
            const visuals = resolveCategoryVisuals(event.category, getMemberColorMap(owner));
            const label = resolveCategoryLabel(event.category, (event as any).category_label_override);
            const Icon = meta?.Icon;
            return (
              <div
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: visuals.soft, color: visuals.ink }}
              >
                {Icon && <Icon size={12} style={{ color: visuals.ink }} />}
                {label}
              </div>
            );
          })()}
        </div>

        {canOptInLeak && (
          <label className="mb-4 flex items-start gap-3 rounded-xl bg-muted/50 p-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 rounded border-border"
              checked={leaksToMyCalendars}
              disabled={setLeak.isPending}
              onChange={(e) => void handleToggleLeak(e.target.checked)}
            />
            <span>
              <span className="block font-semibold text-sm">{t('event.leakToMyCalendars')}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {t('event.leakToMyCalendarsHint')}
              </span>
            </span>
          </label>
        )}

        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('event.comments')}</h3>
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              {t('event.noComments')}
            </p>
          )}
          <div className="space-y-3">
            {comments.map((c) => {
              const sender = getMemberById(c.sender_member_id);
              const senderColor = sender ? getMemberColor(sender.color_token) : getMemberColor('pastel-blue');
              return (
                <div key={c.id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full ${senderColor.bg} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                    {sender?.display_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{sender?.display_name || t('event.unknown')}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { locale: dateLocale, addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <PopupStickyFooter className="space-y-2">
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
            onFocus={scrollFocusIntoView}
            placeholder={t('event.writeComment')}
            className="flex-1 min-w-0 rounded-xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={handleAddComment}
            disabled={!comment.trim()}
            className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {t('event.send')}
          </button>
        </div>

        {editable && onQuickEdit && (
          <button
            type="button"
            onClick={() => onQuickEdit(event)}
            className="w-full rounded-2xl bg-primary/15 hover:bg-primary/25 py-3.5 text-sm text-primary font-semibold transition-colors"
          >
            {t('event.edit')}
          </button>
        )}

        {editable && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-12 w-full rounded-2xl border border-destructive/30 py-3.5 text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          >
            {t('event.delete')}
          </button>
        )}

        {editable && confirmDelete && (
          <div className="rounded-2xl bg-destructive/10 p-4">
            <p className="mb-3 text-center text-sm font-medium">
              {t('event.deleteConfirm')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteEvent.isPending}
                className="min-h-11 rounded-xl border border-border bg-background px-3 font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteEvent.isPending}
                className="min-h-11 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {deleteEvent.isPending ? t('event.deleting') : t('event.deleteAction')}
              </button>
            </div>
          </div>
        )}
      </PopupStickyFooter>
    </CenteredPopup>
  );
};

export default EventDetailSheet;
