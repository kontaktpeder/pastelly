import { useLocale } from '@/hooks/useLocale';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';
import type { HouseholdMember } from '@/hooks/useHousehold';
import DayOverview from '@/components/DayOverview';
import DaySheetDateHeader from '@/components/DaySheetDateHeader';
import CenteredPopup from '@/components/CenteredPopup';
import { getMonthTheme } from '@/lib/monthTheme';

interface CalendarDaySheetProps {
  date: Date;
  events: DisplayEvent[];
  members: HouseholdMember[];
  householdId: string;
  currentMemberId: string;
  onClose: () => void;
  onPickEvent: (event: DisplayEvent) => void;
  onCreateForDate: (date: Date) => void;
  onImportForDate?: (date: Date) => void;
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
  onImportForDate,
  calendarKind = 'home',
  canSeedWeek = false,
  onSeedWeek,
}: CalendarDaySheetProps) => {
  const { dateLocale } = useLocale();
  const theme = getMonthTheme(date);

  return (
    <CenteredPopup
      onClose={onClose}
      onExit={onClose}
      size="sheet"
      detents={['half', 'full']}
      initialDetent="half"
      fitContent
      zClassName="z-50"
      chrome={{ paper: theme.paper, accent: theme.base }}
    >
      <DayOverview
        date={date}
        events={events}
        members={members}
        householdId={householdId}
        currentMemberId={currentMemberId}
        calendarKind={calendarKind}
        canSeedWeek={canSeedWeek}
        layout="sheet"
        header={<DaySheetDateHeader date={date} dateLocale={dateLocale} />}
        onPickEvent={onPickEvent}
        onCreateForDate={onCreateForDate}
        onImportForDate={onImportForDate}
        onSeedWeek={onSeedWeek}
      />
    </CenteredPopup>
  );
};

export default CalendarDaySheet;
