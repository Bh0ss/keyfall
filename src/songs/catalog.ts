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
import rowXml from './row-row-row-your-boat.musicxml?raw';
import londonXml from './london-bridge.musicxml?raw';
import frereXml from './frere-jacques.musicxml?raw';
import yankeeXml from './yankee-doodle.musicxml?raw';
import susannaXml from './oh-susanna.musicxml?raw';
import birthdayXml from './happy-birthday.musicxml?raw';
import graceXml from './amazing-grace.musicxml?raw';
import brahmsXml from './brahms-lullaby.musicxml?raw';
import auldXml from './auld-lang-syne.musicxml?raw';
import scarboroughXml from './scarborough-fair.musicxml?raw';
import musetteXml from './bach-musette-in-d.musicxml?raw';
import frenchSongXml from './tchaikovsky-old-french-song.musicxml?raw';
import schumannMelodyXml from './schumann-melody-op68-1.musicxml?raw';
import farmerXml from './schumann-happy-farmer.musicxml?raw';
import arabesqueXml from './burgmuller-arabesque.musicxml?raw';
import preludeXml from './bach-prelude-in-c.musicxml?raw';
import sonatinaXml from './clementi-sonatina-op36-1-mvt1.musicxml?raw';
import entertainerXml from './joplin-the-entertainer.musicxml?raw';
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
  // Requested addition: 18 more songs (see PROGRESS.md Decisions).
  { meta: { id: 'row-row-row-your-boat', level: 1 }, xml: rowXml },
  { meta: { id: 'london-bridge', level: 1 }, xml: londonXml },
  { meta: { id: 'frere-jacques', level: 1 }, xml: frereXml },
  { meta: { id: 'yankee-doodle', level: 1 }, xml: yankeeXml },
  { meta: { id: 'oh-susanna', level: 1 }, xml: susannaXml },
  { meta: { id: 'happy-birthday', level: 1 }, xml: birthdayXml },
  { meta: { id: 'amazing-grace', level: 2 }, xml: graceXml },
  { meta: { id: 'brahms-lullaby', level: 2 }, xml: brahmsXml },
  { meta: { id: 'auld-lang-syne', level: 2 }, xml: auldXml },
  { meta: { id: 'scarborough-fair', level: 2 }, xml: scarboroughXml },
  { meta: { id: 'bach-musette-in-d', level: 4, unlockedBy: 'unit-5' }, xml: musetteXml },
  { meta: { id: 'tchaikovsky-old-french-song', level: 4, unlockedBy: 'unit-5' }, xml: frenchSongXml },
  { meta: { id: 'schumann-melody-op68-1', level: 4, unlockedBy: 'unit-5' }, xml: schumannMelodyXml },
  { meta: { id: 'schumann-happy-farmer', level: 4, unlockedBy: 'unit-5' }, xml: farmerXml },
  { meta: { id: 'burgmuller-arabesque', level: 5, unlockedBy: 'unit-9' }, xml: arabesqueXml },
  { meta: { id: 'bach-prelude-in-c', level: 4, unlockedBy: 'unit-5' }, xml: preludeXml },
  { meta: { id: 'clementi-sonatina-op36-1-mvt1', level: 4, unlockedBy: 'unit-5' }, xml: sonatinaXml },
  { meta: { id: 'joplin-the-entertainer', level: 5, unlockedBy: 'unit-9' }, xml: entertainerXml },
];

let cache: Song[] | undefined;

export function getSongs(): Song[] {
  cache ??= ENTRIES.map((e) => parseMusicXml(e.xml, e.meta));
  return cache;
}

export function getSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}
