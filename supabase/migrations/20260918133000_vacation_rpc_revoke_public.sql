-- Security definer RPCs must not keep the default PUBLIC execute grant.
revoke execute on function public.create_countdown(uuid, text, timestamptz, text, text, uuid[], timestamptz, boolean, text) from public;
grant execute on function public.create_countdown(uuid, text, timestamptz, text, text, uuid[], timestamptz, boolean, text) to authenticated;

revoke execute on function public.update_countdown(uuid, text, timestamptz, timestamptz, boolean, text, boolean) from public;
grant execute on function public.update_countdown(uuid, text, timestamptz, timestamptz, boolean, text, boolean) to authenticated;
