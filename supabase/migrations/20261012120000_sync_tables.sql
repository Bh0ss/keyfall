-- Keyfall Phase 8: household sync tables.
-- One household account = one auth.uid(). Every row is owned by household_id and
-- every policy is `household_id = auth.uid()`. Only `authenticated` gets privileges.
-- Rows mirror the app's IndexedDB rows: stable text id, client updated_at (epoch ms),
-- optional soft-delete stamp, and the record body as JSON.

create or replace function public.keyfall_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Last-write-wins per record: an older or equal client stamp never overwrites a newer row.
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.keyfall_keep_max_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- High scores keep the max: a lower or equal score never replaces the stored one.
  if tg_op = 'UPDATE' and new.score <= old.score then
    return null;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'scores', 'attempts', 'learn_progress', 'note_stats', 'review_queue', 'imported_songs']
  loop
    execute format($f$
      create table public.%1$I (
        household_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        updated_at bigint not null,
        deleted_at bigint,
        data jsonb not null default '{}'::jsonb,
        server_at timestamptz not null default clock_timestamp(),
        primary key (household_id, id)
      )$f$, t);
    execute format('create index %I on public.%I (household_id, server_at)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (household_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (household_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (household_id = auth.uid()) with check (household_id = auth.uid())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (household_id = auth.uid())', t || '_delete', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.keyfall_touch()', t || '_touch', t);
  end loop;
end $$;

-- scores carry the number the max rule compares.
alter table public.scores add column score integer not null default 0;
create trigger scores_keep_max before update on public.scores
  for each row execute function public.keyfall_keep_max_score();

-- imported_songs: metadata here, the original file in the private `songs` bucket.
alter table public.imported_songs add column storage_path text;

revoke all on function public.keyfall_touch() from public, anon, authenticated;
revoke all on function public.keyfall_keep_max_score() from public, anon, authenticated;

-- Private bucket for imported originals. Object names are `<auth.uid()>/<song id>`.
insert into storage.buckets (id, name, public, file_size_limit)
values ('songs', 'songs', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy songs_select on storage.objects for select to authenticated
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy songs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy songs_update on storage.objects for update to authenticated
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy songs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'songs' and (storage.foldername(name))[1] = auth.uid()::text);
