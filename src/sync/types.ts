/** Remote (Postgres) table names, one per synced IndexedDB table. */
export type RemoteTable = 'profiles' | 'scores' | 'attempts' | 'learn_progress' | 'note_stats' | 'review_queue' | 'imported_songs';

/** One row as the sync tables hold it. `household_id` is filled in by the database (auth.uid()). */
export interface RemoteRow {
  id: string;
  updated_at: number;
  deleted_at: number | null;
  data: Record<string, unknown>;
  /** scores only: the number the max rule compares. */
  score?: number;
  /** imported_songs only: the object path in the `songs` bucket. */
  storage_path?: string | null;
  /** Set by the server when it accepts a write. */
  server_at?: string;
}

/** The network side of sync. Supabase in the app, an in-memory fake in unit tests. */
export interface Remote {
  upsert(table: RemoteTable, rows: RemoteRow[]): Promise<void>;
  /** Rows with server_at >= since (all rows when null), ordered by server_at then id. */
  fetchSince(table: RemoteTable, since: string | null, offset: number, limit: number): Promise<RemoteRow[]>;
  upload(path: string, bytes: ArrayBuffer): Promise<void>;
  download(path: string): Promise<ArrayBuffer>;
  remove(path: string): Promise<void>;
}

export interface SyncResult {
  pushed: number;
  /** Remote rows that changed this device. */
  applied: number;
  errors: string[];
}
