import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  GOOGLE_SCOPES,
  HIEM_CALENDAR_SUMMARY_EN,
  HIEM_CALENDAR_SUMMARY_NB,
  DEFAULT_TZ,
  corsPreflight,
  decodeState,
  encodeState,
  eventToGoogleBody,
  googleEventToPastellyPatch,
  jsonResponse,
  routeAfterFunction,
  type PastellyEventRow,
} from './googleCalendar.ts';

type Admin = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const stateSecret =
    Deno.env.get('GOOGLE_OAUTH_STATE_SECRET') || service || 'pastelly-dev-state';

  if (!supabaseUrl || !anon || !service) {
    return jsonResponse({ error: 'Server not configured' }, 500);
  }

  const admin = createClient(supabaseUrl, service);
  const route = routeAfterFunction(new URL(req.url).pathname);
  const url = new URL(req.url);

  try {
    // Google redirect — no user JWT
    if (route === 'callback' && req.method === 'GET') {
      return await handleCallback(url, admin, {
        clientId,
        clientSecret,
        stateSecret,
        supabaseUrl,
      });
    }

    if (!clientId || !clientSecret) {
      return jsonResponse(
        {
          error: 'google_not_configured',
          message:
            'Google Calendar er ikke konfigurert. Sett GOOGLE_CLIENT_ID og GOOGLE_CLIENT_SECRET i Supabase secrets.',
        },
        503,
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);
    const asUser = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await asUser.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Authenticated actions use body.action (functions.invoke cannot hit subpaths).
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'POST required' }, 405);
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || route || '');

    if (action === 'start') {
      const householdId = String(body.household_id || '');
      if (!householdId) return jsonResponse({ error: 'household_id required' }, 400);
      const memberOk = await userIsMember(admin, user.id, householdId);
      if (!memberOk) return jsonResponse({ error: 'Forbidden' }, 403);

      const returnTo = String(body.return_to || 'https://pastelly.no/');
      const redirectUri = `${supabaseUrl}/functions/v1/google-calendar/callback`;
      const state = await encodeState(
        { userId: user.id, householdId, returnTo },
        stateSecret,
      );
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', GOOGLE_SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('include_granted_scopes', 'true');
      authUrl.searchParams.set('state', state);
      return jsonResponse({ url: authUrl.toString() });
    }

    if (action === 'status') {
      const householdId = String(body.household_id || '');
      if (!householdId) return jsonResponse({ error: 'household_id required' }, 400);
      const { data } = await admin
        .from('external_calendar_connections')
        .select(
          'id, provider, account_email, external_calendar_id, external_calendar_name, sync_enabled, last_synced_at, last_error',
        )
        .eq('user_id', user.id)
        .eq('household_id', householdId)
        .eq('provider', 'google')
        .maybeSingle();
      return jsonResponse({ connected: !!data, connection: data ?? null });
    }

    if (action === 'disconnect') {
      const householdId = String(body.household_id || '');
      if (!householdId) return jsonResponse({ error: 'household_id required' }, 400);
      await admin
        .from('external_calendar_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('household_id', householdId)
        .eq('provider', 'google');
      return jsonResponse({ ok: true });
    }

    if (action === 'push') {
      const eventId = String(body.event_id || '');
      const deleted = !!body.deleted;
      if (!eventId) return jsonResponse({ error: 'event_id required' }, 400);
      const result = await pushEvent(admin, {
        userId: user.id,
        eventId,
        deleted,
        clientId,
        clientSecret,
      });
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    if (action === 'pull') {
      const householdId = String(body.household_id || '');
      if (!householdId) return jsonResponse({ error: 'household_id required' }, 400);
      const memberOk = await userIsMember(admin, user.id, householdId);
      if (!memberOk) return jsonResponse({ error: 'Forbidden' }, 403);
      const result = await pullChanges(admin, {
        userId: user.id,
        householdId,
        clientId,
        clientSecret,
      });
      return jsonResponse(result, result.ok ? 200 : 400);
    }

    return jsonResponse({ error: 'Not found', action }, 404);
  } catch (err) {
    console.error(err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      500,
    );
  }
});

