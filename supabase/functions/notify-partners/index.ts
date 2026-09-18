import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  shouldMuteWorkdayPush,
  type HolidayWithJoins,
} from '../_shared/personalVacation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  household_id?: string;
  kind?: string;
  title?: string;
  body?: string;
  event_id?: string | null;
  countdown_id?: string | null;
  target_user_ids?: string[] | null;
  date?: string | null;
};

type MemberRow = {
  id: string;
  user_id: string;
  timezone?: string | null;
  vacation_mode?: Record<string, unknown> | null;
};

const WORKDAY_CATEGORIES = new Set([
  'work',
  'meeting',
  'school',
  'important',
  'deadline',
  'production',
  'development',
  'admin',
  'client',
  'focus',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const onesignalKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY');

    if (!onesignalAppId || !onesignalKey || !supabaseUrl || !supabaseAnon) {
      return json({ error: 'Push is not configured on the server' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const payload = (await req.json()) as Body;
    const householdId = payload.household_id?.trim();
    const kind = payload.kind?.trim() || null;
    let title = payload.title?.trim();
    let body = payload.body?.trim();
    if (!householdId || !title || !body) {
      return json({ error: 'household_id, title and body are required' }, 400);
    }

    const { data: self, error: selfError } = await supabase
      .from('household_members')
      .select('id, display_name')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (selfError || !self) {
      return json({ error: 'Not a member of this household' }, 403);
    }

    if (kind === 'comment_added' && self.display_name) {
      title = 'Ny kommentar';
      body = `${self.display_name}: ${body}`;
    }

    let date = typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : null;

    const { data: allMembers, error: membersError } = await supabase
      .from('household_members')
      .select('id, user_id, timezone, vacation_mode')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .neq('user_id', user.id);

    if (membersError) {
      return json({ error: membersError.message }, 500);
    }

    let candidates = (allMembers ?? []) as MemberRow[];

    if (payload.target_user_ids && payload.target_user_ids.length > 0) {
      const wanted = new Set(payload.target_user_ids.filter(Boolean));
      candidates = candidates.filter((m) => wanted.has(m.user_id));
    }

    let eventCategory: string | null = null;

    // Only notify people who can see this event in the calendar.
    if (payload.event_id) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, household_id, visibility_type, owner_member_id, event_date, category')
        .eq('id', payload.event_id)
        .maybeSingle();

      if (eventError) {
        return json({ error: eventError.message }, 500);
      }
      if (!event || event.household_id !== householdId) {
        return json({ error: 'Event not found in household' }, 404);
      }
      eventCategory = typeof event.category === 'string' ? event.category : null;

      if (!date && typeof event.event_date === 'string') {
        date = event.event_date;
      }

      const visibility = event.visibility_type || 'all_members';
      if (visibility === 'private') {
        // Private to owner — never push to partners.
        candidates = [];
      } else if (visibility === 'selected_members') {
        const { data: visibleRows, error: visibleError } = await supabase
          .from('event_visible_members')
          .select('member_id')
          .eq('event_id', event.id);

        if (visibleError) {
          return json({ error: visibleError.message }, 500);
        }

        const allowed = new Set<string>([
          event.owner_member_id,
          ...(visibleRows ?? []).map((r) => r.member_id),
        ]);
        candidates = candidates.filter((m) => allowed.has(m.id));
      }
      // all_members → keep all candidates
    }

    if (eventCategory && WORKDAY_CATEGORIES.has(eventCategory) && candidates.length > 0) {
      const { data: holidayRows } = await supabase
        .from('countdowns')
        .select('id, target_at, ends_at, countdown_participants(member_id, status)')
        .eq('household_id', householdId)
        .eq('status', 'active')
        .eq('use_vacation_mode', true);
      const now = Date.now();
      const holidays = (holidayRows ?? []) as HolidayWithJoins[];
      candidates = candidates.filter((m) => {
        const prefs = (m.vacation_mode ?? {}) as Record<string, unknown>;
        return !shouldMuteWorkdayPush(m.id, prefs, holidays, now);
      });
    }

    const externalIds = [...new Set(candidates.map((p) => p.user_id).filter(Boolean))];

    if (externalIds.length === 0) {
      return json({ ok: true, sent: 0, reason: 'no_partners' });
    }

    const osRes = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${onesignalKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        target_channel: 'push',
        include_aliases: { external_id: externalIds },
        headings: { en: title, nb: title },
        contents: { en: body, nb: body },
        data: {
          kind,
          household_id: householdId,
          event_id: payload.event_id ?? null,
          countdown_id: payload.countdown_id ?? null,
          date,
        },
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('OneSignal error', osRes.status, osJson);
      return json({ error: 'OneSignal send failed', detail: osJson }, 502);
    }

    const onesignalId = typeof osJson?.id === 'string' ? osJson.id : '';
    if (!onesignalId) {
      console.warn('OneSignal accepted request but no recipients', osJson);
      return json({
        ok: true,
        sent: 0,
        reason: 'no_subscribed_devices',
        targets: externalIds.length,
        onesignal: osJson,
      });
    }

    return json({ ok: true, sent: externalIds.length, onesignal: osJson });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
