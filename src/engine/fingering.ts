import { impliedAnchor, isStretch } from './positions';
import type { Hand, SongNote } from './song';

/**
 * Auto-fingering. For each hand, a dynamic programme picks the finger for every note that has none, by the
 * cheapest path through a cost model: a finger pair costs more the further the keys are from what the two
 * fingers reach naturally (a stretch or a squeeze), crossings cost (thumb under or over is cheap up to a fourth and steep beyond it, the ring finger with the thumb is dear, any other
 * crossing is awkward, and the little finger never crosses), the same finger on a different key in quick succession is nearly forbidden, and the thumb
 * or the little finger on a black key costs a little. The hand position is tracked the way the hand-position help
 * (positions.ts) tracks it, and every move of the position costs, so the fewest shifts wins. Chords are spread over distinct fingers in pitch order.
 * Fingers already on notes are fixed constraints. Pure and deterministic: ties go to the lowest finger numbers.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;

/** The part of a note this reads. A `SongNote` fits. */
export type FingerNote = Pick<SongNote, 'id' | 'midi' | 'startBeat' | 'durationBeats' | 'hand'> & { finger?: Finger };

const EPS = 1e-6;
/** Semitones from the thumb to each finger resting on a major five-finger position. */
const REACH = [0, 2, 4, 5, 7] as const;
const BLACK_PC = new Set([1, 3, 6, 8, 10]);
const isBlack = (midi: number) => BLACK_PC.has(midi % 12);

/** Where a finger rests along the keyboard, in semitones; the left hand mirrors the right. */
const place = (hand: Hand, finger: Finger) => (hand === 'right' ? REACH[finger - 1]! : -REACH[finger - 1]!);

/** A weak finger costs a hair more, so ties fall to the stronger one (a chord prefers the middle finger to the index). */
const WEAK = [0, 0.05, 0, 0.2, 0.1] as const;

/** Cost of keeping or leaving the hand in place when it goes from one key to another with two different fingers. */
function reachCost(hand: Hand, a: number, f: Finger, b: number, g: Finger): number {
  const d = b - a;
  const e = place(hand, g) - place(hand, f);
  if (d * e > 0) {
    // The natural direction: the further the keys are from what the fingers reach, the worse.
    // A semitone either way is within what a hand gives for free.
    const m = Math.min(Math.max(0, Math.abs(d - e) - 1), 12);
    return m <= 2 ? m : 2 + (m - 2) * 1.5;
  }
  // A crossing. The little finger never crosses (as dear as a same-finger repeat at speed). The thumb passing under
  // (or a finger over the thumb) is normal for a short step; past a fourth it gets steeply worse, so a wide move is
  // never bought just to save a shift. The ring finger and the thumb crossing costs 20, several position shifts' worth, so it appears only when nothing else works. Any other crossing, such as 4 over 3, is awkward.
  if (g === 5 || f === 5) return 40 + Math.max(0, Math.abs(d) - 5);
  if (g === 1 || f === 1) {
    const other = g === 1 ? f : g;
    const base = other === 3 ? 4.5 : other === 4 ? 20 : 6.5;
    return base + Math.max(0, Math.abs(d) - 4) * 3 + (g === 1 && isBlack(b) ? 3 : 0);
  }
  return 10 + Math.max(0, Math.abs(d) - 5);
}

/** Cost of playing key b with finger g right after key a with finger f; `gap` is the time between their starts. */
function stepCost(hand: Hand, a: number, f: Finger, b: number, g: Finger, gap: number): number {
  if (a === b) return f === g ? 0 : 3;
  if (f === g) return gap <= 1 + EPS ? 40 : gap <= 2 + EPS ? 5 : 2;
  return reachCost(hand, a, f, b, g);
}

/** Cost of one note's own finger: the thumb or little finger on a black key. */
function ownCost(midi: number, g: Finger): number {
  const w = WEAK[g - 1]!;
  if (!isBlack(midi)) return w;
  return w + (g === 1 ? 3 : g === 5 ? 1 : 0);
}

