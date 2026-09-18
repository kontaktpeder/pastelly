import { useState } from 'react';
import { format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import type { Event } from '@/hooks/useEvents';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { CountdownWithParticipants } from '@/hooks/useCountdowns';
import type { Highlight } from '@/pages/Index';
import DayOverview from '@/components/DayOverview';
import ListView from '@/components/ListView';
import CenteredPopup from '@/components/CenteredPopup';

interface CalendarDaySheetProps {
  date: Date;
  events: DisplayEvent[];
  countdowns?: CountdownWithParticipants[];
  members: HouseholdMember[];
  householdId: string;
  currentMemberId: string;
  highlight?: Highlight;
  onClose: () => void;
  onPickEvent: (event: DisplayEvent) => void;
  onPickCountdown?: (countdown: CountdownWithParticipants) => void;
  onCreateForDate: (date: Date) => void;
  onCreateCountdown?: (date: Date) => void;
  onEditEvent?: (event: Event) => void;
  onQuickEditEvent?: (event: Event) => void;
  calendarKind?: string;
  canSeedWeek?: boolean;
  onSeedWeek?: () => void;
}

const CalendarDaySheet = ({
  date,
  events,
  countdowns = [],
  members,
  householdId,
  currentMemberId,
  highlight,
  onClose,
  onPickEvent,
  onPickCountdown,
  onCreateForDate,
  onCreateCountdown,
  onEditEvent,
  onQuickEditEvent,
  calendarKind = 'home',
  canSeedWeek = false,
  onSeedWeek,
}: CalendarDaySheetProps) => {
  const { t, dateLocale } = useLocale();
  const [showList, setShowList] = useState(false);

  return (
    <>
      <CenteredPopup
        onClose={onClose}
        onExit={onClose}
        size="sheet"
        detents={['half', 'full']}
        initialDetent="half"
        zClassName="z-50"
      >
        <div className="shrink-0 px-5 pb-3 pt-1">
          <h2 className="text-lg font-bold capitalize">
            {format(date, 'EEEE d. MMMM', { locale: dateLocale })}
          </h2>
        </div>

        <DayOverview
          date={date}
          events={events}
          countdowns={countdowns}
          members={members}
          householdId={householdId}
          currentMemberId={currentMemberId}
          calendarKind={calendarKind}
          canSeedWeek={canSeedWeek}
          layout="sheet"
          onPickEvent={onPickEvent}
          onPickCountdown={onPickCountdown}
          onCreateForDate={onCreateForDate}
          onCreateCountdown={onCreateCountdown}
          onSeeList={() => setShowList(true)}
          onSeedWeek={onSeedWeek}
        />
      </CenteredPopup>

      {showList && (
        <CenteredPopup
          onClose={() => setShowList(false)}
          onExit={() => setShowList(false)}
          size="sheet"
          zClassName="z-[55]"
        >
          <div className="shrink-0 px-5 pb-2 pt-1">
            <h2 className="text-lg font-bold">
              {t('event.list')}
              <span className="text-base font-medium text-muted-foreground">
                {' · '}
                {format(date, 'd. MMM', { locale: dateLocale })}
              </span>
            </h2>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ListView
              householdId={householdId}
              members={members}
              currentMemberId={currentMemberId}
              calendarKind={calendarKind}
              initialDate={date}
              embedded
              highlight={highlight}
              onEditEvent={onEditEvent}
              onQuickEditEvent={onQuickEditEvent}
            />
          </div>
        </CenteredPopup>
      )}
    </>
  );
};

export default CalendarDaySheet;
