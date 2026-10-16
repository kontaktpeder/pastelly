import { DAY_PART_ORDER, timeRangeToDayParts } from '@/lib/dayParts';
import type { CreateEventInput } from '@/hooks/useEvents';
import type { ImportVisibility, ShiftProposal } from './types';

export function proposalToCreateInput(
  proposal: ShiftProposal,
  householdId: string,
  visibility: ImportVisibility,
  category: string,
  hideFromOtherCalendars: boolean,
): CreateEventInput {
  const [startIdx, endIdx] = timeRangeToDayParts(proposal.startTime, proposal.endTime);
  return {
    household_id: householdId,
    title: proposal.title.trim() || 'Jobb',
    event_date: proposal.eventDate!,
    end_date: proposal.endDate ?? proposal.eventDate!,
    day_part: DAY_PART_ORDER[startIdx],
    day_part_start: DAY_PART_ORDER[startIdx],
    day_part_end: DAY_PART_ORDER[endIdx],
    start_time: proposal.startTime,
    end_time: proposal.endTime,
    visibility_type: visibility,
    location: proposal.location,
    notes: null,
    category,
    hide_from_other_calendars: hideFromOtherCalendars,
  };
}
