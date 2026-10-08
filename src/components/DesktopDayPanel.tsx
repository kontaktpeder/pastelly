import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import { useEventsForDate, type Event } from '@/hooks/useEvents';
import {
  mergeEventsWithOverlays,
  useOverlayEventsForRange,
  type DisplayEvent,
} from '@/hooks/useOverlayEvents';
import { mergeWorkBlocks, useWorkScheduleBlocks } from '@/hooks/useWorkSchedule';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { Highlight } from '@/pages/Index';
import DayOverview from '@/components/DayOverview';
import EventDetailSheet from '@/components/EventDetailSheet';
import OverlayEventSheet from '@/components/OverlayEventSheet';
import WorkBlockSheet from '@/components/WorkBlockSheet';

interface DesktopDayPanelProps {
  date: Date;
  householdId: string;
  members: HouseholdMember[];
  currentMemberId: string;
  calendarKind: string;
  highlight?: Highlight;
  canSeedWeek?: boolean;
  onCreateForDate: (date: Date) => void;
  onEditEvent?: (event: Event) => void;
  onQuickEditEvent?: (event: Event) => void;
  onSeedWeek?: () => void;
  onSwitchCalendar?: (householdId: string) => void;
  showInOtherCalendars?: boolean;
}

const DesktopDayPanel = ({
  date,
  householdId,
  members,
  currentMemberId,
  calendarKind,
  highlight,
  canSeedWeek = false,
  onCreateForDate,
  onEditEvent,
  onQuickEditEvent,
  onSeedWeek,
  onSwitchCalendar,
  showInOtherCalendars = false,
}: DesktopDayPanelProps) => {
  const { t, dateLocale } = useLocale();
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [overlayEvent, setOverlayEvent] = useState<DisplayEvent | null>(null);
  const [workBlock, setWorkBlock] = useState<DisplayEvent | null>(null);

  const dateStr = format(date, 'yyyy-MM-dd');
  const { data: localEvents = [] } = useEventsForDate(householdId, dateStr);
  const { data: overlays = [] } = useOverlayEventsForRange(householdId, dateStr, dateStr);
  const { data: workBlocks = [] } = useWorkScheduleBlocks(householdId, dateStr, dateStr);

  const events = useMemo(
    () => mergeWorkBlocks(mergeEventsWithOverlays(localEvents, overlays), workBlocks),
    [localEvents, overlays, workBlocks],
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border/60 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('event.selectedDay')}
          </p>
          <h2 className="mt-1 text-lg font-bold capitalize">
            {format(date, 'EEEE d. MMMM', { locale: dateLocale })}
          </h2>
        </div>

        <DayOverview
          date={date}
          events={events}
          members={members}
          householdId={householdId}
          currentMemberId={currentMemberId}
          calendarKind={calendarKind}
          canSeedWeek={canSeedWeek}
          onPickEvent={(ev) => {
            if (ev.isWorkBlock) setWorkBlock(ev);
            else if (ev.isOverlay) setOverlayEvent(ev);
            else setDetailEvent(ev);
          }}
          onCreateForDate={onCreateForDate}
          onSeedWeek={onSeedWeek}
        />
      </div>

      <AnimatePresence>
        {workBlock && <WorkBlockSheet event={workBlock} onClose={() => setWorkBlock(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {overlayEvent && (
          <OverlayEventSheet
            event={overlayEvent}
            viewerHouseholdId={householdId}
            onClose={() => setOverlayEvent(null)}
            onOpenSourceCalendar={(id) => {
              setOverlayEvent(null);
              onSwitchCalendar?.(id);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailEvent && (
          <EventDetailSheet
            event={detailEvent}
            members={members}
            currentMemberId={currentMemberId}
            calendarKind={calendarKind}
            showInOtherCalendars={showInOtherCalendars}
            onClose={() => setDetailEvent(null)}
            onEdit={
              onEditEvent
                ? (ev) => {
                    setDetailEvent(null);
                    onEditEvent(ev);
                  }
                : undefined
            }
            onQuickEdit={
              onQuickEditEvent
                ? (ev) => {
                    setDetailEvent(null);
                    onQuickEditEvent(ev);
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default DesktopDayPanel;
