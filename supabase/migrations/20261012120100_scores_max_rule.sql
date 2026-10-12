-- Scores follow the max rule only: a higher score from a device with an older clock must still win.
-- Every other table stays last-write-wins by updated_at.
create or replace function public.keyfall_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name <> 'scores' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.keyfall_touch() from public, anon, authenticated;
