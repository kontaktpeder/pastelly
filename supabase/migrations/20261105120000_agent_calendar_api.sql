-- Agent calendar API.
-- A personal token lets a caller read and create events as that user.
-- Writes go through create_event_for_current_member, not a direct table insert
-- from the client. The token hash is the only secret stored.

create table if not exists public.agent_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint agent_api_tokens_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint agent_api_tokens_hash_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint agent_api_tokens_prefix check (token_prefix ~ '^pst_[0-9a-f]{8}$')
);

create index if not exists agent_api_tokens_user_active_idx
  on public.agent_api_tokens (user_id)
  where revoked_at is null;

comment on table public.agent_api_tokens is
  'Personal tokens for the agent calendar API. Only the SHA-256 hash is stored.';

alter table public.agent_api_tokens enable row level security;

revoke all on table public.agent_api_tokens from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token management for the signed-in user
-- ---------------------------------------------------------------------------

create or replace function public.create_agent_api_token(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_count int;
  v_token text;
  v_hash text;
  v_prefix text;
  v_id uuid;
  v_created timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if v_name = '' or char_length(v_name) > 40 or v_name !~ '^[[:alnum:] ._-]+$' then
    raise exception 'Navnet må være 1–40 tegn: bokstaver, tall, mellomrom, punktum eller bindestrek';
  end if;

  select count(*)
  into v_count
  from public.agent_api_tokens
  where user_id = v_user
    and revoked_at is null;

  if v_count >= 5 then
    raise exception 'Du kan ha maks 5 aktive nøkler. Trekk tilbake en før du lager en ny.';
  end if;

  v_token := 'pst_' || encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_prefix := left(v_token, 12);

  insert into public.agent_api_tokens (user_id, name, token_hash, token_prefix)
  values (v_user, v_name, v_hash, v_prefix)
  returning id, created_at into v_id, v_created;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'token', v_token,
    'token_prefix', v_prefix,
    'created_at', v_created
  );
end;
$$;

create or replace function public.list_agent_api_tokens()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'token_prefix', t.token_prefix,
        'created_at', t.created_at,
        'last_used_at', t.last_used_at
      )
      order by t.created_at desc
    ),
    '[]'::jsonb
  )
  from public.agent_api_tokens t
  where t.user_id = auth.uid()
    and t.revoked_at is null;
$$;

create or replace function public.revoke_agent_api_token(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.agent_api_tokens
  set revoked_at = now()
  where id = p_id
    and user_id = auth.uid()
    and revoked_at is null
  returning revoked_at into v_revoked;

  if v_revoked is null then
    raise exception 'Fant ikke nøkkelen';
  end if;

  return jsonb_build_object('id', p_id, 'revoked_at', v_revoked);
end;
$$;

revoke all on function public.create_agent_api_token(text) from public;
revoke all on function public.list_agent_api_tokens() from public;
revoke all on function public.revoke_agent_api_token(uuid) from public;
grant execute on function public.create_agent_api_token(text) to authenticated;
grant execute on function public.list_agent_api_tokens() to authenticated;
grant execute on function public.revoke_agent_api_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Event JSON shared by list and create
-- ---------------------------------------------------------------------------

create or replace function public.agent_event_json(p_event public.events)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_event.id,
    'calendar_id', p_event.household_id,
    'title', p_event.title,
    'event_date', p_event.event_date,
    'end_date', p_event.end_date,
    'start_time', to_char(p_event.start_time, 'HH24:MI'),
    'end_time', to_char(p_event.end_time, 'HH24:MI'),
    'day_part', p_event.day_part,
    'day_part_start', p_event.day_part_start,
    'day_part_end', p_event.day_part_end,
    'location', p_event.location,
    'notes', p_event.notes,
    'category', p_event.category,
    'category_label_override', p_event.category_label_override,
    'visibility_type', p_event.visibility_type,
    'hide_from_other_calendars', p_event.hide_from_other_calendars,
    'owner_member_id', p_event.owner_member_id,
    'owner_name', (
      select hm.display_name
      from public.household_members hm
      where hm.id = p_event.owner_member_id
    )
  );
$$;

revoke all on function public.agent_event_json(public.events) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dispatcher. Service role only. Acts as the token's user.
-- ---------------------------------------------------------------------------

