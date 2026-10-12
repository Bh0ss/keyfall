import type { Hand } from '../engine/song';

/** One sixteenth note, in quarter-note beats. */
export const GRID = 0.25;
const EPS = 1e-9;

export interface QNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  hand: Hand;
  finger?: 1 | 2 | 3 | 4 | 5;
}

const snap = (beats: number) => Math.round(beats / GRID + EPS) * GRID;

/**
 * Snap starts and ends to the 16th grid (a note is at least one 16th long) and make same-pitch,
 * same-hand notes not overlap: a note that is struck again is cut short, an exact duplicate is dropped.
 */
export function quantise<T extends { midi: number; startBeat: number; durationBeats: number; hand: Hand }>(notes: T[]): T[] {
  const snapped = notes.map((n) => {
    const start = snap(n.startBeat);
    const end = Math.max(snap(n.startBeat + n.durationBeats), start + GRID);
    return { ...n, startBeat: start, durationBeats: end - start };
  });
  snapped.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const last = new Map<string, T>();
  const out: T[] = [];
  for (const n of snapped) {
    const key = `${n.hand}:${n.midi}`;
    const prev = last.get(key);
    if (prev) {
      if (Math.abs(prev.startBeat - n.startBeat) < EPS) {
        if (n.durationBeats > prev.durationBeats) prev.durationBeats = n.durationBeats;
        continue;
      }
      if (prev.startBeat + prev.durationBeats > n.startBeat + EPS) prev.durationBeats = n.startBeat - prev.startBeat;
    }
    last.set(key, n);
    out.push(n);
  }
  return out;
}
