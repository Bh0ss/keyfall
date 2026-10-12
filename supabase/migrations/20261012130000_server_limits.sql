-- Keyfall Phase 9: server-side limits (Kasumi Phase 8 lows).
--  1. The `songs` bucket accepts only the file types the import flow can produce.
--  2. A synced row's JSON body is capped at 64 KiB (the largest real body is a few KiB).
--  3. A client-supplied updated_at / deleted_at is clamped to at most 5 minutes past the server clock,
--     so a wrong or hostile device clock cannot pin a row in the far future and win every later merge.

update storage.buckets
set allowed_mime_types = array[
  'audio/midi',
  'audio/x-midi',
  'application/vnd.recordare.musicxml+xml',
  'application/vnd.recordare.musicxml',
  'application/xml',
  'text/xml',
  'application/octet-stream'
]
where id = 'songs';

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'scores', 'attempts', 'learn_progress', 'note_stats', 'review_queue', 'imported_songs']
  loop
    execute format('alter table public.%I add constraint %I check (pg_column_size(data) < 65536)', t, t || '_data_size');
  end loop;
end $$;

-- The clamp runs before the last-write-wins comparison, so a clamped stamp is compared like any other.
create or replace function public.keyfall_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ceiling bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint + 300000;
begin
  new.updated_at := least(new.updated_at, ceiling);
  new.deleted_at := least(new.deleted_at, ceiling);
  if tg_op = 'UPDATE' and tg_table_name <> 'scores' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.keyfall_touch() from public, anon, authenticated;
