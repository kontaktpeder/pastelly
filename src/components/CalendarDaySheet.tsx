import { format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import type { Event } from '@/hooks/useEvents';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';
import type { CountdownWithParticipants } from '@/hooks/useCountdowns';
import DayOverview from '@/components/DayOverview';
import CenteredPopup from '@/components/CenteredPopup';

interface CalendarDaySheetProps {
  date: Date;
  events: DisplayEvent[];
  countdowns?: CountdownWithParticipants[];
  members: HouseholdMember[];
  householdId: string;
  currentMemberId: string;
  onClose: () => void;
  onPickEvent: (event: DisplayEvent) => void;
  onPickCountdown?: (countdown: CountdownWithParticipants) => void;
  onCreateForDate: (date: Date) => void;
  onCreateCountdown?: (date: Date) => void;
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
  onClose,
  onPickEvent,
  onPickCountdown,
  onCreateForDate,
  onCreateCountdown,
  calendarKind = 'home',
  canSeedWeek = false,
  onSeedWeek,
}: CalendarDaySheetProps) => {
  const { dateLocale } = useLocale();

  return (
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
        onSeedWeek={onSeedWeek}
      />
    </CenteredPopup>
  );
};

export default CalendarDaySheet;
