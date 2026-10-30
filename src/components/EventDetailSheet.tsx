import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
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
import DaySheetDateHeader from '@/components/DaySheetDateHeader';
import SheetActionDock from '@/components/SheetActionDock';
import { canEditEvent } from '@/lib/canEditEvent';
import { getMonthTheme, withAlpha } from '@/lib/monthTheme';
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

  const eventDate = new Date(event.event_date + 'T12:00:00');
  const theme = getMonthTheme(eventDate);
  const rule = withAlpha(theme.base, 0.4);
  const meta = EVENT_CATEGORY_META[(event.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
  const visuals = resolveCategoryVisuals(event.category, getMemberColorMap(owner));
  const label = resolveCategoryLabel(event.category, (event as any).category_label_override);
  const Icon = meta?.Icon;
  const hotel = isHotelCategory(event.category);
  const clockStart = !hotel && event.start_time ? event.start_time.slice(0, 5) : '';
  const clockEnd = !hotel && event.end_time ? event.end_time.slice(0, 5) : '';
  const dayPart = !hotel
    ? (() => {
        const dps = (event as any).day_part_start as string | null;
        const dpe = (event as any).day_part_end as string | null;
        if (dps && dpe && dps !== dpe) return `${dayPartLabel(dps)} – ${dayPartLabel(dpe)}`;
        if (dps === 'full_diem' || dps === 'all_day') return dayPartLabel(dps);
        return dayPartLabel(event.day_part) || '';
      })()
    : '';
  const timePrimary = clockStart || dayPart;
  const timeSecondary = clockStart ? clockEnd : '';
  const openEdit = onQuickEdit ?? onEdit;

  return (
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      detents={['half', 'full']}
      initialDetent="half"
      zClassName="z-[60]"
      backdrop="none"
      chrome={{ paper: theme.paper, accent: theme.base }}
    >
      <div
        className="flex-1 overflow-y-auto overscroll-contain scroll-touch px-5 min-h-0 pb-2"
        data-sheet-scroll
      >
        <DaySheetDateHeader date={eventDate} dateLocale={dateLocale} />

        <div className="flex items-stretch gap-3 border-b py-3.5" style={{ borderColor: rule }}>
          <span
            className={`flex w-[4.6rem] shrink-0 flex-col justify-start break-words pt-0.5 leading-tight text-foreground ${
              clockStart ? 'text-[15px] font-semibold tabular-nums' : 'text-[13px] font-semibold'
            }`}
          >
            <span>{timePrimary || ' '}</span>
            {timeSecondary && (
              <span className="font-medium text-foreground/75">{timeSecondary}</span>
            )}
          </span>
          <span className="my-0.5 w-px shrink-0 self-stretch" style={{ backgroundColor: rule }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              {Icon && (
                <Icon size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" style={{ color: visuals.ink }} aria-hidden />
              )}
              <h2 className="min-w-0 flex-1 break-words text-[1.05rem] font-semibold leading-snug text-foreground">
                {event.title}
              </h2>
            </div>
            <p className={`mt-0.5 break-words text-base leading-snug text-muted-foreground ${Icon ? 'pl-6' : ''}`}>
              {owner?.display_name ? `${owner.display_name} · ` : ''}{label}
            </p>
            {multiLabel && (
              <p className={`mt-0.5 break-words text-base leading-snug text-muted-foreground ${Icon ? 'pl-6' : ''}`}>
                {multiLabel}
              </p>
            )}
            {event.location && (
              <div className={`mt-1 ${Icon ? 'pl-6' : ''}`}>
                <EventAddressLink location={event.location} className="text-base" />
              </div>
            )}
            {event.notes && (
              <p className={`mt-1 break-words text-base text-muted-foreground ${Icon ? 'pl-6' : ''}`}>
                {event.notes}
              </p>
            )}
          </div>
        </div>

        {canOptInLeak && (
          <label className="flex cursor-pointer items-start gap-3 border-b py-3.5" style={{ borderColor: rule }}>
            <input
              type="checkbox"
              className="mt-1 rounded border-border"
              style={{ accentColor: theme.base }}
              checked={leaksToMyCalendars}
              disabled={setLeak.isPending}
              onChange={(e) => void handleToggleLeak(e.target.checked)}
            />
            <span>
              <span className="block text-base font-semibold">{t('event.leakToMyCalendars')}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {t('event.leakToMyCalendarsHint')}
              </span>
            </span>
          </label>
        )}

        <div className="pt-4">
          <h3
            className="mb-3 font-calendar text-[0.68rem] font-bold uppercase tracking-[0.18em]"
            style={{ color: theme.base }}
          >
            {t('event.comments')}
          </h3>
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
              className="min-w-0 flex-1 rounded-lg border bg-transparent px-4 py-3 text-base text-foreground focus:outline-none"
              style={{ borderColor: rule }}
            />
            <button
              type="submit"
              disabled={!comment.trim()}
              className="shrink-0 rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-40"
              style={{ backgroundColor: theme.base, color: theme.textOnStrong }}
            >
              {t('event.send')}
            </button>
          </form>
        </div>
      </div>

      {editable && (
      <SheetActionDock surface={theme.paper}>
        {confirmDelete ? (
          <div className="w-full">
            <p className="mb-3 text-center text-base font-medium">
              {t('event.deleteConfirm')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteEvent.isPending}
                className="min-h-12 rounded-lg border bg-transparent px-3 font-medium"
                style={{ borderColor: rule }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteEvent.isPending}
                className="min-h-12 rounded-lg bg-destructive px-3 font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {deleteEvent.isPending ? t('event.deleting') : t('event.deleteAction')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={t('event.delete')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-destructive/30 text-destructive"
            >
              <Trash2 size={18} strokeWidth={2.4} />
            </button>
            {openEdit && (
              <button
                type="button"
                onClick={() => openEdit(event)}
                className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg text-base font-semibold"
                style={{ backgroundColor: theme.base, color: theme.textOnStrong }}
              >
                <Pencil size={16} strokeWidth={2.4} />
                {t('event.edit')}
              </button>
            )}
          </div>
        )}
      </SheetActionDock>
      )}
    </CenteredPopup>
  );
};

export default EventDetailSheet;
