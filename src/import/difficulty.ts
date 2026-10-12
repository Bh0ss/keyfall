import type { Song } from '../engine/song';

export interface DifficultyMetrics {
  notesPerSecond: number;
  /** Highest minus lowest pitch, in semitones. */
  range: number;
  /** Share of notes that sound together with another note of the same hand (0-1). */
  chordDensity: number;
  /** Share of left-hand onsets that do not line up with a right-hand onset (0 for one hand) (0-1). */
  independence: number;
  /** 0-1, the weighted blend the level is cut from. */
  score: number;
}

export interface DifficultyEstimate {
  level: Song['level'];
  metrics: DifficultyMetrics;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const key = (beat: number) => Math.round(beat * 1000);

/** Level cut points on the blended score: below the first is level 1, above the last is Expert. */
const CUTS = [0.06, 0.14, 0.3, 0.5, 0.75];

export function measureSong(song: Pick<Song, 'notes' | 'bpm'>): DifficultyMetrics {
  const { notes, bpm } = song;
  if (notes.length === 0) return { notesPerSecond: 0, range: 0, chordDensity: 0, independence: 0, score: 0 };
  const end = notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
  const seconds = Math.max(1, (end * 60) / bpm);
  const notesPerSecond = notes.length / seconds;
  const pitches = notes.map((n) => n.midi);
  const range = Math.max(...pitches) - Math.min(...pitches);

  const onsets = (hand: 'right' | 'left') => {
    const map = new Map<number, number>();
    for (const n of notes) if (n.hand === hand) map.set(key(n.startBeat), (map.get(key(n.startBeat)) ?? 0) + 1);
    return map;
  };
  const right = onsets('right');
  const left = onsets('left');
  let chordNotes = 0;
  for (const m of [right, left]) for (const c of m.values()) if (c > 1) chordNotes += c;
  const chordDensity = chordNotes / notes.length;

  // Independence: how often the sparser hand plays on its own beat, apart from the other hand.
  let independence = 0;
  if (right.size > 0 && left.size > 0) {
    const [few, many] = right.size <= left.size ? [right, left] : [left, right];
    independence = [...few.keys()].filter((k) => !many.has(k)).length / few.size;
  }

  const score =
    0.35 * clamp01(notesPerSecond / 8) + 0.35 * clamp01((range - 10) / 50) + 0.1 * clamp01(chordDensity / 0.6) + 0.2 * clamp01(independence / 0.5);
  return { notesPerSecond, range, chordDensity, independence, score };
}

/** Difficulty from notes per second, range, chord density and hand independence. The player can override it. */
export function estimateDifficulty(song: Pick<Song, 'notes' | 'bpm'>): DifficultyEstimate {
  const metrics = measureSong(song);
  const idx = CUTS.findIndex((c) => metrics.score < c);
  const level = (idx === -1 ? 'expert' : idx + 1) as Song['level'];
  return { level, metrics };
}
