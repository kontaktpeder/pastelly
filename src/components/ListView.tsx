import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { format, addDays, subDays, isToday } from 'date-fns';
import { getMonthTheme } from '@/lib/monthTheme';
import { useEventsForDate, type Event } from '@/hooks/useEvents';
import {
  useListItemsForDate,
  useCreateListItem,
  useToggleListItem,
  useUpdateListItem,
  useDeleteListItem,
  type ListItem,
} from '@/hooks/useListItems';
import { resolveCategoryVisuals, getMemberColorMap } from '@/lib/categoryPresentation';
import { EVENT_CATEGORY_META } from '@/lib/eventCategories';
import { formatMultiDayLabel } from '@/lib/multiDaySpans';
import type { HouseholdMember } from '@/hooks/useHousehold';
import { canEditEvent } from '@/lib/canEditEvent';
import type { CalendarKind } from '@/lib/calendarKinds';
import type { Highlight } from '@/pages/Index';
import { useLocale } from '@/hooks/useLocale';
import { useVacationMode } from '@/hooks/useVacationMode';
import EventDetailSheet from '@/components/EventDetailSheet';
import ViewHeader from '@/components/ViewHeader';
import { useLongPress } from '@/hooks/useLongPress';
import { focusFieldSoftly, scrollFocusIntoView } from '@/lib/scrollFocusIntoView';

interface ListViewProps {
  householdId: string;
  members: HouseholdMember[];
  currentMemberId: string;
  calendarKind?: CalendarKind | string;
  initialDate?: Date;
  onDateChange?: (date: Date) => void;
  onEditEvent?: (event: Event) => void;
  onQuickEditEvent?: (event: Event) => void;
  highlight?: Highlight;
  /** Compact mode inside day dialog — fixed date, no day header/swipe */
  embedded?: boolean;
}

const ListView = ({
  householdId,
  members,
  currentMemberId,
  calendarKind = 'home',
  initialDate,
  onDateChange,
  onEditEvent,
  onQuickEditEvent,
  highlight,
  embedded = false,
}: ListViewProps) => {
  const { dateLocale } = useLocale();
  const vacation = useVacationMode();
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
  const [newItem, setNewItem] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const { data: events = [] } = useEventsForDate(householdId, dateStr);
  const { data: listItems = [] } = useListItemsForDate(householdId, dateStr);
  const createItem = useCreateListItem();
  const toggleItem = useToggleListItem();
  const updateItem = useUpdateListItem();
  const deleteItem = useDeleteListItem();

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (!embedded) onDateChange?.(selectedDate);
  }, [selectedDate, onDateChange, embedded]);

  useEffect(() => {
    if (!editingId) return;
    const t = window.setTimeout(() => focusFieldSoftly(editInputRef.current), 40);
    return () => window.clearTimeout(t);
  }, [editingId]);

  const handleSwipe = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 50) {
      setSelectedDate((d) => (info.offset.x < 0 ? addDays(d, 1) : subDays(d, 1)));
    }
  };

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    createItem.mutate({
      household_id: householdId,
      title: newItem.trim(),
      item_date: dateStr,
      owner_member_id: currentMemberId,
    });
    setNewItem('');
    inputRef.current?.focus();
  };

  const startEdit = (item: ListItem) => {
    setEditingId(item.id);
    setEditText(item.title);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    const id = editingId;
    setEditingId(null);
    if (!trimmed) return;
    const current = listItems.find((i) => i.id === id);
    if (current && current.title === trimmed) return;
    updateItem.mutate({ id, title: trimmed });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const getMemberForEvent = (event: Event) => members.find((m) => m.id === event.owner_member_id);

  const sortedEvents = vacation.filterEvents([...events]).sort((a, b) =>
    (a.start_time || '').localeCompare(b.start_time || ''),
  );

  const composer = (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        value={newItem}
        onChange={(e) => setNewItem(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
        onFocus={scrollFocusIntoView}
        placeholder="Legg til punkt..."
        className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={handleAddItem}
        disabled={!newItem.trim()}
        className="rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-40 transition-all"
      >
        +
      </button>
    </div>
  );

  return (
    <>
      <motion.div
        drag={embedded ? false : 'x'}
        dragDirectionLock={!embedded}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={embedded ? undefined : handleSwipe}
        style={{ touchAction: 'pan-y' }}
        className="flex flex-col h-full min-h-0"
      >
        {!embedded && (
          <ViewHeader
            variant="calendar"
            onPrev={() => setSelectedDate((d) => subDays(d, 1))}
            onNext={() => setSelectedDate((d) => addDays(d, 1))}
            calendarStyle={{
              background: getMonthTheme(selectedDate).gradient,
              color: getMonthTheme(selectedDate).textOnLight,
            }}
          >
            {isToday(selectedDate)
              ? `I dag · ${format(selectedDate, 'd. MMM', { locale: dateLocale })}`
              : format(selectedDate, 'EEEE d. MMM', { locale: dateLocale })}
          </ViewHeader>
        )}

        <div
          data-sheet-scroll={embedded ? true : undefined}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-5 space-y-2 ${
            embedded ? 'pt-1 pb-3' : 'pt-3 pb-4'
          }`}
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {/* Events */}
          <div className="space-y-2">
            {sortedEvents.length === 0 ? (
              <div className="py-2 flex items-center justify-center">
                <span className="text-xs text-muted-foreground/50">Ingen aktiviteter</span>
              </div>
            ) : (
              sortedEvents.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  currentMemberId={currentMemberId}
                  calendarKind={calendarKind}
                  highlight={highlight}
                  onTap={(e) => setSelectedEvent(e)}
                  onLongPress={(e) => onEditEvent?.(e)}
                  getMemberForEvent={getMemberForEvent}
                />
              ))
            )}
          </div>

          <div className="h-px bg-border/60 my-2" />

          {/* List items */}
          <div className="space-y-2">
            {listItems.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <motion.div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-soft"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditing) return;
                      toggleItem.mutate({ id: item.id, is_checked: !item.is_checked });
                    }}
                    className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${
                      item.is_checked ? 'bg-primary border-primary' : 'border-border hover:border-primary'
                    }`}
                    aria-label={item.is_checked ? 'Avmerk' : 'Merk som ferdig'}
                  >
                    {item.is_checked && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 7L6 10L11 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-primary-foreground"
                        />
                      </svg>
                    )}
                  </button>

                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onFocus={scrollFocusIntoView}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className={`flex-1 min-w-0 text-left text-base ${
                        item.is_checked ? 'line-through text-muted-foreground' : ''
                      }`}
                    >
                      {item.title}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (editingId === item.id) cancelEdit();
                      deleteItem.mutate(item.id);
                    }}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
                    aria-label="Slett"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </motion.div>
              );
            })}

            {events.length === 0 && listItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="font-medium">Ingen planer ennå</p>
              </div>
            )}
          </div>
        </div>

        {/* Composer pinned to bottom of sheet / view */}
        <div
          className={`shrink-0 border-t border-border/60 bg-background px-5 pt-3 ${
            embedded ? 'pb-3' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
          }`}
        >
          {composer}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedEvent && (
          <EventDetailSheet
            event={selectedEvent}
            members={members}
            currentMemberId={currentMemberId}
            calendarKind={calendarKind}
            onClose={() => setSelectedEvent(null)}
            onEdit={onEditEvent ? (ev) => { onEditEvent(ev); } : undefined}
            onQuickEdit={onQuickEditEvent ? (ev) => { onQuickEditEvent(ev); } : undefined}
          />
        )}
      </AnimatePresence>
    </>
  );
};

