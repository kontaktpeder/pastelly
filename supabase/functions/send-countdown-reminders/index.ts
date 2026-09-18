import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const REMINDER_HOUR = 9; // local morning for weekly + daily

type MemberInfo = {
  id: string;
  user_id: string;
  display_name: string;
  timezone: string | null;
};

type ParticipantRow = {
  id: string;
  member_id: string;
  status: string;
};

type CountdownRow = {
  id: string;
  household_id: string;
  title: string;
  target_at: string;
  emoji: string | null;
  theme: string;
  status: string;
  ends_at?: string | null;
  use_vacation_mode?: boolean | null;
  timezone?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const onesignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const onesignalKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');

    if (!onesignalAppId || !onesignalKey || !supabaseUrl || !serviceKey) {
      return json({ error: 'Countdown reminders not configured' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

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

    const { data: countdowns, error } = await admin
      .from('countdowns')
      .select('id, household_id, title, target_at, emoji, theme, status, ends_at, use_vacation_mode, timezone')
      .eq('status', 'active');

    if (error) return json({ error: error.message }, 500);

    const results: unknown[] = [];
    for (const row of (countdowns as CountdownRow[]) ?? []) {
      results.push(await processCountdown(admin, row, onesignalAppId, onesignalKey));
    }

    return json({ ok: true, checked: countdowns?.length ?? 0, results });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

async function processCountdown(
  admin: SupabaseClient,
  countdown: CountdownRow,
  onesignalAppId: string,
  onesignalKey: string,
) {
  const { data: parts } = await admin
    .from('countdown_participants')
    .select('id, member_id, status')
    .eq('countdown_id', countdown.id)
    .eq('status', 'joined');

  const joined = (parts as ParticipantRow[]) ?? [];
  const memberIds = joined.map((p) => p.member_id);
  const memberById = new Map<string, MemberInfo>();
  if (memberIds.length > 0) {
    const { data: members } = await admin
      .from('household_members')
      .select('id, user_id, display_name, timezone')
      .in('id', memberIds);
    for (const m of (members as MemberInfo[]) ?? []) {
      memberById.set(m.id, m);
    }
  }

  const sent: unknown[] = [];
  const targetMs = new Date(countdown.target_at).getTime();
  const nowMs = Date.now();
  const endMs = countdown.ends_at ? new Date(countdown.ends_at).getTime() : targetMs;

  // Period (or single-moment) is over → mark done
  if (nowMs > endMs + 15 * 60 * 1000) {
    await admin.from('countdowns').update({ status: 'done' }).eq('id', countdown.id);
    return { id: countdown.id, marked: 'done' };
  }

  for (const part of joined) {
    const member = memberById.get(part.member_id);
    if (!member?.user_id) continue;
    const tz = countdown.timezone || member.timezone || 'Europe/Oslo';
    const local = localParts(tz);
    const targetLocalDate = dateStrInTz(new Date(countdown.target_at), tz);
    const daysLeft = daysBetween(local.dateStr, targetLocalDate);

    // Moment: within 15 min after target_at
    if (nowMs >= targetMs && nowMs < targetMs + 15 * 60 * 1000) {
      const ok = await sendOnce(
        admin,
        countdown,
        member,
        'moment',
        local.dateStr,
        onesignalAppId,
        onesignalKey,
        {
          title: countdown.emoji
            ? `${countdown.emoji} ${countdown.title}`
            : countdown.title,
          body: 'Nå er det i dag! 🎉',
        },
      );
      if (ok) sent.push({ member_id: member.id, kind: 'moment' });
      continue;
    }

    if (daysLeft < 0) continue;

    // Morning window for weekly / daily (09:00–09:15 local)
    const nowMinutes = local.hour * 60 + local.minute;
    const prefMinutes = REMINDER_HOUR * 60;
    if (nowMinutes < prefMinutes || nowMinutes >= prefMinutes + 15) continue;

    if (daysLeft >= 1 && daysLeft <= 7) {
      const body =
        daysLeft === 1
          ? countdown.use_vacation_mode
            ? `Feriemodus starter i morgen · ${countdown.title}`
            : `I morgen er det ${countdown.title}!`
          : `${daysLeft} dager igjen til ${countdown.title}`;
      const ok = await sendOnce(
        admin,
        countdown,
        member,
        'daily',
        local.dateStr,
        onesignalAppId,
        onesignalKey,
        {
          title: countdown.emoji
            ? `${countdown.emoji} Nedtelling`
            : 'Nedtelling',
          body,
        },
      );
      if (ok) sent.push({ member_id: member.id, kind: 'daily', daysLeft });
      continue;
    }

    // Weekly: Mondays while more than a week away
    if (daysLeft > 7 && local.weekday === 'Monday') {
      const ok = await sendOnce(
        admin,
        countdown,
        member,
        'weekly',
        local.dateStr,
        onesignalAppId,
        onesignalKey,
        {
          title: countdown.emoji
            ? `${countdown.emoji} Nedtelling`
            : 'Nedtelling',
          body: `${daysLeft} dager til ${countdown.title}`,
        },
      );
      if (ok) sent.push({ member_id: member.id, kind: 'weekly', daysLeft });
    }
  }

  // Mark done after the period (or moment) has passed
  if (nowMs >= endMs) {
    const allMomented = joined.length > 0;
    if (allMomented && nowMs >= endMs + 14 * 60 * 1000) {
      await admin.from('countdowns').update({ status: 'done' }).eq('id', countdown.id);
    }
  }

  return { id: countdown.id, sent };
}

async function sendOnce(
  admin: SupabaseClient,
  countdown: CountdownRow,
  member: { id: string; user_id: string },
  kind: 'weekly' | 'daily' | 'moment',
  sentOn: string,
  onesignalAppId: string,
  onesignalKey: string,
  copy: { title: string; body: string },
): Promise<boolean> {
  const { error: insertError } = await admin.from('countdown_push_log').insert({
    countdown_id: countdown.id,
    member_id: member.id,
    kind,
    sent_on: sentOn,
  });

  // Unique violation → already sent
  if (insertError) {
    if (insertError.code === '23505') return false;
    console.error('push log insert', insertError);
    return false;
  }

  const targetDate = dateStrInTz(new Date(countdown.target_at), 'Europe/Oslo');

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
      headings: { en: copy.title, nb: copy.title },
      contents: { en: copy.body, nb: copy.body },
      data: {
        kind: `countdown_${kind}`,
        countdown_id: countdown.id,
        household_id: countdown.household_id,
        date: targetDate,
      },
    }),
  });

  const osJson = await osRes.json().catch(() => ({}));
  if (!osRes.ok) {
    console.error('OneSignal countdown error', osRes.status, osJson);
    // Keep log row so we don't spam retries for bad payloads; cron will retry next day for weekly/daily
    return false;
  }

  return true;
}

function localParts(timeZone: string): {
  dateStr: string;
  hour: number;
  minute: number;
  weekday: string;
} {
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

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(now);

  return { dateStr, hour, minute, weekday };
}

function dateStrInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const a = new Date(`${fromDateStr}T12:00:00Z`).getTime();
  const b = new Date(`${toDateStr}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
