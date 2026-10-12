import type { KeyfallDb } from './db';
import { newId } from './db';
import type { ImportedSongRecord } from './types';

export const IMPORTED_ID_PREFIX = 'imp-';

export function newSongId(): string {
  return `${IMPORTED_ID_PREFIX}${newId()}`;
}

/** Every imported song row, deleted ones included (scores and stats still name them). */
export async function allImportedSongs(db: KeyfallDb): Promise<ImportedSongRecord[]> {
  return (await db.songs.toArray()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveImportedSong(db: KeyfallDb, rec: Omit<ImportedSongRecord, 'updatedAt'>, now = Date.now()): Promise<ImportedSongRecord> {
  const row = { ...rec, updatedAt: now };
  await db.songs.put(row);
  return row;
}

/** Soft delete: the row stays (with `deletedAt`) so Phase 8 sync can carry the deletion. */
export async function deleteImportedSong(db: KeyfallDb, id: string, now = Date.now()): Promise<void> {
  await db.songs.where('id').equals(id).modify({ deletedAt: now, updatedAt: now });
}
