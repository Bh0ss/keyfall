import type { Song } from '../engine/song';
import canonXml from './canon-in-d.musicxml?raw';
import clairXml from './clair-de-lune.musicxml?raw';
import eliseXml from './fur-elise.musicxml?raw';
import greenXml from './greensleeves.musicxml?raw';
import jingleXml from './jingle-bells.musicxml?raw';
import maryXml from './mary-had-a-little-lamb.musicxml?raw';
import minuetXml from './minuet-in-g.musicxml?raw';
import odeXml from './ode-to-joy.musicxml?raw';
import twinkleXml from './twinkle-twinkle-little-star.musicxml?raw';
import saintsXml from './when-the-saints.musicxml?raw';
import nocturneXml from './chopin-nocturne-op72-1.musicxml?raw';
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
  { meta: { id: 'when-the-saints-go-marching-in', level: 3, unlockedBy: 'unit-4' }, xml: saintsXml },
  { meta: { id: 'minuet-in-g', level: 4, unlockedBy: 'unit-6' }, xml: minuetXml },
  { meta: { id: 'greensleeves', level: 4, unlockedBy: 'unit-7' }, xml: greenXml },
  { meta: { id: 'fur-elise-opening', level: 5, unlockedBy: 'unit-8' }, xml: eliseXml },
  { meta: { id: 'canon-in-d', level: 5, unlockedBy: 'unit-9' }, xml: canonXml },
  { meta: { id: 'clair-de-lune', level: 'expert', unlockedBy: 'advanced' }, xml: clairXml },
  // Requested addition beyond the spec's list of ten (see PROGRESS.md Decisions).
  { meta: { id: 'chopin-nocturne-op72-1', level: 'expert', unlockedBy: 'advanced' }, xml: nocturneXml },
];

let cache: Song[] | undefined;

export function getSongs(): Song[] {
  cache ??= ENTRIES.map((e) => parseMusicXml(e.xml, e.meta));
  return cache;
}

export function getSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}
