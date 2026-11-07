-- Google Calendar sync: per-user connection + event ID mapping.
-- Tokens are never granted to authenticated clients (column privileges).

create table if not exists public.external_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  provider text not null check (provider = 'google'),
  account_email text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz,
  external_calendar_id text,
  external_calendar_name text,
  sync_token text,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, household_id, provider)
);

create index if not exists external_calendar_connections_household_idx
  on public.external_calendar_connections (household_id);

create table if not exists public.external_event_links (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null
    references public.external_calendar_connections (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  external_event_id text not null,
  external_etag text,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  last_source text check (last_source in ('pastelly', 'google')),
  created_at timestamptz not null default now(),
  unique (connection_id, event_id),
  unique (connection_id, external_event_id)
);

create index if not exists external_event_links_event_idx
  on public.external_event_links (event_id);

alter table public.external_calendar_connections enable row level security;
alter table public.external_event_links enable row level security;

-- Clients may only see non-secret connection metadata for themselves.
drop policy if exists external_calendar_connections_select_own on public.external_calendar_connections;
create policy external_calendar_connections_select_own
  on public.external_calendar_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists external_calendar_connections_update_own_flags on public.external_calendar_connections;
create policy external_calendar_connections_update_own_flags
  on public.external_calendar_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists external_calendar_connections_delete_own on public.external_calendar_connections;
create policy external_calendar_connections_delete_own
  on public.external_calendar_connections
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- No insert policy for authenticated — edge function (service role) writes tokens.

drop policy if exists external_event_links_select_own on public.external_event_links;
create policy external_event_links_select_own
  on public.external_event_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.external_calendar_connections c
      where c.id = connection_id
        and c.user_id = auth.uid()
    )
  );

-- Column-level: hide tokens from the client API even if someone selects *.
revoke all on table public.external_calendar_connections from anon, authenticated;
grant select (
  id,
  user_id,
  household_id,
  provider,
  account_email,
  external_calendar_id,
  external_calendar_name,
  sync_enabled,
  last_synced_at,
  last_error,
  created_at,
  updated_at
) on table public.external_calendar_connections to authenticated;
grant update (sync_enabled, updated_at) on table public.external_calendar_connections to authenticated;
grant delete on table public.external_calendar_connections to authenticated;

revoke all on table public.external_event_links from anon, authenticated;
grant select on table public.external_event_links to authenticated;

comment on table public.external_calendar_connections is
  'OAuth links to Google Calendar. Refresh/access tokens are service-role only.';
comment on table public.external_event_links is
  'Maps Pastelly events to Google Calendar event IDs for two-way sync.';
