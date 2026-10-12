import { clampStamp, MAX_DATA_BYTES, SONG_MIME_TYPES, UPLOAD_CONTENT_TYPE } from '../src/sync/rules';
import type { Remote, RemoteRow, RemoteTable } from '../src/sync/types';

/**
 * In-memory stand-in for the Supabase side, with the same server rules as the migration:
 * an older or equal updated_at never overwrites a row (scores follow the max rule instead), a lower or equal score never replaces
 * a stored score, every accepted write gets a rising server_at stamp, a stamp more than 5 minutes ahead of `now` is
 * clamped, a row body of 64 KiB or more is rejected (the whole batch fails, like a Postgres check violation), and the
 * songs bucket only takes its allowed content types.
 */
export class FakeRemote implements Remote {
  online = true;
  tick = 0;
  tables = new Map<RemoteTable, Map<string, RemoteRow>>();
  files = new Map<string, ArrayBuffer>();
  upserts: { table: RemoteTable; ids: string[] }[] = [];
  downloads: string[] = [];
  uploads: string[] = [];
  /** The server clock; tests move it. */
  now = () => Date.now();

  private guard() {
    if (!this.online) throw new Error('offline');
  }

  rows(table: RemoteTable): RemoteRow[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  async upsert(table: RemoteTable, rows: RemoteRow[]): Promise<void> {
    this.guard();
    for (const r of rows) {
      if (new TextEncoder().encode(JSON.stringify(r.data)).length >= MAX_DATA_BYTES) throw new Error(`new row for relation "${table}" violates check constraint "${table}_data_size"`);
    }
    this.upserts.push({ table, ids: rows.map((r) => r.id) });
    const t = this.tables.get(table) ?? new Map<string, RemoteRow>();
    this.tables.set(table, t);
    for (const row of rows) {
      const now = this.now();
      const r = { ...row, updated_at: clampStamp(row.updated_at, now), deleted_at: row.deleted_at === null ? null : clampStamp(row.deleted_at, now) };
      const cur = t.get(r.id);
      if (cur && table !== 'scores' && r.updated_at <= cur.updated_at) continue;
      if (cur && table === 'scores' && (r.score ?? 0) <= (cur.score ?? 0)) continue;
      t.set(r.id, { ...r, server_at: String(++this.tick).padStart(10, '0') });
    }
  }

  async fetchSince(table: RemoteTable, since: string | null, offset: number, limit: number): Promise<RemoteRow[]> {
    this.guard();
    return this.rows(table)
      .filter((r) => since === null || r.server_at! >= since)
      .sort((a, b) => (a.server_at! < b.server_at! ? -1 : 1))
      .slice(offset, offset + limit);
  }

  async upload(path: string, bytes: ArrayBuffer, contentType: string = UPLOAD_CONTENT_TYPE): Promise<void> {
    this.guard();
    if (!(SONG_MIME_TYPES as readonly string[]).includes(contentType)) throw new Error(`mime type ${contentType} is not supported`);
    this.uploads.push(path);
    this.files.set(path, bytes.slice(0));
  }

  async download(path: string): Promise<ArrayBuffer> {
    this.guard();
    this.downloads.push(path);
    const f = this.files.get(path);
    if (!f) throw new Error('not found');
    return f.slice(0);
  }

  async remove(path: string): Promise<void> {
    this.guard();
    this.files.delete(path);
  }
}
