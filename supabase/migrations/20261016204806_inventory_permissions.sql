-- Supabase projects may grant ALL to authenticated through default privileges.
-- Immutable stocktakes must never be deleted or truncated by an API role.
revoke all on table public.mk_inventories from public,anon,authenticated;
grant select,insert,update on table public.mk_inventories to authenticated;