interface EventRowProps {
  event: Event;
  currentMemberId: string;
  calendarKind: CalendarKind | string;
  highlight: Highlight;
  onTap: (event: Event) => void;
  onLongPress: (event: Event) => void;
  getMemberForEvent: (event: Event) => HouseholdMember | undefined;
}

const EventRow = ({ event, currentMemberId, calendarKind, highlight, onTap, onLongPress, getMemberForEvent }: EventRowProps) => {
  const { t, dateLocale } = useLocale();
  const { longPressHandlers, didFire } = useLongPress({
    onLongPress: () => {
      if (canEditEvent(event, currentMemberId, calendarKind)) onLongPress(event);
    },
  });

  const member = getMemberForEvent(event);
  const visuals = resolveCategoryVisuals(event.category, getMemberColorMap(member));
  const meta = EVENT_CATEGORY_META[(event.category as keyof typeof EVENT_CATEGORY_META) || 'other'];
  const Icon = meta?.Icon;
  const isHighlighted = highlight && highlight.eventId === event.id;
  const multiLabel = formatMultiDayLabel(event, {
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
    <button
      type="button"
      {...longPressHandlers}
      onClick={() => { if (!didFire()) onTap(event); }}
      className={`w-full text-left rounded-xl p-3 flex items-center gap-2.5 ${
        isHighlighted ? 'ring-2 ring-primary/40' : ''
      }`}
      style={{ backgroundColor: visuals.soft }}
    >
      <span
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
        style={{ backgroundColor: visuals.rail }}
      >
        {Icon && <Icon size={12} strokeWidth={2} style={{ color: visuals.ink }} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-sm block truncate">{event.title}</span>
        {multiLabel && (
          <span className="text-xs text-muted-foreground block mt-0.5">{multiLabel}</span>
        )}
      </span>
    </button>
  );
};

export default ListView;
