import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notifyPartners } from '@/lib/notifyPartners';
import type { Tables, TablesUpdate } from '@/integrations/supabase/types';

export type Event = Tables<'events'>;
export type EventComment = Tables<'event_comments'>;

export function useEventsForMonth(householdId: string | undefined, year: number, month: number) {
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return useQuery({
    queryKey: ['events', householdId, year, month],
    enabled: !!householdId,
    queryFn: async () => {
      // Fetch events that overlap with this month:
      // event_date <= monthEnd AND coalesce(end_date, event_date) >= monthStart
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('household_id', householdId!)
        .lte('event_date', monthEnd)
        .or(`end_date.gte.${monthStart},end_date.is.null`)
        .order('event_date')
        .order('day_part');
      if (error) throw error;
      // Filter: for events without end_date, event_date must be >= monthStart
      return (data ?? []).filter((e: any) => {
        const effectiveEnd = e.end_date || e.event_date;
        return effectiveEnd >= monthStart;
      });
    },
  });
}

export function useEventsForDate(householdId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['events', householdId, date],
    enabled: !!householdId && !!date,
    queryFn: async () => {
      // Fetch events that overlap with this date:
      // event_date <= date AND coalesce(end_date, event_date) >= date
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('household_id', householdId!)
        .lte('event_date', date)
        .or(`end_date.gte.${date},end_date.is.null`)
        .order('day_part');
      if (error) throw error;
      // Filter: for events without end_date, event_date must equal date
      return (data ?? []).filter((e: any) => {
        const effectiveEnd = e.end_date || e.event_date;
        return effectiveEnd >= date;
      });
    },
  });
}

export type CreateEventInput = {
  household_id: string;
  title: string;
  event_date: string;
  end_date?: string | null;
  day_part: string;
  day_part_start?: string | null;
  day_part_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  visibility_type?: string;
  location?: string | null;
  notes?: string | null;
  category: string;
  category_label_override?: string | null;
  hide_from_other_calendars?: boolean;
};

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: CreateEventInput) => {
      const { data, error } = await supabase.rpc('create_event_for_current_member', {
        p_household_id: event.household_id,
        p_title: event.title,
        p_event_date: event.event_date,
        p_end_date: event.end_date ?? event.event_date,
        p_day_part: event.day_part,
        p_day_part_start: event.day_part_start ?? undefined,
        p_day_part_end: event.day_part_end ?? undefined,
        p_start_time: event.start_time ?? undefined,
        p_end_time: event.end_time ?? undefined,
        p_visibility_type: event.visibility_type ?? 'all_members',
        p_location: event.location ?? undefined,
        p_notes: event.notes ?? undefined,
        p_category: event.category,
        p_category_label_override: event.category_label_override ?? undefined,
        p_hide_from_other_calendars: event.hide_from_other_calendars ?? false,
      });
      if (error) throw error;
      return data as Event;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overlay-events'] });
      queryClient.invalidateQueries({ queryKey: ['household-has-events'] });
      if (created?.household_id && created?.title) {
        notifyPartners({
          householdId: created.household_id,
          kind: 'event_created',
          title: 'Ny aktivitet',
          body: created.title,
          eventId: created.id,
          date: created.event_date,
        });
      }
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'events'> }) => {
      const { data, error } = await supabase.from('events').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overlay-events'] });
      if (updated?.household_id && updated?.title) {
        notifyPartners({
          householdId: updated.household_id,
          kind: 'event_updated',
          title: 'Aktivitet oppdatert',
          body: updated.title,
          eventId: updated.id,
          date: updated.event_date,
        });
      }
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['overlay-events'] });
    },
  });
}

export function useEventComments(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventComments', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_comments')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (comment: {
      event_id: string;
      sender_member_id: string;
      body: string;
      household_id: string;
      event_title?: string;
    }) => {
      const { data, error } = await supabase
        .from('event_comments')
        .insert({
          event_id: comment.event_id,
          sender_member_id: comment.sender_member_id,
          body: comment.body,
        })
        .select()
        .single();
      if (error) throw error;
      return { comment: data, meta: comment };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['eventComments', result.meta.event_id] });
      const preview = result.meta.body.trim().slice(0, 80);
      notifyPartners({
        householdId: result.meta.household_id,
        kind: 'comment_added',
        title: 'Ny kommentar',
        body: result.meta.event_title
          ? `${result.meta.event_title}: ${preview}`
          : preview,
        eventId: result.meta.event_id,
      });
    },
  });
}

export function useEventVisibleMembers(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventVisibleMembers', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_visible_members')
        .select('member_id')
        .eq('event_id', eventId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.member_id as string);
    },
  });
}

/**
 * Replace the set of members that can see this event.
 * Pass an empty array to clear (e.g. when switching to all_members or private).
 */
export async function fetchEventsForDateRange(
  householdId: string,
  start: string,
  end: string,
): Promise<Pick<Event, 'id' | 'title' | 'event_date' | 'start_time' | 'end_time'>[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, event_date, start_time, end_time')
    .eq('household_id', householdId)
    .lte('event_date', end)
    .or(`end_date.gte.${start},end_date.is.null`);
  if (error) throw error;
  return data ?? [];
}

export async function syncEventVisibleMembers(
  eventId: string,
  memberIds: string[],
): Promise<void> {
  const unique = Array.from(new Set(memberIds));
  const { error } = await supabase.rpc('sync_event_visible_members', {
    p_event_id: eventId,
    p_member_ids: unique,
  });
  if (error) throw error;
}
