import type { Song } from '../engine/song';
import { BUNDLED_ENTRIES } from './entries';
import { parseMusicXml } from './musicxml';

/**
 * Every bundled song fully parsed, all MusicXML loaded up front. The app does NOT import this (it would put about
 * 2 MB of MusicXML in the main chunk): it lists songs from `bundled.ts` and loads one on demand. Tests and
 * tooling use this for synchronous access to all the notes.
 */
const files = import.meta.glob<string>('./*.musicxml', { query: '?raw', import: 'default', eager: true });

let cache: Song[] | undefined;

export function getSongs(): Song[] {
  cache ??= BUNDLED_ENTRIES.map((e) => {
    const xml = files[`./${e.file}.musicxml`];
    if (xml === undefined) throw new Error(`Missing bundled song file ${e.file}.musicxml`);
    return parseMusicXml(xml, e.meta);
  });
  return cache;
}

export function getSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}
