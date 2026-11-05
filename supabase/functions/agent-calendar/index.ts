import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { parseAgentCall, readBearerToken, sha256Hex } from './agentCalendar.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: 'not_configured', message: 'Agent calendar API is not configured' }, 500);
    }

    const token = readBearerToken(req.headers.get('Authorization'));
    if (!token) {
      return json(
        {
          ok: false,
          error: 'unauthorized',
          message: 'Send Authorization: Bearer with a Pastelly agent token (pst_…)',
        },
        401,
      );
    }

    let body: unknown = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const text = await req.text();
      if (text.length > 20_000) {
        return json({ ok: false, error: 'body_too_large', message: 'Request body is too large' }, 413);
      }
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return json({ ok: false, error: 'invalid_body', message: 'Body must be JSON' }, 400);
        }
      }
    }

    const url = new URL(req.url);
    const parsed = parseAgentCall({
      method: req.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      body,
    });
    if (!parsed.ok) {
      return json({ ok: false, error: parsed.error, message: parsed.message }, parsed.status);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('agent_calendar', {
      p_token_hash: await sha256Hex(token),
      p_op: parsed.op,
      p_payload: parsed.payload,
    });

    if (error) {
      console.error('agent_calendar rpc failed', error.message);
      return json({ ok: false, error: 'request_failed', message: 'Could not complete the request' }, 500);
    }

    const result = (data ?? {}) as { ok?: boolean; status?: number; message?: string };
    const status = typeof result.status === 'number' ? result.status : result.ok === false ? 400 : 200;
    if (result && typeof result === 'object') {
      const { status: _status, ...rest } = result as { status?: number };
      return json(rest, status);
    }
    return json({ ok: false, error: 'request_failed', message: 'Empty response' }, 500);
  } catch (err) {
    console.error('agent-calendar failed', err instanceof Error ? err.message : 'unknown');
    return json({ ok: false, error: 'request_failed', message: 'Could not complete the request' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
