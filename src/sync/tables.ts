import type { KeyfallDb } from '../storage/db';
import type { RemoteRow, RemoteTable } from './types';

/** IndexedDB table names that sync. Latency is per device and stays local. */
export type SyncName = 'profiles' | 'scores' | 'attempts' | 'learnProgress' | 'noteStats' | 'reviewQueue' | 'songs';

export interface SyncSpec {
  local: SyncName;
  remote: RemoteTable;
}

export const SYNC_TABLES: readonly SyncSpec[] = [
  { local: 'profiles', remote: 'profiles' },
  { local: 'scores', remote: 'scores' },
  { local: 'attempts', remote: 'attempts' },
  { local: 'learnProgress', remote: 'learn_progress' },
  { local: 'noteStats', remote: 'note_stats' },
  { local: 'reviewQueue', remote: 'review_queue' },
  { local: 'songs', remote: 'imported_songs' },
];

/** A local record with the fields every synced table shares. */
export interface Rec {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  score?: number;
  [key: string]: unknown;
}

export function localTable(db: KeyfallDb, name: SyncName) {
  return db[name] as unknown as import('dexie').Table<Rec, string>;
}

/** Fields that never travel in `data`: they are columns, or (imported songs) rebuilt from the original file. */
const NOT_IN_DATA = new Set(['id', 'updatedAt', 'deletedAt', 'source', 'song']);

/** Imported song fields kept in `data` (the rest of the Song is rebuilt from the file). */
export interface SongMeta {
  title: string;
  composer: string;
  level: unknown;
}

export function toRemote(name: SyncName, rec: Rec, storagePath?: string): RemoteRow {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) if (!NOT_IN_DATA.has(k)) data[k] = v;
  if (name === 'songs') {
    const song = rec.song as { title: string; composer: string; level: unknown };
    data.title = song.title;
    data.composer = song.composer;
    data.level = song.level;
  }
  const row: RemoteRow = { id: rec.id, updated_at: rec.updatedAt, deleted_at: rec.deletedAt ?? null, data };
  if (name === 'scores') row.score = rec.score ?? 0;
  if (name === 'songs') row.storage_path = storagePath ?? null;
  return row;
}

/** The record a remote row describes (imported songs come back without `song` and `source`). */
export function fromRemote(row: RemoteRow): Rec {
  const rec: Rec = { ...row.data, id: row.id, updatedAt: row.updated_at };
  if (row.deleted_at !== null) rec.deletedAt = row.deleted_at;
  return rec;
}