interface Step {
  start: number;
  /** Distinct pitches ascending, and the notes on each. */
  pitches: number[];
  ends: number[];
  ids: string[][];
  /** The finger already on each pitch, or 0. */
  fixed: number[];
}

type Option = Finger[];

/** Every way to give a step's pitches distinct fingers in pitch order (right: rising; left: falling), honouring fixed fingers. */
function optionsFor(step: Step, hand: Hand): Option[] {
  const k = step.pitches.length;
  const out: Option[] = [];
  const pool: Finger[] = [1, 2, 3, 4, 5];
  const take = Math.min(k, 5);
  const pick = (from: number, chosen: Finger[]) => {
    if (chosen.length === take) {
      const ordered = hand === 'right' ? chosen : [...chosen].reverse();
      // Past five pitches (not playable by one hand) the rest repeat the last finger.
      const full: Option = [...ordered];
      while (full.length < k) full.push(ordered[ordered.length - 1]!);
      if (full.every((f, i) => step.fixed[i] === 0 || step.fixed[i] === f)) out.push(full);
      return;
    }
    for (let i = from; i < pool.length; i++) pick(i + 1, [...chosen, pool[i]!]);
  };
  pick(0, []);
  if (out.length > 0) return out;
  // The given fingers do not fit a rising order: keep them and fill the rest with unused fingers.
  const used = new Set(step.fixed.filter((f) => f > 0));
  const free = pool.filter((f) => !used.has(f));
  if (hand === 'left') free.reverse();
  let next = 0;
  return [step.fixed.map((f) => (f > 0 ? (f as Finger) : (free[Math.min(next++, free.length - 1)] ?? 1)))];
}

function stepsOf(notes: readonly FingerNote[]): Step[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const steps: Step[] = [];
  for (const note of sorted) {
    let step = steps[steps.length - 1];
    if (!step || note.startBeat - step.start > EPS) {
      step = { start: note.startBeat, pitches: [], ends: [], ids: [], fixed: [] };
      steps.push(step);
    }
    let at = step.pitches.indexOf(note.midi);
    if (at < 0) {
      at = step.pitches.length;
      step.pitches.push(note.midi);
      step.ends.push(0);
      step.ids.push([]);
      step.fixed.push(0);
    }
    step.ends[at] = Math.max(step.ends[at]!, note.startBeat + note.durationBeats);
    step.ids[at]!.push(note.id);
    if (note.finger !== undefined) step.fixed[at] = note.finger;
  }
  return steps;
}

/** Cost of moving from one step's fingering to the next's. */
function transition(hand: Hand, p: Step, po: Option, q: Step, qo: Option): number {
  const gap = q.start - p.start;
  let cost = 0;
  if (p.pitches.length > 1 && q.pitches.length > 1) {
    // Chord to chord: the hand jumps; count how far the hand travels.
    const mid = (s: Step) => (s.pitches[0]! + s.pitches[s.pitches.length - 1]!) / 2;
    cost += Math.min(Math.abs(mid(q) - mid(p)), 12) * 0.25;
    return cost;
  }
  for (let j = 0; j < q.pitches.length; j++) {
    // Compare with the nearest key of the previous step.
    let best = 0;
    for (let i = 1; i < p.pitches.length; i++) if (Math.abs(p.pitches[i]! - q.pitches[j]!) < Math.abs(p.pitches[best]! - q.pitches[j]!)) best = i;
    cost += stepCost(hand, p.pitches[best]!, po[best]!, q.pitches[j]!, qo[j]!, gap);
    // A key still held down keeps its finger busy.
    for (let i = 0; i < p.pitches.length; i++) {
      if (p.ends[i]! > q.start + EPS && po[i] === qo[j]) cost += 50;
    }
  }
  return cost;
}

/** Cost of the stretch inside a chord. */
function inner(hand: Hand, s: Step, o: Option): number {
  let cost = 0;
  for (let i = 0; i < s.pitches.length; i++) {
    cost += ownCost(s.pitches[i]!, o[i]!);
    if (i > 0 && o[i] !== o[i - 1]) cost += 1.5 * reachCost(hand, s.pitches[i - 1]!, o[i - 1]!, s.pitches[i]!, o[i]!);
  }
  return cost;
}

