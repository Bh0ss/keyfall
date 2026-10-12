import type { SupabaseClient } from '@supabase/supabase-js';
import { UPLOAD_CONTENT_TYPE } from './rules';
import type { Remote, RemoteRow, RemoteTable } from './types';

export const BUCKET = 'songs';

/** The Supabase implementation of Remote. Everything is scoped to the signed-in household by row-level security. */
export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async upsert(table: RemoteTable, rows: RemoteRow[]) {
      if (!rows.length) return;
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'household_id,id' });
      if (error) throw new Error(error.message);
    },
    async fetchSince(table, since, offset, limit) {
      let q = sb.from(table).select('id, updated_at, deleted_at, data, server_at' + (table === 'scores' ? ', score' : '') + (table === 'imported_songs' ? ', storage_path' : ''));
      if (since) q = q.gte('server_at', since);
      const { data, error } = await q.order('server_at').order('id').range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RemoteRow[];
    },
    async upload(path, bytes, contentType = UPLOAD_CONTENT_TYPE) {
      const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType });
      if (error) throw new Error(error.message);
    },
    async download(path) {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(error?.message ?? 'download failed');
      return data.arrayBuffer();
    },
    async remove(path) {
      const { error } = await sb.storage.from(BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    },
  };
}
