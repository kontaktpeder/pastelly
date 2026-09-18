import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notifyPartners } from '@/lib/notifyPartners';
import { targetDateStr } from '@/lib/countdownTime';
import { periodStorageKey, saveLocalJson } from '@/lib/vacationMode';
import type { Tables } from '@/integrations/supabase/types';

export type Countdown = Tables<'countdowns'>;
export type CountdownParticipant = Tables<'countdown_participants'>;

export type CountdownWithParticipants = Countdown & {
  countdown_participants: CountdownParticipant[];
};

function invalidateCountdowns(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['countdowns'] });
}

export function useCountdowns(householdId: string | undefined) {
  return useQuery({
    queryKey: ['countdowns', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('countdowns')
        .select('*, countdown_participants(*)')
        .eq('household_id', householdId!)
        .in('status', ['active', 'done'])
        .order('target_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CountdownWithParticipants[];
    },
  });
}

export function useActiveCountdowns(householdId: string | undefined) {
  const q = useCountdowns(householdId);
  return {
    ...q,
    data: (q.data ?? []).filter((c) => c.status === 'active'),
  };
}

export type CreateCountdownInput = {
  household_id: string;
  title: string;
  target_at: string;
  theme?: string;
  emoji?: string | null;
  invite_member_ids?: string[];
  /** For push: user_ids of invitees */
  invite_user_ids?: string[];
  ends_at?: string | null;
  use_vacation_mode?: boolean;
  timezone?: string | null;
};

export function useCreateCountdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCountdownInput) => {
      const { data, error } = await supabase.rpc('create_countdown', {
        p_household_id: input.household_id,
        p_title: input.title,
        p_target_at: input.target_at,
        p_theme: input.theme ?? 'rose',
        p_emoji: input.emoji ?? null,
        p_invite_member_ids: input.invite_member_ids ?? null,
        p_ends_at: input.ends_at ?? null,
        p_use_vacation_mode: input.use_vacation_mode ?? false,
        p_timezone: input.timezone ?? null,
      });
      if (error) {
        // Migration may not be applied yet — retry without period fields.
        if (input.ends_at || input.use_vacation_mode || input.timezone) {
          const fallback = await supabase.rpc('create_countdown', {
            p_household_id: input.household_id,
            p_title: input.title,
            p_target_at: input.target_at,
            p_theme: input.theme ?? 'rose',
            p_emoji: input.emoji ?? null,
            p_invite_member_ids: input.invite_member_ids ?? null,
          });
          if (fallback.error) throw fallback.error;
          return fallback.data as Countdown;
        }
        throw error;
      }
      return data as Countdown;
    },
    onSuccess: (created, vars) => {
      invalidateCountdowns(queryClient);
      if (vars.ends_at || vars.use_vacation_mode || vars.timezone) {
        saveLocalJson(periodStorageKey(created.id), {
          ends_at: vars.ends_at ?? created.ends_at ?? null,
          use_vacation_mode: vars.use_vacation_mode ?? created.use_vacation_mode ?? false,
          timezone: vars.timezone ?? created.timezone ?? null,
        });
      }
      if (vars.invite_user_ids && vars.invite_user_ids.length > 0) {
        const date = targetDateStr(created.target_at);
        notifyPartners({
          householdId: vars.household_id,
          kind: 'countdown_invite',
          title: 'Nedtelling ✨',
          body: `Du er invitert til «${created.title}» — bli med?`,
          countdownId: created.id,
          targetUserIds: vars.invite_user_ids,
          date,
        });
      }
    },
  });
}

export function useRespondToCountdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      countdownId: string;
      accept: boolean;
      householdId: string;
      title: string;
      targetAt: string;
      creatorUserId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('respond_to_countdown', {
        p_countdown_id: input.countdownId,
        p_accept: input.accept,
      });
      if (error) throw error;
      return data as CountdownParticipant;
    },
    onSuccess: (row, vars) => {
      invalidateCountdowns(queryClient);
      if (vars.accept && vars.creatorUserId) {
        notifyPartners({
          householdId: vars.householdId,
          kind: 'countdown_joined',
          title: 'Nedtelling ✨',
          body: `Noen ble med på «${vars.title}»!`,
          countdownId: vars.countdownId,
          targetUserIds: [vars.creatorUserId],
          date: targetDateStr(vars.targetAt),
        });
      }
    },
  });
}

export function useInviteToCountdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      countdownId: string;
      memberIds: string[];
      householdId: string;
      title: string;
      targetAt: string;
      inviteUserIds: string[];
    }) => {
      const { data, error } = await supabase.rpc('invite_to_countdown', {
        p_countdown_id: input.countdownId,
        p_member_ids: input.memberIds,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_count, vars) => {
      invalidateCountdowns(queryClient);
      if (vars.inviteUserIds.length > 0) {
        notifyPartners({
          householdId: vars.householdId,
          kind: 'countdown_invite',
          title: 'Nedtelling ✨',
          body: `Du er invitert til «${vars.title}» — bli med?`,
          countdownId: vars.countdownId,
          targetUserIds: vars.inviteUserIds,
          date: targetDateStr(vars.targetAt),
        });
      }
    },
  });
}

export function useCancelCountdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (countdownId: string) => {
      const { data, error } = await supabase.rpc('cancel_countdown', {
        p_countdown_id: countdownId,
      });
      if (error) throw error;
      return data as Countdown;
    },
    onSuccess: () => invalidateCountdowns(queryClient),
  });
}

export type UpdateCountdownInput = {
  countdownId: string;
  title?: string;
  target_at?: string;
  ends_at?: string | null;
  clear_ends_at?: boolean;
  use_vacation_mode?: boolean;
  timezone?: string | null;
};

export function useUpdateCountdown() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCountdownInput) => {
      const { data, error } = await supabase.rpc('update_countdown', {
        p_countdown_id: input.countdownId,
        p_title: input.title ?? null,
        p_target_at: input.target_at ?? null,
        p_ends_at: input.ends_at ?? null,
        p_use_vacation_mode: input.use_vacation_mode ?? null,
        p_timezone: input.timezone ?? null,
        p_clear_ends_at: input.clear_ends_at ?? false,
      });
      if (error) {
        // Keep a local overlay so start/end still drive vacation mode before migration.
        saveLocalJson(periodStorageKey(input.countdownId), {
          ends_at: input.clear_ends_at ? null : (input.ends_at ?? null),
          use_vacation_mode: input.use_vacation_mode ?? false,
          timezone: input.timezone ?? null,
        });
        throw error;
      }
      return data as Countdown;
    },
    onSuccess: (updated, vars) => {
      invalidateCountdowns(queryClient);
      saveLocalJson(periodStorageKey(vars.countdownId), {
        ends_at: vars.clear_ends_at ? null : (vars.ends_at ?? updated.ends_at ?? null),
        use_vacation_mode: vars.use_vacation_mode ?? updated.use_vacation_mode ?? false,
        timezone: vars.timezone ?? updated.timezone ?? null,
      });
    },
  });
}

export function myParticipant(
  countdown: CountdownWithParticipants,
  memberId: string,
): CountdownParticipant | undefined {
  return countdown.countdown_participants?.find((p) => p.member_id === memberId);
}