create or replace function public.agent_calendar(
  p_token_hash text,
  p_op text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_id uuid;
  v_user_id uuid;
  v_calendar_id uuid;
  v_from date;
  v_to date;
  v_title text;
  v_event_date date;
  v_end_date date;
  v_start text;
  v_end text;
  v_day_part text;
  v_day_part_start text;
  v_day_part_end text;
  v_location text;
  v_notes text;
  v_category text;
  v_label text;
  v_visibility text;
  v_hide boolean;
  v_member_ids uuid[];
  v_member_count int;
  v_row public.events;
  v_events jsonb;
  v_calendars jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'unauthorized', 'message', 'Invalid or revoked token', 'status', 401);
  end if;

  select t.id, t.user_id
  into v_token_id, v_user_id
  from public.agent_api_tokens t
  where t.token_hash = p_token_hash
    and t.revoked_at is null;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized', 'message', 'Invalid or revoked token', 'status', 401);
  end if;

  -- Nested event helpers read auth.uid(). Point them at the token owner.
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated')::text,
    true
  );

  update public.agent_api_tokens
  set last_used_at = now()
  where id = v_token_id;

  if p_op = 'calendars' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'name', h.name,
          'kind', h.kind,
          'locale', h.locale,
          'time_zone', hm.timezone,
          'member_id', hm.id,
          'member_name', hm.display_name
        )
        order by h.name
      ),
      '[]'::jsonb
    )
    into v_calendars
    from (
      select distinct on (m.household_id) m.*
      from public.household_members m
      where m.user_id = auth.uid()
        and m.is_active = true
      order by m.household_id, m.created_at
    ) hm
    join public.households h on h.id = hm.household_id;

    return jsonb_build_object(
      'ok', true,
      'time_note', 'Times are wall-clock in each calendar time_zone, not UTC.',
      'calendars', v_calendars
    );
  end if;

  if p_op = 'list_events' then
    if coalesce(p_payload->>'calendar_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_calendar', 'message', 'calendar_id must be a calendar UUID', 'status', 400);
    end if;
    v_calendar_id := (p_payload->>'calendar_id')::uuid;

    begin
      v_from := (p_payload->>'from')::date;
      v_to := (p_payload->>'to')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_date', 'message', 'from and to must be real dates', 'status', 400);
    end;

    if v_from is null or v_to is null or v_to < v_from or (v_to - v_from) > 366 then
      return jsonb_build_object('ok', false, 'error', 'invalid_range', 'message', 'Date range is invalid', 'status', 400);
    end if;

    if not exists (
      select 1
      from public.household_members hm
      where hm.user_id = auth.uid()
        and hm.household_id = v_calendar_id
        and hm.is_active = true
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_a_member', 'message', 'Not an active member of this calendar', 'status', 403);
    end if;

    select coalesce(
      jsonb_agg(public.agent_event_json(e) order by e.event_date, e.start_time nulls last, e.id),
      '[]'::jsonb
    )
    into v_events
    from public.events e
    where e.household_id = v_calendar_id
      and e.event_date <= v_to
      and coalesce(e.end_date, e.event_date) >= v_from
      and public.can_current_user_view_event(e.id);

    return jsonb_build_object(
      'ok', true,
      'calendar_id', v_calendar_id,
      'from', v_from,
      'to', v_to,
      'events', v_events
    );
  end if;

  if p_op = 'create_event' then
    if coalesce(p_payload->>'calendar_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_calendar', 'message', 'calendar_id must be a calendar UUID', 'status', 400);
    end if;
    v_calendar_id := (p_payload->>'calendar_id')::uuid;
    v_title := btrim(coalesce(p_payload->>'title', ''));

    if v_title = '' or char_length(v_title) > 200 then
      return jsonb_build_object('ok', false, 'error', 'invalid_title', 'message', 'title is required', 'status', 400);
    end if;

    begin
      v_event_date := (p_payload->>'event_date')::date;
      v_end_date := coalesce((nullif(p_payload->>'end_date', ''))::date, v_event_date);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_date', 'message', 'event_date must be a real date', 'status', 400);
    end;

    if v_event_date is null or v_end_date is null then
      return jsonb_build_object('ok', false, 'error', 'invalid_date', 'message', 'event_date must be a real date', 'status', 400);
    end if;
    if v_end_date < v_event_date then
      return jsonb_build_object('ok', false, 'error', 'invalid_range', 'message', 'end_date must be on or after event_date', 'status', 400);
    end if;

    v_start := nullif(p_payload->>'start_time', '');
    v_end := nullif(p_payload->>'end_time', '');
    if v_start is not null and v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_time', 'message', 'start_time must be HH:MM', 'status', 400);
    end if;
    if v_end is not null and v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_time', 'message', 'end_time must be HH:MM', 'status', 400);
    end if;
    if v_start is not null and v_end is not null and v_end_date = v_event_date and v_end::time < v_start::time then
      return jsonb_build_object('ok', false, 'error', 'end_before_start', 'message', 'end_time is before start_time', 'status', 400);
    end if;

    v_category := coalesce(nullif(p_payload->>'category', ''), 'other');
    if v_category not in (
      'couple', 'work', 'social', 'celebration', 'important', 'travel', 'school', 'meeting', 'other',
      'production', 'development', 'admin', 'personal', 'client', 'deadline', 'focus',
      'beach', 'breakfast', 'lunch', 'dinner', 'hotel', 'outing', 'activity', 'relaxation', 'shopping', 'practical'
    ) then
      return jsonb_build_object('ok', false, 'error', 'invalid_category', 'message', 'Unknown category', 'status', 400);
    end if;

    v_label := nullif(btrim(coalesce(p_payload->>'category_label_override', '')), '');
    if v_category <> 'other' then
      v_label := null;
    end if;

    v_visibility := coalesce(nullif(p_payload->>'visibility_type', ''), 'all_members');
    if v_visibility not in ('all_members', 'private', 'selected_members') then
      return jsonb_build_object('ok', false, 'error', 'invalid_visibility', 'message', 'Unknown visibility_type', 'status', 400);
    end if;

    v_day_part := nullif(p_payload->>'day_part', '');
    if v_day_part is null or v_day_part not in (
      'morning', 'late_morning', 'afternoon', 'evening', 'night', 'full_diem', 'all_day'
    ) then
      if v_start is null then
        v_day_part := 'all_day';
      elsif v_start::time < time '06:00' then
        v_day_part := 'night';
      elsif v_start::time < time '09:00' then
        v_day_part := 'morning';
      elsif v_start::time < time '12:00' then
        v_day_part := 'late_morning';
      elsif v_start::time < time '18:00' then
        v_day_part := 'afternoon';
      else
        v_day_part := 'evening';
      end if;
    end if;

    v_day_part_start := coalesce(nullif(p_payload->>'day_part_start', ''), v_day_part);
    v_day_part_end := coalesce(nullif(p_payload->>'day_part_end', ''), v_day_part);
    if v_day_part_start not in (
      'morning', 'late_morning', 'afternoon', 'evening', 'night', 'full_diem', 'all_day'
    ) then
      v_day_part_start := v_day_part;
    end if;
    if v_day_part_end not in (
      'morning', 'late_morning', 'afternoon', 'evening', 'night', 'full_diem', 'all_day'
    ) then
      v_day_part_end := v_day_part;
    end if;
    v_location := nullif(btrim(coalesce(p_payload->>'location', '')), '');
    v_notes := nullif(btrim(coalesce(p_payload->>'notes', '')), '');
    v_hide := case
      when jsonb_typeof(p_payload->'hide_from_other_calendars') = 'boolean'
        then (p_payload->>'hide_from_other_calendars')::boolean
      else false
    end;

    if char_length(coalesce(v_location, '')) > 300 or char_length(coalesce(v_notes, '')) > 4000 then
      return jsonb_build_object('ok', false, 'error', 'invalid_body', 'message', 'location or notes is too long', 'status', 400);
    end if;

    if not exists (
      select 1
      from public.household_members hm
      where hm.user_id = auth.uid()
        and hm.household_id = v_calendar_id
        and hm.is_active = true
    ) then
      return jsonb_build_object('ok', false, 'error', 'not_a_member', 'message', 'Not an active member of this calendar', 'status', 403);
    end if;

    v_member_ids := '{}';
    if v_visibility = 'selected_members' then
      if jsonb_typeof(p_payload->'visible_member_ids') is distinct from 'array'
         or jsonb_array_length(p_payload->'visible_member_ids') = 0 then
        return jsonb_build_object('ok', false, 'error', 'invalid_visibility', 'message', 'selected_members requires visible_member_ids', 'status', 400);
      end if;

      select coalesce(array_agg(distinct elem::uuid), '{}')
      into v_member_ids
      from jsonb_array_elements_text(p_payload->'visible_member_ids') as elem
      where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

      if coalesce(array_length(v_member_ids, 1), 0) <> jsonb_array_length(p_payload->'visible_member_ids') then
        return jsonb_build_object('ok', false, 'error', 'invalid_visibility', 'message', 'visible_member_ids must be member UUIDs', 'status', 400);
      end if;

      select count(*)
      into v_member_count
      from public.household_members hm
      where hm.id = any (v_member_ids)
        and hm.household_id = v_calendar_id
        and hm.is_active = true;

      if v_member_count <> coalesce(array_length(v_member_ids, 1), 0) then
        return jsonb_build_object('ok', false, 'error', 'invalid_visibility', 'message', 'visible_member_ids must belong to this calendar', 'status', 400);
      end if;
    end if;

    v_row := public.create_event_for_current_member(
      p_household_id := v_calendar_id,
      p_title := v_title,
      p_event_date := v_event_date,
      p_end_date := v_end_date,
      p_day_part := v_day_part,
      p_day_part_start := v_day_part_start,
      p_day_part_end := v_day_part_end,
      p_start_time := v_start,
      p_end_time := v_end,
      p_visibility_type := v_visibility,
      p_location := v_location,
      p_notes := v_notes,
      p_category := v_category,
      p_category_label_override := v_label,
      p_hide_from_other_calendars := v_hide
    );

    if v_visibility = 'selected_members' then
      perform public.sync_event_visible_members(v_row.id, v_member_ids);
    end if;

    return jsonb_build_object('ok', true, 'event', public.agent_event_json(v_row));
  end if;

  return jsonb_build_object(
    'ok', false,
    'error', 'unknown_op',
    'message', 'op must be calendars, list_events, or create_event',
    'status', 404
  );
end;
$$;

revoke all on function public.agent_calendar(text, text, jsonb) from public;
revoke all on function public.agent_calendar(text, text, jsonb) from anon, authenticated;
grant execute on function public.agent_calendar(text, text, jsonb) to service_role;

comment on function public.agent_calendar(text, text, jsonb) is
  'Read or create events for an agent token. Times are wall-clock in the member timezone. Granted to service_role only.';

notify pgrst, 'reload schema';
