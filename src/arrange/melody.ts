import type { NoteEvent } from '../transcribe/types';
import { beatOf, type Grid, type Key, type MelodyNote } from './types';

/** Melody register: C4 to C6, widened to G3 to E6 for a bar that has nothing inside it. Notes below E3 only ever vote for chords. */
export const BAND: [number, number] = [60, 84];
export const WIDE_BAND: [number, number] = [55, 88];
/** The melody sits on the 8th-note grid. */
export const SLOT = 0.5;
/** Same-pitch onsets closer than this are one note re-triggered by the model, not a repeat. */
const REONSET_SEC = 0.12;
/** A louder simultaneous note this far below makes a candidate an upper partial: an octave, an octave and a fifth, two octaves. */
const PARTIALS = new Set([12, 19, 24]);
/** An onset this close to the start of the louder note counts as simultaneous. */
const SIMULTANEOUS_SEC = 0.06;
/** Shorter than a 16th is a speck; an out-of-key note must last an 8th to be believed. */
const MIN_BEATS = 0.2;
const MIN_BEATS_OUT_OF_KEY = SLOT - 1e-6;
/** Leaps up to a fifth are free; beyond it each semitone costs LEAP_COST, and an octave or more costs OCTAVE_COST extra. */
const FREE_LEAP = 7;
const LEAP_COST = 0.06;
const OCTAVE_COST = 0.3;

interface Cand {
  midi: number;
  start: number;
  dur: number;
  amp: number;
  startSec: number;
  durSec: number;
  slot: number;
  salience: number;
}

/** Merge same-pitch onsets within REONSET_SEC into one note (earliest start, longest reach, loudest amplitude). */
function mergeReonsets(events: NoteEvent[]): NoteEvent[] {
  const sorted = [...events].sort((a, b) => a.midi - b.midi || a.startSec - b.startSec);
  const out: NoteEvent[] = [];
  for (const e of sorted) {
    const prev = out.at(-1);
    if (prev && prev.midi === e.midi && e.startSec - prev.startSec < REONSET_SEC) {
      prev.durationSec = Math.max(prev.startSec + prev.durationSec, e.startSec + e.durationSec) - prev.startSec;
      prev.amplitude = Math.max(prev.amplitude, e.amplitude);
    } else out.push({ ...e });
  }
  return out;
}

/** Drop a note that sits at a partial interval above a louder note sounding at the same moment. */
function rejectPartials(events: NoteEvent[]): NoteEvent[] {
  return events.filter(
    (c) => !events.some((n) => n !== c && PARTIALS.has(c.midi - n.midi) && n.amplitude > c.amplitude && n.startSec <= c.startSec + SIMULTANEOUS_SEC && n.startSec + n.durationSec > c.startSec),
  );
}

const leapCost = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.max(0, d - FREE_LEAP) * LEAP_COST + (d >= 12 ? OCTAVE_COST : 0);
};

/**
 * One melody note per occupied 8th-note slot. Candidates are the notes in the melody register; a Viterbi pass
 * maximises amplitude-times-duration salience and penalises leaps, which is what lets a steady line beat the
 * accompaniment and the vocal's harmonics that slip through. Pure: the same input gives the same notes.
 */
export function extractMelody(events: NoteEvent[], grid: Grid, key: Key): MelodyNote[] {
  const heard = rejectPartials(mergeReonsets(events.filter((e) => e.midi >= 21 && e.midi <= 108 && e.durationSec > 0)));
  const all: Cand[] = heard.map((e) => {
    const start = beatOf(grid, e.startSec);
    const dur = beatOf(grid, e.startSec + e.durationSec) - start;
    return { midi: e.midi, start, dur, amp: e.amplitude, startSec: e.startSec, durSec: e.durationSec, slot: Math.max(0, Math.round(start / SLOT)), salience: e.amplitude * (0.25 + Math.min(e.durationSec, 1)) };
  });

  const barOf = (c: Cand) => Math.floor(Math.max(0, c.start) / grid.barBeats + 1e-9);
  const inBand = (c: Cand, [lo, hi]: [number, number]) => c.midi >= lo && c.midi <= hi;
  const barsWithMelody = new Set(all.filter((c) => inBand(c, BAND)).map(barOf));
  const cands = all.filter((c) => (barsWithMelody.has(barOf(c)) ? inBand(c, BAND) : inBand(c, WIDE_BAND))).filter((c) => c.dur >= (key.pcs.has(c.midi % 12) ? MIN_BEATS : MIN_BEATS_OUT_OF_KEY));
  if (cands.length === 0) return [];

  const lastSlot = Math.max(...cands.map((c) => c.slot));
  const bySlot: Cand[][] = Array.from({ length: lastSlot + 1 }, () => []);
  for (const c of cands) bySlot[c.slot]!.push(c);

  // Viterbi over the occupied slots, choosing one candidate in each (an empty slot is a rest, and a lone candidate is
  // always kept, however far it leaps: leaps only decide between candidates that compete). Each option remembers
  // nothing but its own pitch, so a rest leaves the previous pitch to the leap cost of the next slot.
  const slots = bySlot.map((c, s) => ({ s, c })).filter((x) => x.c.length > 0);
  const back: number[][] = [];
  let score: number[] = [];
  let prev: Cand[] = [];
  slots.forEach(({ c: here }, n) => {
    const from: number[] = [];
    const next = here.map((o) => {
      if (n === 0) {
        from.push(0);
        return o.salience;
      }
      let best = -Infinity;
      let arg = 0;
      prev.forEach((p, i) => {
        const v = score[i]! - leapCost(o.midi, p.midi);
        if (v > best + 1e-12) [best, arg] = [v, i];
      });
      from.push(arg);
      return best + o.salience;
    });
    back.push(from);
    score = next;
    prev = here;
  });
  const chosen: (Cand | null)[] = new Array(lastSlot + 1).fill(null);
  let k = score.indexOf(Math.max(...score));
  for (let i = slots.length - 1; i >= 0; i--) {
    chosen[slots[i]!.s] = slots[i]!.c[k]!;
    k = back[i]![k]!;
  }

  const picked = chosen.flatMap((c, s) => (c ? [{ c, slot: s }] : []));
  return picked.map(({ c, slot }, i) => {
    const startBeat = slot * SLOT;
    const nextStart = picked[i + 1] ? picked[i + 1]!.slot * SLOT : Infinity;
    const end = Math.min(nextStart, Math.max(startBeat + SLOT, Math.round((c.start + c.dur) / SLOT) * SLOT));
    return { midi: c.midi, startBeat, durationBeats: end - startBeat };
  });
}
