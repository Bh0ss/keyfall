-- Fix for 20261012130000: least() ignores NULL, so the deleted_at clamp turned every live row (deleted_at null) into a
-- row "deleted" five minutes in the future. Clamp deleted_at only when it is set.
create or replace function public.keyfall_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ceiling bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint + 300000;
begin
  new.updated_at := least(new.updated_at, ceiling);
  if new.deleted_at is not null then
    new.deleted_at := least(new.deleted_at, ceiling);
  end if;
  if tg_op = 'UPDATE' and tg_table_name <> 'scores' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.keyfall_touch() from public, anon, authenticated;
