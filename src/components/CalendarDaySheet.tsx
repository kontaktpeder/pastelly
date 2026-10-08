import { format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';
import DayOverview from '@/components/DayOverview';
import CenteredPopup from '@/components/CenteredPopup';

interface CalendarDaySheetProps {
  date: Date;
  events: DisplayEvent[];
  members: HouseholdMember[];
  householdId: string;
  currentMemberId: string;
  onClose: () => void;
  onPickEvent: (event: DisplayEvent) => void;
  onCreateForDate: (date: Date) => void;
  calendarKind?: string;
  canSeedWeek?: boolean;
  onSeedWeek?: () => void;
}

const CalendarDaySheet = ({
  date,
  events,
  members,
  householdId,
  currentMemberId,
  onClose,
  onPickEvent,
  onCreateForDate,
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
        members={members}
        householdId={householdId}
        currentMemberId={currentMemberId}
        calendarKind={calendarKind}
        canSeedWeek={canSeedWeek}
        layout="sheet"
        onPickEvent={onPickEvent}
        onCreateForDate={onCreateForDate}
        onSeedWeek={onSeedWeek}
      />
    </CenteredPopup>
  );
};

export default CalendarDaySheet;
