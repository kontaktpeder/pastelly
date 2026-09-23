-- Link a Pastelly calendar to the Work organization that owns its shifts.
-- The Work API key stays in the work-schedule edge function, not in this table.

alter table public.households
  add column if not exists work_organization_id uuid;

comment on column public.households.work_organization_id is
  'Work organization whose production days are shown read-only on this calendar. Null until a calendar owner links it.';