/** What the hand position becomes when a step is played with an option: the new anchor (white-key index) and whether it moved. */
function advance(hand: Hand, anchor: number | null, step: Step, option: Option): { anchor: number; shifted: boolean } {
  const implied = step.pitches.map((midi, i) => ({ finger: option[i]!, anchor: impliedAnchor(midi, option[i]!, hand), midi }));
  if (anchor === null) {
    const lead = [...implied].sort((a, b) => a.finger - b.finger || a.midi - b.midi)[0]!;
    return { anchor: lead.anchor, shifted: false };
  }
  const far = implied.filter((g) => g.anchor !== anchor && !isStretch(g.anchor, anchor, g.finger, hand)).sort((a, b) => a.finger - b.finger || a.midi - b.midi)[0];
  return far ? { anchor: far.anchor, shifted: true } : { anchor, shifted: false };
}

/** Cost of one move of the hand position. */
const SHIFT = 4;

interface State {
  option: number;
  /** The hand position (white-key index of the thumb) after the step; -1 for none yet. */
  anchor: number;
  cost: number;
  /** Index into the previous step's states. */
  from: number;
}

function fingerHand(hand: Hand, notes: readonly FingerNote[], out: Map<string, Finger>): void {
  const steps = stepsOf(notes);
  if (steps.length === 0) return;
  const opts = steps.map((s) => optionsFor(s, hand));
  // Per step, the cheapest way to arrive at each (option, hand position) pair.
  const layers: State[][] = [];
  steps.forEach((s, i) => {
    const found = new Map<string, State>();
    opts[i]!.forEach((o, oi) => {
      const own = inner(hand, s, o);
      if (i === 0) {
        const next = advance(hand, null, s, o);
        found.set(`${oi}:${next.anchor}`, { option: oi, anchor: next.anchor, cost: own, from: -1 });
        return;
      }
      layers[i - 1]!.forEach((prev, pi) => {
        const next = advance(hand, prev.anchor, s, o);
        const cost = prev.cost + transition(hand, steps[i - 1]!, opts[i - 1]![prev.option]!, s, o) + own + (next.shifted ? SHIFT : 0);
        const key = `${oi}:${next.anchor}`;
        const have = found.get(key);
        if (!have || cost < have.cost - EPS) found.set(key, { option: oi, anchor: next.anchor, cost, from: pi });
      });
    });
    layers.push([...found.values()]);
  });
  let at = 0;
  const last = layers[layers.length - 1]!;
  for (let k = 1; k < last.length; k++) if (last[k]!.cost < last[at]!.cost - EPS) at = k;
  for (let i = steps.length - 1; i >= 0; i--) {
    const state = layers[i]![at]!;
    const o = opts[i]![state.option]!;
    steps[i]!.ids.forEach((ids, p) => ids.forEach((id) => out.set(id, o[p]!)));
    at = state.from;
  }
}

/**
 * A finger for every note that has none. Notes that already carry a finger are fixed constraints for their
 * hand and are not in the result.
 */
export function autoFingers(notes: readonly FingerNote[]): Map<string, Finger> {
  const all = new Map<string, Finger>();
  for (const hand of ['right', 'left'] as const) fingerHand(hand, notes.filter((n) => n.hand === hand), all);
  const result = new Map<string, Finger>();
  const authored = new Set(notes.filter((n) => n.finger !== undefined).map((n) => n.id));
  for (const [id, f] of all) if (!authored.has(id)) result.set(id, f);
  return result;
}

const cache = new WeakMap<readonly FingerNote[], Map<string, Finger>>();

/**
 * `autoFingers` for a song's notes, worked out the first time it is asked for and kept for as long as the notes
 * array lives. A song that is already fully fingered costs nothing: the model is not run.
 */
export function autoFingersFor(notes: readonly FingerNote[]): ReadonlyMap<string, Finger> {
  let found = cache.get(notes);
  if (!found) {
    found = notes.every((n) => n.finger !== undefined) ? new Map() : autoFingers(notes);
    cache.set(notes, found);
  }
  return found;
}
