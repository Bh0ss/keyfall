import { useSyncExternalStore } from 'react';
import type { Song } from '../engine/song';
import type { KeyfallDb } from '../storage/db';
import { allImportedSongs } from '../storage/songs';
import type { ImportedSongRecord } from '../storage/types';
import { getSong as getBundled, getSongs as getBundledSongs } from './catalog';

/**
 * Every song the app can play: the bundled catalog plus the songs imported on this device.
 * Imported songs live in IndexedDB and are mirrored here so screens can look them up synchronously.
 */
interface LibraryState {
  ready: boolean;
  records: ImportedSongRecord[];
  songs: Song[];
}

let state: LibraryState = { ready: false, records: [], songs: getBundledSongs() };
const listeners = new Set<() => void>();

function publish(records: ImportedSongRecord[]): void {
  state = { ready: true, records, songs: [...getBundledSongs(), ...records.filter((r) => !r.deletedAt).map((r) => r.song)] };
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
export function getAllSongs(): Song[] {
  return state.songs;
}

/** A song by id, including a deleted import (results and stats still show its title). */
export function findSong(id: string): Song | undefined {
  return getBundled(id) ?? state.records.find((r) => r.song.id === id)?.song;
}

/** An import that can still be played (not deleted). */
export function findPlayableSong(id: string): Song | undefined {
  return state.songs.find((s) => s.id === id);
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
