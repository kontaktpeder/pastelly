import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type WorkDay = {
  id: string;
  organization_id: string;
  name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  comment: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnon) {
      return json({ error: 'Schedule proxy is not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const asUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await asUser.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null) as {
      household_id?: string;
      from?: string;
      to?: string;
    } | null;
    const householdId = body?.household_id ?? '';
    const from = body?.from ?? '';
    const to = body?.to ?? '';
    if (!householdId || !DATE.test(from) || !DATE.test(to)) {
      return json({ error: 'household_id, from and to are required' }, 400);
    }

    const { data: membership, error: memberError } = await asUser
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (memberError) return json({ error: memberError.message }, 500);
    if (!membership) return json({ error: 'Forbidden' }, 403);

    const { data: household, error: householdError } = await asUser
      .from('households')
      .select('kind, work_organization_id')
      .eq('id', householdId)
      .maybeSingle();
    if (householdError) return json({ error: householdError.message }, 500);

    const workOrgId = household?.work_organization_id as string | null;
    const kind = String(household?.kind ?? '').toLowerCase();
    if (!workOrgId || kind !== 'work') return json({ blocks: [] });

    const base = (Deno.env.get('WORK_API_BASE_URL') ?? '').replace(/\/$/, '');
    const key = Deno.env.get('WORK_API_KEY') ?? '';
    if (!base || !key) {
      console.error('WORK_API_BASE_URL or WORK_API_KEY is missing');
      return json({ blocks: [] });
    }

    const url = new URL(`${base}/api/public/v1/schedule`);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    const workRes = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!workRes.ok) {
      console.error('Work schedule request failed', workRes.status);
      return json({ blocks: [] });
    }

    const payload = await workRes.json() as {
      data?: { organization_id?: string; production_days?: WorkDay[] };
    };
    if (payload.data?.organization_id && payload.data.organization_id !== workOrgId) {
      return json({ blocks: [] });
    }

    // Neutral production blocks only. Names and assignments stay in Work
    // until a Pastelly user is securely linked to a Work user.
    const blocks = (payload.data?.production_days ?? []).map((day) => ({
      id: day.id,
      title: day.name,
      event_date: day.event_date,
      start_time: day.start_time,
      end_time: day.end_time,
      location: day.location,
      comment: day.comment,
      work_url: `${base}/orgs/${workOrgId}/schedule`,
    }));

    return json({ blocks });
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
