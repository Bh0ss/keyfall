import type { Song } from './song';

export interface MeasureLoop {
  fromMeasure: number;
  toMeasure: number;
}

/** Quarter-note beats in one bar. */
export function barBeats(song: Song): number {
  const [num, den] = song.timeSignature;
  return (num * 4) / den;
}

/** A loop given directly in beats (the shift drill loops a few notes, not whole bars). */
export interface BeatLoop {
  startBeat: number;
  endBeat: number;
}

export type LoopSpan = MeasureLoop | BeatLoop;

/** Beat range [startBeat, endBeat) of a loop. Measure spans assume bars start at beat 0 with no pickup. */
export function loopRange(song: Song, loop: LoopSpan): { startBeat: number; endBeat: number } {
  if ('startBeat' in loop) return { startBeat: loop.startBeat, endBeat: loop.endBeat };
  const bar = barBeats(song);
  const from = Math.max(1, Math.min(loop.fromMeasure, loop.toMeasure));
  const to = Math.max(loop.fromMeasure, loop.toMeasure);
  return { startBeat: (from - 1) * bar, endBeat: to * bar };
}

export function lastMeasure(song: Song): number {
  return song.notes.reduce((m, n) => Math.max(m, n.measure), 1);
}
