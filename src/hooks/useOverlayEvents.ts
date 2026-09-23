import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Event } from '@/hooks/useEvents';

export type OverlayEventRow = {
  id: string;
  source_household_id: string;
  source_household_name: string;
  source_household_kind: string;
  event_date: string;
  end_date: string | null;
  day_part: string;
  day_part_start: string | null;
  day_part_end: string | null;
  start_time: string | null;
  end_time: string | null;
  source_member_id: string;
};

/** Display-shaped event for calendar UI; overlays are read-only. */
export type DisplayEvent = Event & {
  isOverlay?: boolean;
  /** Read-only production block from Work. Never a Pastelly event row. */
  isWorkBlock?: boolean;
  workUrl?: string | null;
  sourceHouseholdId?: string;
  sourceHouseholdName?: string;
  sourceHouseholdKind?: string;
};

/** Soft blue blob + stronger icon, matched to category mark language. */
export const OVERLAY_MARK = {
  soft: '#BED2FA',
  rail: '#BED2FA',
  ink: '#4678E6',
} as const;

export function overlayToDisplayEvent(row: OverlayEventRow): DisplayEvent {
  const kind = (row.source_household_kind || 'home').toLowerCase();
  return {
    id: row.id,
    household_id: row.source_household_id,
    owner_member_id: row.source_member_id,
    title: row.source_household_name,
    event_date: row.event_date,
    end_date: row.end_date,
    day_part: row.day_part,
    day_part_start: row.day_part_start,
    day_part_end: row.day_part_end,
    start_time: row.start_time,
    end_time: row.end_time,
    visibility_type: 'all_members',
    location: null,
    notes: null,
    // Neutral category so multi-day rails don't look like local work events;
    // CalendarView uses sourceHouseholdKind for the suitcase icon.
    category: 'other',
    category_label_override: null,
    priority: 'normal',
    created_at: '',
    updated_at: '',
    hide_from_other_calendars: false,
    isOverlay: true,
    sourceHouseholdId: row.source_household_id,
    sourceHouseholdName: row.source_household_name,
    sourceHouseholdKind: kind,
  };
}

export function useOverlayEventsForMonth(
  householdId: string | undefined,
  year: number,
  month: number,
) {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return useOverlayEventsForRange(householdId, monthStart, monthEnd);
}

export function useOverlayEventsForRange(
  householdId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  return useQuery({
    queryKey: ['overlay-events', householdId, startDate, endDate],
    enabled: !!householdId && !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_overlay_events_for_household', {
        p_household_id: householdId!,
        p_start_date: startDate!,
        p_end_date: endDate!,
      });
      if (error) throw error;
      return (data ?? []).map(overlayToDisplayEvent);
    },
  });
}

export function mergeEventsWithOverlays(
  events: Event[],
  overlays: DisplayEvent[],
): DisplayEvent[] {
  const localIds = new Set(events.map((e) => e.id));
  const uniqueOverlays = overlays.filter((o) => !localIds.has(o.id));
  return [...events, ...uniqueOverlays];
}
