import { supabase } from '@/integrations/supabase/client';

/** Push one Pastelly event to the user's Google "Hjem" calendar. */
export async function pushEventToGoogle(
  eventId: string,
  opts?: { deleted?: boolean },
): Promise<void> {
  if (!eventId) return;
  try {
    const { error } = await supabase.functions.invoke('google-calendar', {
      body: { action: 'push', event_id: eventId, deleted: !!opts?.deleted },
    });
    if (error) console.warn('[google] push failed', error.message);
  } catch (err) {
    console.warn('[google] push failed', err);
  }
}

/** Fire-and-forget wrapper for create/update paths. */
export function queuePushEventToGoogle(eventId: string): void {
  void pushEventToGoogle(eventId);
}

export function pullGoogleCalendar(householdId: string): void {
  if (!householdId) return;
  void supabase.functions
    .invoke('google-calendar', {
      body: { action: 'pull', household_id: householdId },
    })
    .then(({ data, error }) => {
      if (error) console.warn('[google] pull failed', error.message);
      return data;
    })
    .catch((err) => console.warn('[google] pull failed', err));
}

export async function startGoogleCalendarConnect(
  householdId: string,
  returnTo = typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://pastelly.no/',
): Promise<{ url?: string; error?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action: 'start', household_id: householdId, return_to: returnTo },
  });
  if (error) {
    return { error: error.message, message: error.message };
  }
  const payload = data as { url?: string; error?: string; message?: string };
  if (payload?.url) return { url: payload.url };
  return {
    error: payload?.error || 'unknown',
    message: payload?.message || 'Could not start Google connect',
  };
}

export async function fetchGoogleCalendarStatus(householdId: string) {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action: 'status', household_id: householdId },
  });
  if (error) throw error;
  return data as {
    connected: boolean;
    connection: {
      id: string;
      account_email: string | null;
      external_calendar_name: string | null;
      sync_enabled: boolean;
      last_synced_at: string | null;
      last_error: string | null;
    } | null;
  };
}

export async function disconnectGoogleCalendar(householdId: string) {
  const { error } = await supabase.functions.invoke('google-calendar', {
    body: { action: 'disconnect', household_id: householdId },
  });
  if (error) throw error;
}
