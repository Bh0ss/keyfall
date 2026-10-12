import type { Hand, Song, SongNote } from '../engine/song';
import { estimateDifficulty } from './difficulty';
import { quantise } from './quantise';
import { assignHands } from './split';
import { barUnitsOf, toMusicXml } from './toMusicXml';
import type { BuiltSong, ImportAnalysis, ImportChoices } from './types';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Turn an analysed file plus the player's choices into a Song. MIDI imports are snapped to the 16th grid
 * and get a generated (approximate) MusicXML; MusicXML imports keep their own score and note timing.
 */
export function buildSong(a: ImportAnalysis, id: string, choices: ImportChoices, withScore = true): BuiltSong {
  const hands = assignHands(a, a.notes, choices.splitMode, choices.splitMidi);
  const placed = a.notes.map((n, i) => ({ midi: n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats, hand: hands[i] as Hand, ...(n.finger !== undefined ? { finger: n.finger } : {}) }));

  const isMidi = a.format === 'midi';
  // The generated score needs whole sixteenths per bar; anything odd is written as 4/4.
  const timeSignature = isMidi && !barUnitsOf(a.timeSignature) ? ([4, 4] as [number, number]) : a.timeSignature;
  const barBeats = (timeSignature[0] * 4) / timeSignature[1];
  const timed = isMidi ? quantise(placed) : [...placed].sort((x, y) => x.startBeat - y.startBeat || x.midi - y.midi);

  const notes: SongNote[] = timed.map((n, i) => ({
    id: `${id}-${i + 1}`,
    midi: n.midi,
    startBeat: round(n.startBeat),
    durationBeats: round(n.durationBeats),
    hand: n.hand,
    ...(n.finger !== undefined ? { finger: n.finger } : {}),
    measure: Math.floor(round(n.startBeat) / barBeats + 1e-9) + 1,
  }));
  const hasRight = notes.some((n) => n.hand === 'right');
  const hasLeft = notes.some((n) => n.hand === 'left');
  const title = choices.title.trim() || 'Imported song';
  const composer = choices.composer.trim() || 'Unknown';
  const musicXml = isMidi && withScore ? toMusicXml({ title, composer, bpm: a.bpm, timeSignature, notes }) : a.musicXml;

  const song: Song = {
    id,
    title,
    composer,
    source: 'imported',
    level: choices.level,
    hands: hasRight && hasLeft ? 'both' : hasLeft ? 'left' : 'right',
    bpm: a.bpm,
    timeSignature,
    notes,
    ...(musicXml !== undefined ? { musicXml } : {}),
  };
  return { song, approximate: isMidi };
}

/** The level the estimator suggests for these choices. */
export function suggestLevel(a: ImportAnalysis, choices: Pick<ImportChoices, 'splitMode' | 'splitMidi'>): Song['level'] {
  const { song } = buildSong(a, 'estimate', { title: '', composer: '', level: 1, ...choices }, false);
  return estimateDifficulty(song).level;
}
