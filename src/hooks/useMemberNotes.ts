import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { noteEmoji, type NoteEmoji } from '@/lib/memberNotes';

export type MemberNote = {
  id: string;
  body: string;
  emoji: NoteEmoji;
  createdAt: string;
  fromName: string;
};

const queryKey = (memberIds: string[]) => ['member-notes', [...memberIds].sort().join(',')] as const;

export function useUnreadMemberNotes(memberIds: string[]) {
  const ids = [...memberIds].sort();
  return useQuery({
    queryKey: queryKey(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<MemberNote[]> => {
      const { data, error } = await supabase
        .from('member_notes')
        .select('id, body, emoji, created_at, from_member_id')
        .in('to_member_id', ids)
        .is('read_at', null)
        .order('created_at', { ascending: true })
        .limit(20);
      if (error) throw error;

      const notes = data ?? [];
      const senderIds = [...new Set(notes.map((note) => note.from_member_id))];
      const names = new Map<string, string>();
      if (senderIds.length > 0) {
        const { data: people, error: peopleError } = await supabase
          .from('household_members')
          .select('id, display_name')
          .in('id', senderIds);
        if (peopleError) throw peopleError;
        for (const person of people ?? []) names.set(person.id, person.display_name);
      }

      return notes.map((note) => ({
        id: note.id,
        body: note.body,
        emoji: noteEmoji(note.emoji),
        createdAt: note.created_at,
        fromName: names.get(note.from_member_id) ?? '',
      }));
    },
  });
}

export function useSendMemberNote() {
  return useMutation({
    mutationFn: async (input: {
      householdId: string;
      fromMemberId: string;
      toMemberId: string;
      body: string;
      emoji: NoteEmoji;
    }) => {
      const { error } = await supabase.from('member_notes').insert({
        household_id: input.householdId,
        from_member_id: input.fromMemberId,
        to_member_id: input.toMemberId,
        body: input.body.trim(),
        emoji: input.emoji,
      });
      if (error) throw error;
    },
  });
}

export function useMarkMemberNoteRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('member_notes')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('not updated');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-notes'] });
    },
  });
}
