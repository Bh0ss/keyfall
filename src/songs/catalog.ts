import type { Song } from '../engine/song';
import jingleXml from './jingle-bells.musicxml?raw';
import maryXml from './mary-had-a-little-lamb.musicxml?raw';
import odeXml from './ode-to-joy.musicxml?raw';
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
  { meta: { id: 'ode-to-joy', level: 2, unlockedBy: 'unit-2' }, xml: odeXml },
  { meta: { id: 'jingle-bells', level: 2, unlockedBy: 'unit-3' }, xml: jingleXml },
];

let cache: Song[] | undefined;

export function getSongs(): Song[] {
  cache ??= ENTRIES.map((e) => parseMusicXml(e.xml, e.meta));
  return cache;
}

export function getSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}
