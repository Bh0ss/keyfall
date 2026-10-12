import type { KeyfallDb } from '../storage/db';
import { newSongId, saveImportedSong } from '../storage/songs';
import type { ImportedSongRecord } from '../storage/types';
import { loadLibrary } from '../songs/library';
import { analyseFile } from './analyse';
import { buildSong } from './build';
import type { ImportAnalysis, ImportChoices } from './types';

export interface SavedChoices extends ImportChoices {
  /** True when the player picked the level instead of taking the estimate. */
  levelOverridden: boolean;
}

/** Store a new import and refresh the library. */
export async function saveNewImport(db: KeyfallDb, a: ImportAnalysis, fileName: string, bytes: ArrayBuffer, choices: SavedChoices): Promise<ImportedSongRecord> {
  const id = newSongId();
  const { song, approximate } = buildSong(a, id, choices);
  const now = Date.now();
  const row = await saveImportedSong(db, {
    id,
    song,
    format: a.format,
    fileName,
    approximate,
    splitMode: choices.splitMode,
    splitMidi: choices.splitMidi,
    levelOverridden: choices.levelOverridden,
    source: bytes,
    createdAt: now,
  }, now);
  await loadLibrary(db);
  return row;
}

/** Rebuild an existing import from its stored file with new choices. The id (and so its scores) stays. */
export async function updateImport(db: KeyfallDb, rec: ImportedSongRecord, choices: SavedChoices): Promise<ImportedSongRecord> {
  const a = await analyseFile(rec.fileName, rec.source);
  const { song, approximate } = buildSong(a, rec.id, choices);
  const row = await saveImportedSong(db, { ...rec, song, approximate, splitMode: choices.splitMode, splitMidi: choices.splitMidi, levelOverridden: choices.levelOverridden });
  await loadLibrary(db);
  return row;
}
