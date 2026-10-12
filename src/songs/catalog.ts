import type { Song } from '../engine/song';
import maryXml from './mary-had-a-little-lamb.musicxml?raw';
import twinkleXml from './twinkle-twinkle-little-star.musicxml?raw';
import { parseMusicXml, type SongMeta } from './musicxml';

interface CatalogEntry {
  meta: SongMeta;
  xml: string;
}

/** Bundled songs. Public domain only, arranged as MusicXML. */
const ENTRIES: CatalogEntry[] = [
  { meta: { id: 'mary-had-a-little-lamb', level: 1 }, xml: maryXml },
  { meta: { id: 'twinkle-twinkle-little-star', level: 1 }, xml: twinkleXml },
];

let cache: Song[] | undefined;

export function getSongs(): Song[] {
  cache ??= ENTRIES.map((e) => parseMusicXml(e.xml, e.meta));
  return cache;
}

export function getSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}