async function handleCallback(
  url: URL,
  admin: Admin,
  cfg: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    stateSecret: string;
    supabaseUrl: string;
  },
) {
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state') || '';
  const state = await decodeState(stateRaw, cfg.stateSecret);
  const fallback = 'https://pastelly.no/?google=error';

  if (err || !code || !state || !cfg.clientId || !cfg.clientSecret) {
    return Response.redirect(fallback, 302);
  }

  const redirectUri = `${cfg.supabaseUrl}/functions/v1/google-calendar/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
    console.error('token exchange failed', tokenJson);
    return Response.redirect(
      appendQuery(state.returnTo, { google: 'error', reason: 'token' }),
      302,
    );
  }

  const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  }).then((r) => r.json());

  const locale = await householdLocale(admin, state.householdId);
  const calendarName = locale === 'en' ? HIEM_CALENDAR_SUMMARY_EN : HIEM_CALENDAR_SUMMARY_NB;
  const calendarId = await ensureHjemCalendar(tokenJson.access_token, calendarName);

  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
    : null;

  const { error: upsertError } = await admin.from('external_calendar_connections').upsert(
    {
      user_id: state.userId,
      household_id: state.householdId,
      provider: 'google',
      account_email: profile.email ?? null,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      token_expires_at: expiresAt,
      external_calendar_id: calendarId,
      external_calendar_name: calendarName,
      sync_enabled: true,
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,household_id,provider' },
  );

  if (upsertError) {
    console.error(upsertError);
    return Response.redirect(
      appendQuery(state.returnTo, { google: 'error', reason: 'save' }),
      302,
    );
  }

  // Best-effort: push existing household events into the new calendar.
  void backfillPush(admin, {
    userId: state.userId,
    householdId: state.householdId,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
  });

  return Response.redirect(appendQuery(state.returnTo, { google: 'connected' }), 302);
}

async function ensureHjemCalendar(accessToken: string, summary: string): Promise<string> {
  const list = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  ).then((r) => r.json());

  const existing = (list.items || []).find(
    (c: { summary?: string; id?: string }) =>
      c.summary === summary ||
      c.summary === HIEM_CALENDAR_SUMMARY_NB ||
      c.summary === HIEM_CALENDAR_SUMMARY_EN ||
      c.summary === 'Pastelly Hjem' ||
      c.summary === 'Pastelly Home',
  );
  if (existing?.id) return existing.id as string;

  const created = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary,
      description: 'Delt hjemmekalender fra Pastelly. Bare hendelser her synces.',
      timeZone: DEFAULT_TZ,
    }),
  }).then((r) => r.json());

  if (!created.id) throw new Error(created.error?.message || 'Could not create calendar');
  return created.id as string;
}

async function getValidAccessToken(
  admin: Admin,
  connection: {
    id: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: string | null;
  },
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const expires = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expires > Date.now() + 60_000) return connection.access_token;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || 'Token refresh failed');
  }
  const expiresAt = tokenJson.expires_in
    ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
    : null;
  await admin
    .from('external_calendar_connections')
    .update({
      access_token: tokenJson.access_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', connection.id);
  return tokenJson.access_token as string;
}

async function pushEvent(
  admin: Admin,
  args: {
    userId: string;
    eventId: string;
    deleted: boolean;
    clientId: string;
    clientSecret: string;
  },
) {
  const { data: event } = await admin
    .from('events')
    .select('*')
    .eq('id', args.eventId)
    .maybeSingle();

  // On delete the row is gone — find link via any connection owned by user that had it.
  if (args.deleted || !event) {
    const { data: links } = await admin
      .from('external_event_links')
      .select('id, external_event_id, connection_id, external_calendar_connections!inner(*)')
      .eq('event_id', args.eventId);
    // When event already deleted, links cascade-deleted. So callers should push before delete,
    // or we accept no-op. Prefer: look up by connection for soft path.
    if (!links?.length) return { ok: true, skipped: true, reason: 'no_link' };
    for (const link of links as any[]) {
      const conn = link.external_calendar_connections;
      if (conn.user_id !== args.userId) continue;
      const access = await getValidAccessToken(admin, conn, args.clientId, args.clientSecret);
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.external_calendar_id)}/events/${encodeURIComponent(link.external_event_id)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${access}` },
        },
      );
      await admin.from('external_event_links').delete().eq('id', link.id);
    }
    return { ok: true, deleted: true };
  }

  const { data: conn } = await admin
    .from('external_calendar_connections')
    .select('*')
    .eq('user_id', args.userId)
    .eq('household_id', event.household_id)
    .eq('provider', 'google')
    .eq('sync_enabled', true)
    .maybeSingle();

  if (!conn?.external_calendar_id) {
    return { ok: true, skipped: true, reason: 'not_connected' };
  }

  const access = await getValidAccessToken(admin, conn as any, args.clientId, args.clientSecret);
  const tz = await memberTimezone(admin, args.userId, event.household_id);
  const body = eventToGoogleBody(event as PastellyEventRow, tz);

  const { data: existingLink } = await admin
    .from('external_event_links')
    .select('*')
    .eq('connection_id', conn.id)
    .eq('event_id', event.id)
    .maybeSingle();

  let gEvent: any;
  if (existingLink?.external_event_id) {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.external_calendar_id)}/events/${encodeURIComponent(existingLink.external_event_id)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    gEvent = await res.json();
    if (!res.ok) throw new Error(gEvent.error?.message || 'Google update failed');
  } else {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.external_calendar_id)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    gEvent = await res.json();
    if (!res.ok) throw new Error(gEvent.error?.message || 'Google create failed');
  }

  await admin.from('external_event_links').upsert(
    {
      connection_id: conn.id,
      event_id: event.id,
      external_event_id: gEvent.id,
      external_etag: gEvent.etag ?? null,
      last_pushed_at: new Date().toISOString(),
      last_source: 'pastelly',
    },
    { onConflict: 'connection_id,event_id' },
  );

  await admin
    .from('external_calendar_connections')
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq('id', conn.id);

  return { ok: true, external_event_id: gEvent.id };
}

