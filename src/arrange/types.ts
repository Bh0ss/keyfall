import type { Hand } from '../engine/song';

export type Version = 'beginner' | 'full';
export type TimeSignature = [number, number];

/** The beat grid: constant tempo (D5), beat 0 is the first downbeat. All times in beats are quarter notes. */
export interface Grid {
  bpm: number;
  /** Seconds, on the audio clock, of the downbeat that is beat 0. */
  downbeatSec: number;
  timeSignature: TimeSignature;
  /** Quarter-note beats per bar (3 for 3/4, 4 for 4/4, 3 for 6/8). */
  barBeats: number;
}

export const secPerBeat = (g: Pick<Grid, 'bpm'>) => 60 / g.bpm;
export const beatOf = (g: Grid, sec: number) => (sec - g.downbeatSec) / secPerBeat(g);
export const secOf = (g: Grid, beat: number) => g.downbeatSec + beat * secPerBeat(g);

export type Mode = 'major' | 'minor';
export interface Key {
  /** Pitch class 0-11 of the tonic. */
  tonic: number;
  mode: Mode;
  /** Pitch classes that belong to the key (harmonic minor for minor keys). */
  pcs: ReadonlySet<number>;
}

export type ChordQuality = 'maj' | 'min' | 'dim' | 'sus2' | 'sus4';
/** A chord held over a span of beats. This and the grid are all the left-hand generator is allowed to see. */
export interface ChordSegment {
  startBeat: number;
  endBeat: number;
  /** Pitch class 0-11. */
  root: number;
  quality: ChordQuality;
}

/** The extracted melody, before any simplification: the exact pitch as heard, start snapped to the 8th grid. */
export interface MelodyNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
}

export interface ArrangedNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  hand: Hand;
}

export interface Arrangement {
  bpm: number;
  timeSignature: TimeSignature;
  key: Key;
  grid: Grid;
  chords: ChordSegment[];
  /** The melody as extracted (pitch unfolded), for inspection and accuracy tests. */
  melody: MelodyNote[];
  notes: ArrangedNote[];
  estimatedBpm: number;
  /** 0-1: how clearly one tempo stood out. Low means "ask the player to tap". */
  confidence: number;
  bars: number;
}
