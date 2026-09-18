-- Vacation mode: a layer over the home calendar, driven by countdown periods
-- and per-member prefs. Events are never deleted when the mode turns on.

-- ---------------------------------------------------------------------------
-- Countdown periods
-- ---------------------------------------------------------------------------

alter table public.countdowns
  add column if not exists ends_at timestamptz,
  add column if not exists use_vacation_mode boolean not null default false,
  add column if not exists timezone text;

comment on column public.countdowns.ends_at is 'Optional end of the countdown period (holiday return).';
comment on column public.countdowns.use_vacation_mode is 'When true, vacation mode auto-on between target_at and ends_at.';
comment on column public.countdowns.timezone is 'IANA timezone for the destination / period.';

alter table public.countdowns
  drop constraint if exists countdowns_ends_at_after_start;
alter table public.countdowns
  add constraint countdowns_ends_at_after_start
  check (ends_at is null or ends_at > target_at);

create index if not exists countdowns_vacation_period_idx
  on public.countdowns (household_id, target_at, ends_at)
  where status = 'active' and use_vacation_mode = true;

-- ---------------------------------------------------------------------------
-- Per-member vacation prefs (manual on/off, override, mute)
-- ---------------------------------------------------------------------------

alter table public.household_members
  add column if not exists vacation_mode jsonb;

comment on column public.household_members.vacation_mode is
  'Personal vacation-mode overlay prefs (manual session, auto override, mute).';

-- ---------------------------------------------------------------------------
-- Vacation event categories (same events table — never a separate calendar)
-- ---------------------------------------------------------------------------

alter table public.events drop constraint if exists events_category_allowed_values;

alter table public.events
  add constraint events_category_allowed_values
  check (
    category in (
      -- home
      'couple',
      'work',
      'social',
      'celebration',
      'important',
      'travel',
      'school',
      'meeting',
      'other',
      -- work (WORK core)
      'production',
      'development',
      'admin',
      'personal',
      -- legacy work keys still readable in the app
      'client',
      'deadline',
      'focus',
      -- vacation layer
      'beach',
      'breakfast',
      'lunch',
      'dinner',
      'hotel',
      'outing',
      'activity',
      'relaxation',
      'shopping',
      'practical'
    )
  );

-- ---------------------------------------------------------------------------
-- create_countdown: extra optional period fields
-- ---------------------------------------------------------------------------

drop function if exists public.create_countdown(uuid, text, timestamptz, text, text, uuid[]);

create or replace function public.create_countdown(
  p_household_id uuid,
  p_title text,
  p_target_at timestamptz,
  p_theme text default 'rose',
  p_emoji text default null,
  p_invite_member_ids uuid[] default null,
  p_ends_at timestamptz default null,
  p_use_vacation_mode boolean default false,
  p_timezone text default null
)
returns public.countdowns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_row public.countdowns;
  v_invitee uuid;
  v_theme text;
  v_tz text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  if p_target_at is null or p_target_at <= now() then
    raise exception 'Target must be in the future';
  end if;

  if p_ends_at is not null and p_ends_at <= p_target_at then
    raise exception 'End must be after start';
  end if;

  v_theme := coalesce(nullif(trim(p_theme), ''), 'rose');
  if v_theme not in ('rose', 'mint', 'peach', 'lavender', 'sky', 'sunset') then
    raise exception 'Invalid theme';
  end if;

  v_tz := nullif(trim(p_timezone), '');

  select hm.id into v_member_id
  from public.household_members hm
  where hm.user_id = auth.uid()
    and hm.household_id = p_household_id
    and hm.is_active = true
  order by hm.created_at asc
  limit 1;

  if v_member_id is null then
    raise exception 'Not an active member of this household';
  end if;

  insert into public.countdowns (
    household_id,
    created_by_member_id,
    title,
    target_at,
    theme,
    emoji,
    ends_at,
    use_vacation_mode,
    timezone
  )
  values (
    p_household_id,
    v_member_id,
    trim(p_title),
    p_target_at,
    v_theme,
    nullif(trim(p_emoji), ''),
    p_ends_at,
    coalesce(p_use_vacation_mode, false),
    v_tz
  )
  returning * into v_row;

  insert into public.countdown_participants (
    countdown_id, member_id, status, invited_by_member_id, joined_at
  )
  values (
    v_row.id, v_member_id, 'joined', v_member_id, now()
  );

  if p_invite_member_ids is not null then
    foreach v_invitee in array p_invite_member_ids
    loop
      if v_invitee = v_member_id then
        continue;
      end if;
      if not exists (
        select 1 from public.household_members hm
        where hm.id = v_invitee
          and hm.household_id = p_household_id
          and hm.is_active = true
      ) then
        continue;
      end if;
      insert into public.countdown_participants (
        countdown_id, member_id, status, invited_by_member_id
      )
      values (v_row.id, v_invitee, 'invited', v_member_id)
      on conflict (countdown_id, member_id) do nothing;
    end loop;
  end if;

  return v_row;
end;
$$;

revoke execute on function public.create_countdown(uuid, text, timestamptz, text, text, uuid[], timestamptz, boolean, text) from public;
grant execute on function public.create_countdown(uuid, text, timestamptz, text, text, uuid[], timestamptz, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_countdown: change start/end/vacation without resetting automation
-- ---------------------------------------------------------------------------

create or replace function public.update_countdown(
  p_countdown_id uuid,
  p_title text default null,
  p_target_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_use_vacation_mode boolean default null,
  p_timezone text default null,
  p_clear_ends_at boolean default false
)
returns public.countdowns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.countdowns;
  v_start timestamptz;
  v_end timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_current_user_manage_countdown(p_countdown_id) then
    raise exception 'Only the creator can update';
  end if;

  select * into v_row from public.countdowns where id = p_countdown_id and status = 'active';
  if v_row.id is null then
    raise exception 'Countdown not found';
  end if;

  v_start := coalesce(p_target_at, v_row.target_at);
  if p_clear_ends_at then
    v_end := null;
  else
    v_end := coalesce(p_ends_at, v_row.ends_at);
  end if;

  if v_end is not null and v_end <= v_start then
    raise exception 'End must be after start';
  end if;

  update public.countdowns
  set
    title = case when p_title is not null and length(trim(p_title)) > 0 then trim(p_title) else title end,
    target_at = v_start,
    ends_at = v_end,
    use_vacation_mode = coalesce(p_use_vacation_mode, use_vacation_mode),
    timezone = case when p_timezone is null then timezone else nullif(trim(p_timezone), '') end
  where id = p_countdown_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.update_countdown(uuid, text, timestamptz, timestamptz, boolean, text, boolean) from public;
grant execute on function public.update_countdown(uuid, text, timestamptz, timestamptz, boolean, text, boolean) to authenticated;
