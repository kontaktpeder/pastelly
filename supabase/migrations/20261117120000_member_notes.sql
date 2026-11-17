-- Short notes between members of the same calendar.
-- The sender writes one. The recipient reads it once, then it stays read.

create table if not exists public.member_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_member_id uuid not null references public.household_members (id) on delete cascade,
  to_member_id uuid not null references public.household_members (id) on delete cascade,
  body text not null,
  emoji text not null default '💌',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_notes_not_self check (from_member_id <> to_member_id),
  constraint member_notes_body_len check (char_length(body) between 1 and 240),
  constraint member_notes_emoji check (emoji in ('💌', '❤️', '✨', '🌸'))
);

create index if not exists member_notes_unread_idx
  on public.member_notes (to_member_id, created_at)
  where read_at is null;

comment on table public.member_notes is 'Short notes from one calendar member to another';

-- ---------------------------------------------------------------------------
-- Writes stay inside the calendar, and a read only flips read_at.
-- ---------------------------------------------------------------------------

create or replace function public.member_notes_enforce()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender public.household_members;
  v_recipient public.household_members;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'not authenticated';
    end if;

    select * into v_sender
    from public.household_members
    where id = new.from_member_id
      and is_active = true
      and user_id = auth.uid();

    if not found or v_sender.household_id is distinct from new.household_id then
      raise exception 'not a member of this calendar';
    end if;

    select * into v_recipient
    from public.household_members
    where id = new.to_member_id
      and is_active = true
      and household_id = new.household_id;

    if not found then
      raise exception 'pick someone in this calendar';
    end if;

    new.body := btrim(new.body);
    if char_length(new.body) < 1 or char_length(new.body) > 240 then
      raise exception 'note length';
    end if;

    if new.emoji not in ('💌', '❤️', '✨', '🌸') then
      raise exception 'emoji';
    end if;

    new.read_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if auth.uid() is null then
      raise exception 'not authenticated';
    end if;

    if new.id is distinct from old.id
      or new.household_id is distinct from old.household_id
      or new.from_member_id is distinct from old.from_member_id
      or new.to_member_id is distinct from old.to_member_id
      or new.body is distinct from old.body
      or new.emoji is distinct from old.emoji
      or new.created_at is distinct from old.created_at
    then
      raise exception 'only read state can change';
    end if;

    if not exists (
      select 1
      from public.household_members hm
      where hm.id = old.to_member_id
        and hm.user_id = auth.uid()
        and hm.is_active = true
    ) then
      raise exception 'not the recipient';
    end if;

    if old.read_at is not null then
      raise exception 'already read';
    end if;

    if new.read_at is null then
      raise exception 'missing read time';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists member_notes_enforce on public.member_notes;
create trigger member_notes_enforce
  before insert or update on public.member_notes
  for each row execute function public.member_notes_enforce();

revoke all on function public.member_notes_enforce() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: sender and recipient can read their own notes. Only the sender inserts.
-- Only the recipient can mark one read. Nobody deletes through the API.
-- ---------------------------------------------------------------------------

alter table public.member_notes enable row level security;

drop policy if exists member_notes_select_party on public.member_notes;
create policy member_notes_select_party
  on public.member_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members hm
      where hm.user_id = auth.uid()
        and hm.is_active = true
        and hm.household_id = member_notes.household_id
        and hm.id in (member_notes.from_member_id, member_notes.to_member_id)
    )
  );

drop policy if exists member_notes_insert_sender on public.member_notes;
create policy member_notes_insert_sender
  on public.member_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.household_members sender
      join public.household_members recipient
        on recipient.household_id = sender.household_id
       and recipient.is_active = true
       and recipient.id = member_notes.to_member_id
       and recipient.id <> sender.id
      where sender.id = member_notes.from_member_id
        and sender.user_id = auth.uid()
        and sender.is_active = true
        and sender.household_id = member_notes.household_id
    )
  );

drop policy if exists member_notes_update_recipient on public.member_notes;
create policy member_notes_update_recipient
  on public.member_notes
  for update
  to authenticated
  using (
    read_at is null
    and exists (
      select 1
      from public.household_members hm
      where hm.id = member_notes.to_member_id
        and hm.user_id = auth.uid()
        and hm.is_active = true
        and hm.household_id = member_notes.household_id
    )
  )
  with check (
    read_at is not null
    and exists (
      select 1
      from public.household_members hm
      where hm.id = member_notes.to_member_id
        and hm.user_id = auth.uid()
        and hm.is_active = true
        and hm.household_id = member_notes.household_id
    )
  );

revoke all on public.member_notes from public, anon, authenticated;
grant select, insert, update on public.member_notes to authenticated;
