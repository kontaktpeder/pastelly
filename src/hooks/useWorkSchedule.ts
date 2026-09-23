import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DisplayEvent } from '@/hooks/useOverlayEvents';

export const WORK_BLOCK_MARK = {
  soft: '#F3E2B8',
  rail: '#E4C98A',
  ink: '#8A5A12',
} as const;

type WorkBlock = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  comment: string | null;
  work_url: string | null;
};

function blockToDisplayEvent(block: WorkBlock, householdId: string): DisplayEvent {
  return {
    id: `work:${block.id}`,
    household_id: householdId,
    owner_member_id: '',
    title: block.title,
    event_date: block.event_date,
    end_date: null,
    day_part: 'afternoon',
    day_part_start: null,
    day_part_end: null,
    start_time: block.start_time,
    end_time: block.end_time,
    visibility_type: 'all_members',
    location: block.location,
    notes: block.comment,
    category: 'other',
    category_label_override: null,
    priority: 'normal',
    created_at: '',
    updated_at: '',
    hide_from_other_calendars: true,
    isWorkBlock: true,
    workUrl: block.work_url,
  };
}

export function mergeWorkBlocks(events: DisplayEvent[], blocks: DisplayEvent[]): DisplayEvent[] {
  const ids = new Set(events.map((event) => event.id));
  return [...events, ...blocks.filter((block) => !ids.has(block.id))];
}

export function useWorkScheduleBlocks(
  householdId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  const link = useQuery({
    queryKey: ['work-org-link', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('households')
        .select('work_organization_id')
        .eq('id', householdId!)
        .maybeSingle();
      if (error) throw error;
      return data?.work_organization_id ?? null;
    },
  });

  const blocks = useQuery({
    queryKey: ['work-schedule', householdId, startDate, endDate],
    enabled: !!householdId && !!startDate && !!endDate && !!link.data,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('work-schedule', {
        body: { household_id: householdId, from: startDate, to: endDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const rows = (data?.blocks ?? []) as WorkBlock[];
      return rows.map((row) => blockToDisplayEvent(row, householdId!));
    },
  });

  const linked = !!link.data;
  return {
    data: linked ? (blocks.data ?? []) : [],
    isFetched: linked ? blocks.isFetched || blocks.isError : link.isFetched || link.isError,
    isError: linked ? blocks.isError : link.isError,
  };
}
