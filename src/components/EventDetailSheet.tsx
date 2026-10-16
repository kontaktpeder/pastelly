import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useEventComments, useAddComment, useDeleteEvent, type Event } from '@/hooks/useEvents';
import { useMemberEventLeak, useSetMemberEventLeak } from '@/hooks/useMemberEventLeak';
import { getMemberColor } from '@/lib/colors';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { resolveCategoryVisuals, resolveCategoryLabel, getMemberColorMap } from '@/lib/categoryPresentation';
import { formatMultiDayLabel } from '@/lib/multiDaySpans';
import { formatEventStayLabel } from '@/lib/eventStay';
import { isHotelCategory } from '@/lib/vacationSchedule';
import EventAddressLink from '@/components/EventAddressLink';
import type { HouseholdMember } from '@/hooks/useHousehold';
import CenteredPopup from '@/components/CenteredPopup';
import SheetActionDock from '@/components/SheetActionDock';
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
  const editable = canEditEvent(event, currentMemberId, calendarKind);

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
      <div
        className="flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 pt-2 min-h-0 pb-4"
        data-sheet-scroll
      >
        {(() => {
          const meta = EVENT_CATEGORY_META[(event.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
          const visuals = resolveCategoryVisuals(event.category, getMemberColorMap(owner));
          const label = resolveCategoryLabel(event.category, (event as any).category_label_override);
          const Icon = meta?.Icon;
          const whenLine = [
            format(new Date(event.event_date + 'T12:00:00'), 'd. MMMM yyyy', { locale: dateLocale }),
            multiLabel || null,
          ].filter(Boolean).join(' · ');
          const partLine = !isHotelCategory(event.category)
            ? (() => {
                const dps = (event as any).day_part_start as string | null;
                const dpe = (event as any).day_part_end as string | null;
                let part = '';
                if (dps && dpe && dps !== dpe) part = `${dayPartLabel(dps)} – ${dayPartLabel(dpe)}`;
                else if (dps === 'full_diem') part = dayPartLabel('full_diem');
                else if (dps === 'all_day') part = dayPartLabel('all_day');
                else part = dayPartLabel(event.day_part) || event.day_part;
                const clock = [
                  event.start_time ? event.start_time.slice(0, 5) : null,
                  event.end_time ? event.end_time.slice(0, 5) : null,
                ].filter(Boolean).join('–');
                return [part, clock].filter(Boolean).join(' · ');
              })()
            : null;
          return (
            <div className="mb-4 rounded-2xl p-4" style={{ backgroundColor: visuals.soft }}>
              <div className="flex items-start gap-3">
                {Icon && (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: visuals.rail }}
                  >
                    <Icon size={20} strokeWidth={2.4} style={{ color: visuals.ink }} />
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight">{event.title}</h2>
                  <p className="mt-1 text-lg">{whenLine}</p>
                  {partLine && <p className="text-lg text-muted-foreground">{partLine}</p>}
                  <p className="mt-1 text-base font-medium" style={{ color: visuals.ink }}>
                    {owner?.display_name ? `${owner.display_name} · ` : ''}{label}
                  </p>
                </div>
              </div>
              {event.location && (
                <div className="mt-3">
                  <EventAddressLink location={event.location} className="text-base" />
                </div>
              )}
              {event.notes && <p className="mt-2 text-base text-muted-foreground">{event.notes}</p>}
            </div>
          );
        })()}

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
              <span className="block font-semibold text-base">{t('event.leakToMyCalendars')}</span>
              <span className="block text-sm text-muted-foreground mt-0.5">
                {t('event.leakToMyCalendarsHint')}
              </span>
            </span>
          </label>
        )}

        <div>
          <h3 className="text-base font-semibold text-muted-foreground mb-3">{t('event.comments')}</h3>
          {comments.length === 0 && (
            <p className="text-base text-muted-foreground text-center py-3">
              {t('event.noComments')}
            </p>
          )}
          <div className="space-y-3">
            {comments.map((c) => {
              const sender = getMemberById(c.sender_member_id);
              const senderColor = sender ? getMemberColor(sender.color_token) : getMemberColor('pastel-blue');
              return (
                <div key={c.id} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full ${senderColor.bg} flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                    {sender?.display_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{sender?.display_name || t('event.unknown')}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { locale: dateLocale, addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-base">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            className="mt-4 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddComment();
            }}
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('event.writeComment')}
              className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!comment.trim()}
              className="shrink-0 rounded-2xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t('event.send')}
            </button>
          </form>
        </div>
      </div>

      {editable && (
      <SheetActionDock>
        {confirmDelete ? (
          <div className="w-full max-w-xs rounded-2xl bg-background p-4 shadow-soft-lg">
            <p className="mb-3 text-center text-base font-medium">
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
        ) : (
          <>
            {editable && (
              <div className="flex items-center justify-center gap-3">
                {onQuickEdit && (
                  <button
                    type="button"
                    onClick={() => onQuickEdit(event)}
                    aria-label={t('event.edit')}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary active:bg-primary/25"
                  >
                    <Pencil size={18} strokeWidth={2.4} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label={t('event.delete')}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive active:bg-destructive/15"
                >
                  <Trash2 size={18} strokeWidth={2.4} />
                </button>
              </div>
            )}
          </>
        )}
      </SheetActionDock>
      )}
    </CenteredPopup>
  );
};

export default EventDetailSheet;