async function pullChanges(
  admin: Admin,
  args: {
    userId: string;
    householdId: string;
    clientId: string;
    clientSecret: string;
  },
) {
  const { data: conn } = await admin
    .from('external_calendar_connections')
    .select('*')
    .eq('user_id', args.userId)
    .eq('household_id', args.householdId)
    .eq('provider', 'google')
    .eq('sync_enabled', true)
    .maybeSingle();

  if (!conn?.external_calendar_id) {
    return { ok: true, skipped: true, reason: 'not_connected' };
  }

  const access = await getValidAccessToken(admin, conn as any, args.clientId, args.clientSecret);
  const params = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: '250',
  });
  if (conn.sync_token) {
    params.set('syncToken', conn.sync_token);
  } else {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    params.set('timeMin', from.toISOString());
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);
    params.set('timeMax', to.toISOString());
  }

  let listUrl =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.external_calendar_id)}/events?${params}`;
  let nextSyncToken: string | null = null;
  let imported = 0;
  let updated = 0;
  let removed = 0;

  const { data: member } = await admin
    .from('household_members')
    .select('id, timezone')
    .eq('household_id', args.householdId)
    .eq('user_id', args.userId)
    .maybeSingle();

  if (!member) return { ok: false, error: 'not_a_member' };

  while (listUrl) {
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const data = await res.json();
    if (res.status === 410) {
      // Sync token expired — full resync next time.
      await admin
        .from('external_calendar_connections')
        .update({ sync_token: null, last_error: 'sync_token_expired' })
        .eq('id', conn.id);
      return { ok: true, reset: true };
    }
    if (!res.ok) throw new Error(data.error?.message || 'Google list failed');

    for (const item of data.items || []) {
      if (item.status === 'cancelled') {
        const { data: link } = await admin
          .from('external_event_links')
          .select('event_id')
          .eq('connection_id', conn.id)
          .eq('external_event_id', item.id)
          .maybeSingle();
        if (link?.event_id) {
          await admin.from('events').delete().eq('id', link.event_id);
          removed += 1;
        }
        continue;
      }

      const patch = googleEventToPastellyPatch(item);
      const { data: link } = await admin
        .from('external_event_links')
        .select('event_id')
        .eq('connection_id', conn.id)
        .eq('external_event_id', item.id)
        .maybeSingle();

      if (link?.event_id) {
        await admin
          .from('events')
          .update({
            title: patch.title,
            event_date: patch.event_date,
            end_date: patch.end_date,
            start_time: patch.start_time,
            end_time: patch.end_time,
            day_part: patch.day_part,
            location: patch.location,
            notes: patch.notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', link.event_id);
        await admin
          .from('external_event_links')
          .update({
            external_etag: item.etag ?? null,
            last_pulled_at: new Date().toISOString(),
            last_source: 'google',
          })
          .eq('connection_id', conn.id)
          .eq('external_event_id', item.id);
        updated += 1;
      } else {
        const { data: created, error } = await admin
          .from('events')
          .insert({
            household_id: args.householdId,
            owner_member_id: member.id,
            title: patch.title,
            event_date: patch.event_date,
            end_date: patch.end_date,
            start_time: patch.start_time,
            end_time: patch.end_time,
            day_part: patch.day_part || 'all_day',
            location: patch.location,
            notes: patch.notes,
            category: 'other',
            visibility_type: 'all_members',
          })
          .select('id')
          .single();
        if (error) {
          console.error('import insert failed', error);
          continue;
        }
        await admin.from('external_event_links').insert({
          connection_id: conn.id,
          event_id: created.id,
          external_event_id: item.id,
          external_etag: item.etag ?? null,
          last_pulled_at: new Date().toISOString(),
          last_source: 'google',
        });
        imported += 1;
      }
    }

    nextSyncToken = data.nextSyncToken || nextSyncToken;
    listUrl = data.nextPageToken
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.external_calendar_id)}/events?${params}&pageToken=${data.nextPageToken}`
      : '';
  }

  await admin
    .from('external_calendar_connections')
    .update({
      sync_token: nextSyncToken || conn.sync_token,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', conn.id);

  return { ok: true, imported, updated, removed };
}

async function backfillPush(
  admin: Admin,
  args: {
    userId: string;
    householdId: string;
    clientId: string;
    clientSecret: string;
  },
) {
  const { data: events } = await admin
    .from('events')
    .select('id')
    .eq('household_id', args.householdId)
    .order('event_date', { ascending: false })
    .limit(100);
  for (const ev of events || []) {
    try {
      await pushEvent(admin, {
        userId: args.userId,
        eventId: ev.id,
        deleted: false,
        clientId: args.clientId,
        clientSecret: args.clientSecret,
      });
    } catch (err) {
      console.error('backfill push failed', ev.id, err);
    }
  }
}

async function userIsMember(admin: Admin, userId: string, householdId: string) {
  const { data } = await admin
    .from('household_members')
    .select('id')
    .eq('user_id', userId)
    .eq('household_id', householdId)
    .maybeSingle();
  return !!data;
}

async function householdLocale(admin: Admin, householdId: string) {
  const { data } = await admin
    .from('households')
    .select('locale')
    .eq('id', householdId)
    .maybeSingle();
  return (data as any)?.locale === 'en' ? 'en' : 'nb';
}

async function memberTimezone(admin: Admin, userId: string, householdId: string) {
  const { data } = await admin
    .from('household_members')
    .select('timezone')
    .eq('user_id', userId)
    .eq('household_id', householdId)
    .maybeSingle();
  return (data as any)?.timezone || DEFAULT_TZ;
}

function appendQuery(base: string, params: Record<string, string>) {
  try {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return `https://pastelly.no/?google=${params.google || 'error'}`;
  }
}
