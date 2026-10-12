import type { Remote, RemoteRow, RemoteTable } from '../src/sync/types';

/**
 * In-memory stand-in for the Supabase side, with the same server rules as the migration:
 * an older or equal updated_at never overwrites a row (scores follow the max rule instead), a lower or equal score never replaces
 * a stored score, and every accepted write gets a rising server_at stamp.
 */
export class FakeRemote implements Remote {
  online = true;
  tick = 0;
  tables = new Map<RemoteTable, Map<string, RemoteRow>>();
  files = new Map<string, ArrayBuffer>();
  upserts: { table: RemoteTable; ids: string[] }[] = [];
  downloads: string[] = [];
  uploads: string[] = [];

  private guard() {
    if (!this.online) throw new Error('offline');
  }

  rows(table: RemoteTable): RemoteRow[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  async upsert(table: RemoteTable, rows: RemoteRow[]): Promise<void> {
    this.guard();
    this.upserts.push({ table, ids: rows.map((r) => r.id) });
    const t = this.tables.get(table) ?? new Map<string, RemoteRow>();
    this.tables.set(table, t);
    for (const r of rows) {
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

  async upload(path: string, bytes: ArrayBuffer): Promise<void> {
    this.guard();
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
