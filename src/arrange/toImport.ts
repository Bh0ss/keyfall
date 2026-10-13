import { toMusicXml } from '../import/toMusicXml';
import type { Arrangement } from './types';

export interface ArrangedFile {
  fileName: string;
  bytes: Uint8Array;
}

/**
 * The arrangement as a MusicXML file for the existing import pipeline (`analyseFile`, then `buildSong` and `saveNewImport`).
 * Right hand on staff 1 and left hand on staff 2, so the file's own two staves give the hand split.
 */
export function arrangementToFile(arr: Arrangement, meta: { title: string; composer: string }): ArrangedFile {
  const xml = toMusicXml({ title: meta.title, composer: meta.composer, bpm: arr.bpm, timeSignature: arr.timeSignature, notes: arr.notes });
  const stem = meta.title.replace(/[^\w -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'song';
  return { fileName: `${stem}.musicxml`, bytes: new TextEncoder().encode(xml) };
}
