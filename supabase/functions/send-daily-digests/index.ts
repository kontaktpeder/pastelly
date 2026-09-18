import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  shouldMuteWorkdayPush,
  type HolidayWithJoins,
} from '../_shared/personalVacation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type MemberRow = {
  id: string;
  user_id: string;
  household_id: string;
  display_name: string;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  timezone: string;
  daily_digest_last_sent_on: string | null;
  vacation_mode?: Record<string, unknown> | null;
};

type EventRow = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  start_time: string | null;
  visibility_type: string;
  owner_member_id: string;
  category?: string | null;
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (!onesignalAppId || !onesignalKey || !supabaseUrl || !supabaseAnon || !serviceKey) {
      return json({ error: 'Push/digest is not configured on the server' }, 500);
    }

    const body = await req.json().catch(() => ({} as { mode?: string; household_id?: string }));
    const mode = body.mode === 'self' ? 'self' : 'cron';
    const requestedHouseholdId =
      typeof body.household_id === 'string' && body.household_id ? body.household_id : null;

    const admin = createClient(supabaseUrl, serviceKey);

    if (mode === 'self') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Unauthorized' }, 401);
      const userClient = createClient(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();
      if (userError || !user) return json({ error: 'Unauthorized' }, 401);

      let memberQuery = admin
        .from('household_members')
        .select(
          'id, user_id, household_id, display_name, daily_digest_enabled, daily_digest_time, timezone, daily_digest_last_sent_on, vacation_mode',
        )
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (requestedHouseholdId) {
        memberQuery = memberQuery.eq('household_id', requestedHouseholdId);
      }

      const { data: member, error: memberError } = await memberQuery.limit(1).maybeSingle();

      if (memberError || !member) return json({ error: 'No active household membership' }, 404);

      const result = await sendDigestForMember(admin, member as MemberRow, onesignalAppId, onesignalKey, {
        force: true,
      });
      return json({ ok: true, ...result });
    }

    // Cron / scheduled batch
    // Note: pg_net often strips Authorization — prefer x-cron-secret.
    // Accept: CRON_SECRET env, DB token (app_cron_token), or Bearer service role.
    const providedCron = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('Authorization') ?? '';

    let dbToken: string | null = null;
    {
      const { data: tokenRow } = await admin
        .from('app_cron_token')
        .select('token')
        .eq('id', 1)
        .maybeSingle();
      dbToken = typeof tokenRow?.token === 'string' ? tokenRow.token : null;
    }

    const okCron =
      (cronSecret && providedCron === cronSecret) ||
      (dbToken != null && providedCron === dbToken) ||
      (providedCron != null && providedCron === serviceKey) ||
      authHeader === `Bearer ${serviceKey}`;
    if (!okCron) return json({ error: 'Unauthorized' }, 401);

    const { data: members, error: membersError } = await admin
      .from('household_members')
      .select(
        'id, user_id, household_id, display_name, daily_digest_enabled, daily_digest_time, timezone, daily_digest_last_sent_on, vacation_mode',
      )
      .eq('is_active', true)
      .eq('daily_digest_enabled', true);

    if (membersError) return json({ error: membersError.message }, 500);

    const due = (members as MemberRow[]).filter(isDueNow);
    // One push per user — prefer earliest membership when several calendars are due.
    const dueByUser = new Map<string, MemberRow>();
    for (const member of due) {
      if (!dueByUser.has(member.user_id)) dueByUser.set(member.user_id, member);
    }
    const uniqueDue = [...dueByUser.values()];
    const results = [];
    for (const member of uniqueDue) {
      const result = await sendDigestForMember(admin, member, onesignalAppId, onesignalKey, {
        force: false,
      });
      results.push(result);
      // Mark all of this user's due memberships sent so we don't double-fire next tick.
      if ((result as { sent?: boolean }).sent) {
        const tz = member.timezone || 'Europe/Oslo';
        const dateStr = localParts(tz).dateStr;
        const siblingIds = due.filter((m) => m.user_id === member.user_id).map((m) => m.id);
        if (siblingIds.length > 1) {
          await admin
            .from('household_members')
            .update({ daily_digest_last_sent_on: dateStr })
            .in('id', siblingIds);
        }
      }
    }

    return json({
      ok: true,
      checked: members?.length ?? 0,
      due: due.length,
      sentUsers: uniqueDue.length,
      results,
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function isDueNow(member: MemberRow): boolean {
  const tz = member.timezone || 'Europe/Oslo';
  const local = localParts(tz);
  const pref = (member.daily_digest_time || '07:00:00').slice(0, 5);
  const [ph, pm] = pref.split(':').map(Number);
  const prefMinutes = ph * 60 + pm;
  const nowMinutes = local.hour * 60 + local.minute;
  // 15-minute window so a */15 cron hits each preference
  if (nowMinutes < prefMinutes || nowMinutes >= prefMinutes + 15) return false;
  if (member.daily_digest_last_sent_on === local.dateStr) return false;
  return true;
}

function localParts(timeZone: string): { dateStr: string; hour: number; minute: number; weekdayLong: string } {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const weekdayLong = new Intl.DateTimeFormat('nb-NO', {
    timeZone,
    weekday: 'long',
  }).format(now);

  return { dateStr, hour, minute, weekdayLong };
}

async function sendDigestForMember(
  admin: SupabaseClient,
  member: MemberRow,
  onesignalAppId: string,
  onesignalKey: string,
  opts: { force: boolean },
) {
  const tz = member.timezone || 'Europe/Oslo';
  const local = localParts(tz);
  const dateStr = local.dateStr;

  if (!opts.force && member.daily_digest_last_sent_on === dateStr) {
    return { user_id: member.user_id, skipped: 'already_sent' };
  }

  const { data: events, error: eventsError } = await admin
    .from('events')
    .select('id, title, event_date, end_date, start_time, visibility_type, owner_member_id, category')
    .eq('household_id', member.household_id)
    .lte('event_date', dateStr)
    .or(`end_date.gte.${dateStr},end_date.is.null`);

  if (eventsError) {
    return { user_id: member.user_id, error: eventsError.message };
  }

  const overlapping = ((events as EventRow[]) ?? []).filter((e) => {
    const end = e.end_date || e.event_date;
    return end >= dateStr;
  });

  const visibleIds = await filterVisibleEventIds(admin, member.id, overlapping);
  const prefs = (member.vacation_mode ?? {}) as Record<string, unknown>;
  let muteWorkday = false;
  if (prefs.muteHiddenNotifications === true) {
    const { data: holidayRows } = await admin
      .from('countdowns')
      .select('id, target_at, ends_at, countdown_participants(member_id, status)')
      .eq('household_id', member.household_id)
      .eq('status', 'active')
      .eq('use_vacation_mode', true);
    muteWorkday = shouldMuteWorkdayPush(
      member.id,
      prefs,
      (holidayRows ?? []) as HolidayWithJoins[],
      Date.now(),
    );
  }
  const visible = overlapping
    .filter((e) => visibleIds.has(e.id))
    .filter((e) => !(muteWorkday && e.category && WORKDAY_CATEGORIES.has(e.category)))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const { data: listItems } = await admin
    .from('list_items')
    .select('id, is_checked')
    .eq('household_id', member.household_id)
    .eq('item_date', dateStr)
    .eq('is_checked', false);

  const openListCount = listItems?.length ?? 0;

  const weekday = local.weekdayLong.charAt(0).toUpperCase() + local.weekdayLong.slice(1);
  const title = `I dag · ${weekday}`;
  const lines: string[] = [];

  if (visible.length === 0) {
    lines.push('Ingen aktiviteter planlagt');
  } else {
    for (const ev of visible.slice(0, 5)) {
      const time = ev.start_time ? ev.start_time.slice(0, 5) : null;
      lines.push(time ? `${time} ${ev.title}` : ev.title);
    }
    if (visible.length > 5) lines.push(`+${visible.length - 5} mer`);
  }

  if (openListCount > 0) {
    lines.push(
      openListCount === 1 ? 'Liste: 1 ting å gjøre' : `Liste: ${openListCount} ting å gjøre`,
    );
  }

  const body = lines.join('\n');

  const osRes = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${onesignalKey}`,
    },
    body: JSON.stringify({
      app_id: onesignalAppId,
      target_channel: 'push',
      include_aliases: { external_id: [member.user_id] },
      headings: { en: title, nb: title },
      contents: { en: body, nb: body },
      data: {
        kind: 'daily_digest',
        date: dateStr,
        household_id: member.household_id,
        open_list: openListCount > 0 && visible.length === 0,
      },
    }),
  });

  const osJson = await osRes.json().catch(() => ({}));
  if (!osRes.ok) {
    console.error('OneSignal digest error', osRes.status, osJson);
    return { user_id: member.user_id, error: 'onesignal_failed', detail: osJson };
  }

  await admin
    .from('household_members')
    .update({ daily_digest_last_sent_on: dateStr })
    .eq('id', member.id);

  return {
    user_id: member.user_id,
    sent: true,
    date: dateStr,
    events: visible.length,
    list: openListCount,
    onesignal: osJson,
  };
}

async function filterVisibleEventIds(
  admin: SupabaseClient,
  memberId: string,
  events: EventRow[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const selectedIds: string[] = [];

  for (const ev of events) {
    if (ev.visibility_type === 'all_members') {
      out.add(ev.id);
    } else if (ev.visibility_type === 'private') {
      if (ev.owner_member_id === memberId) out.add(ev.id);
    } else if (ev.visibility_type === 'selected_members') {
      // Owner always sees their own event (not stored in event_visible_members).
      if (ev.owner_member_id === memberId) out.add(ev.id);
      else selectedIds.push(ev.id);
    } else {
      out.add(ev.id);
    }
  }

  if (selectedIds.length > 0) {
    const { data } = await admin
      .from('event_visible_members')
      .select('event_id')
      .eq('member_id', memberId)
      .in('event_id', selectedIds);
    for (const row of data ?? []) out.add(row.event_id as string);
  }

  return out;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
