import { useSyncExternalStore } from 'react';
import type { Song } from '../engine/song';
import type { KeyfallDb } from '../storage/db';
import { allImportedSongs } from '../storage/songs';
import type { ImportedSongRecord } from '../storage/types';
import type { SongLookups } from '../progress/compute';
import { bundledSummaries, bundledSummary, loadBundledSong } from './bundled';
import { summarize, type SongSummary } from './summary';

/**
 * Every song the app can play: the bundled catalog plus the songs imported on this device.
 * Imported songs live in IndexedDB and are mirrored here so screens can look them up synchronously.
 */
interface LibraryState {
  ready: boolean;
  records: ImportedSongRecord[];
  songs: SongSummary[];
}

let state: LibraryState = { ready: false, records: [], songs: bundledSummaries() };
const listeners = new Set<() => void>();

function publish(records: ImportedSongRecord[]): void {
  state = { ready: true, records, songs: [...bundledSummaries(), ...records.filter((r) => !r.deletedAt).map((r) => summarize(r.song))] };
  listeners.forEach((l) => l());
}

/** Load the imported songs. If storage fails the bundled songs still work. */
export async function loadLibrary(db: KeyfallDb): Promise<void> {
  try {
    publish(await allImportedSongs(db));
  } catch {
    publish([]);
  }
}

/** Playable songs: bundled first, then imports in the order they were added. */
export function getAllSongs(): SongSummary[] {
  return state.songs;
}

/** A song by id, including a deleted import (results and stats still show its title). */
export function findSong(id: string): SongSummary | undefined {
  const rec = state.records.find((r) => r.song.id === id);
  return bundledSummary(id) ?? (rec ? summarize(rec.song) : undefined);
}

/** An import that can still be played (not deleted). */
export function findPlayableSong(id: string): SongSummary | undefined {
  return state.songs.find((s) => s.id === id);
}

/** The whole song with its notes. Bundled songs are fetched on first use; imports are already in memory. */
export async function loadPlayableSong(id: string): Promise<Song | undefined> {
  if (bundledSummary(id)) return loadBundledSong(id);
  return importedRecord(id)?.song;
}

export function importedRecord(id: string): ImportedSongRecord | undefined {
  return state.records.find((r) => r.song.id === id && !r.deletedAt);
}

/** True when the song's sheet was generated from MIDI. */
export function hasApproximateSheet(id: string): boolean {
  return !!importedRecord(id)?.approximate;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state);
}

/** What the badge rules ask about a song id. */
export const songLookups: SongLookups = {
  songLevel: (id) => findSong(id)?.level,
  imported: (id) => findSong(id)?.source === 'imported',
};
