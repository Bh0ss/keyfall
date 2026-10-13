import type { Hand, SongNote } from './song';

/**
 * Hand-position analysis. A hand sits over five white keys (a "position"); its anchor is the key under the
 * thumb. From each note's pitch and finger the anchor that note implies is worked out; when the next
 * fingered note cannot be played from the current position, the hand has to move: that is a shift. A note
 * can be played from the position when its finger implies the same anchor, or when it is a one-key stretch
 * past the zone by the edge finger (the pinky one key above a right-hand zone, the thumb one key below it;
 * mirrored for the left hand). Any other mismatch, even one key, is a shift. Notes without a finger are ignored, so a different fingering source (see `FingerOf`) can
 * be swapped in later.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;

/** The part of a note the analysis reads. A `SongNote` fits. */
export type PositionNote = Pick<SongNote, 'id' | 'midi' | 'startBeat' | 'durationBeats' | 'hand' | 'measure'> & { finger?: Finger };

/** Where a fingering comes from. The default reads the finger stored on the note. */
export type FingerOf = (note: PositionNote) => Finger | undefined;

export const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;

/** Semitones from the thumb to each finger in a major five-finger position, used to place a black key. */
const OFFSETS = [0, 2, 4, 5, 7] as const;
const PC_INDEX = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const;
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Position on the keyboard counted in white keys from C-1: whole numbers for white keys, x.5 for black keys. */
function whiteIndex(midi: number): number {
  return Math.floor(midi / 12) * 7 + PC_INDEX[midi % 12]!;
}

/** MIDI number of the white key at a whole white-key index. */
function whiteMidi(index: number): number {
  return Math.floor(index / 7) * 12 + WHITE_PCS[((index % 7) + 7) % 7]!;
}

export interface Zone {
  hand: Hand;
  /** The key under the thumb (MIDI). */
  anchor: number;
  /** Lowest and highest of the five white keys (MIDI). */
  lo: number;
  hi: number;
}

function zoneFor(hand: Hand, anchorIndex: number): Zone {
  const lo = hand === 'right' ? anchorIndex : anchorIndex - 4;
  return { hand, anchor: whiteMidi(anchorIndex), lo: whiteMidi(lo), hi: whiteMidi(lo + 4) };
}

/** The white-key index of the thumb that this note and finger imply. */
export function impliedAnchor(midi: number, finger: Finger, hand: Hand): number {
  const index = whiteIndex(midi);
  const step = finger - 1;
  if (Number.isInteger(index)) return hand === 'right' ? index - step : index + step;
  // A black key has no white-key step; pick the white thumb key whose distance best matches a typical position.
  let best = 0;
  let bestErr = Infinity;
  const base = Math.floor(index);
  for (let i = base - 6; i <= base + 6; i++) {
    const w = whiteMidi(i);
    const err = Math.abs((hand === 'right' ? midi - w : w - midi) - OFFSETS[step]!);
    // Ties go to the lower key for the right hand and the higher key for the left.
    if (err < bestErr || (err === bestErr && hand === 'left')) {
      best = i;
      bestErr = err;
    }
  }
  return best;
}

/** Whether a note one white key outside the zone is reached by the edge finger stretching, so the hand stays put. */
export function isStretch(implied: number, anchor: number, finger: Finger, hand: Hand): boolean {
  const delta = implied - anchor;
  // Right hand: the pinky reaches up past the zone (implied anchor +1), the thumb reaches down (-1). Left hand mirrors.
  if (finger === 5) return delta === (hand === 'right' ? 1 : -1);
  if (finger === 1) return delta === (hand === 'right' ? -1 : 1);
  return false;
}

export interface Shift {
  /** Order in the song, across both hands. */
  index: number;
  id: string;
  hand: Hand;
  /** Beat and bar of the first note of the new position. */
  beat: number;
  measure: number;
  fromAnchor: number;
  toAnchor: number;
  /** Which way the hand travels along the keyboard. */
  direction: 'left' | 'right';
  /** The first note of the new position and its finger. */
  note: PositionNote;
  finger: Finger;
  /** For example "thumb → G". */
  label: string;
  fromZone: Zone;
  toZone: Zone;
}

export interface PositionSpan {
  hand: Hand;
  zone: Zone;
  /** The hand is in this position from this beat (the first span starts at -Infinity) until the next span begins. */
  fromBeat: number;
}

export interface PositionMap {
  shifts: Shift[];
  spans: PositionSpan[];
  /** The anchor (MIDI) of the position each fingered note is played in. */
  anchorOf: Map<string, number>;
  /** Whether any note had a finger. */
  hasFingering: boolean;
}

const EPS = 1e-6;

const pitchClass = (midi: number) => PC_NAMES[midi % 12]!;

/** Find every hand-position shift in a song's notes. */
export function analysePositions(notes: readonly PositionNote[], fingerOf: FingerOf = (n) => n.finger): PositionMap {
  const shifts: Shift[] = [];
  const spans: PositionSpan[] = [];
  const anchorOf = new Map<string, number>();
  let hasFingering = false;

  for (const hand of ['right', 'left'] as const) {
    const fingered: { note: PositionNote; finger: Finger }[] = [];
    for (const note of notes) {
      if (note.hand !== hand) continue;
      const finger = fingerOf(note);
      if (finger !== undefined) fingered.push({ note, finger });
    }
    if (fingered.length === 0) continue;
    hasFingering = true;
    fingered.sort((a, b) => a.note.startBeat - b.note.startBeat || a.note.midi - b.note.midi);

    let anchor: number | null = null;
    for (let i = 0; i < fingered.length; ) {
      // A chord is one group: the hand moves once for it.
      let j = i + 1;
      while (j < fingered.length && Math.abs(fingered[j]!.note.startBeat - fingered[i]!.note.startBeat) < EPS) j++;
      const group = fingered.slice(i, j);
      i = j;

      const implied = group.map((g) => ({ ...g, anchor: impliedAnchor(g.note.midi, g.finger, hand) }));
      const lead = [...implied].sort((a, b) => a.finger - b.finger || a.note.midi - b.note.midi)[0]!;
      if (anchor === null) {
        anchor = lead.anchor;
        spans.push({ hand, zone: zoneFor(hand, anchor), fromBeat: -Infinity });
      } else {
        const far = implied.filter((g) => g.anchor !== anchor! && !isStretch(g.anchor, anchor!, g.finger, hand)).sort((a, b) => a.finger - b.finger || a.note.midi - b.note.midi)[0];
        if (far) {
          const fromZone = zoneFor(hand, anchor);
          const toZone = zoneFor(hand, far.anchor);
          shifts.push({
            index: 0,
            id: `${hand}:${far.note.id}`,
            hand,
            beat: far.note.startBeat,
            measure: far.note.measure,
            fromAnchor: fromZone.anchor,
            toAnchor: toZone.anchor,
            direction: toZone.anchor > fromZone.anchor ? 'right' : 'left',
            note: far.note,
            finger: far.finger,
            label: `${FINGER_NAMES[far.finger - 1]} → ${pitchClass(far.note.midi)}`,
            fromZone,
            toZone,
          });
          anchor = far.anchor;
          spans.push({ hand, zone: toZone, fromBeat: far.note.startBeat });
        }
      }
      for (const g of implied) anchorOf.set(g.note.id, whiteMidi(anchor));
    }
  }

  shifts.sort((a, b) => a.beat - b.beat || (a.hand === b.hand ? 0 : a.hand === 'right' ? -1 : 1));
  shifts.forEach((s, k) => (s.index = k));
  return { shifts, spans, anchorOf, hasFingering };
}

export interface HandZones {
  /** The position the hand is in now (before its first note: the opening position). */
  current: Zone | null;
  /** The position it moves to, only when that move is within the look-ahead window. */
  next: Zone | null;
}

/** The zones to shade at a beat for each hand. */
export function zonesAt(map: PositionMap, beat: number, windowBeats: number): Record<Hand, HandZones> {
  const out: Record<Hand, HandZones> = { right: { current: null, next: null }, left: { current: null, next: null } };
  for (const hand of ['right', 'left'] as const) {
    const spans = map.spans.filter((s) => s.hand === hand);
    let at = -1;
    spans.forEach((s, k) => {
      if (s.fromBeat <= beat + EPS) at = k;
    });
    if (at < 0) continue;
    out[hand].current = spans[at]!.zone;
    const next = spans[at + 1];
    if (next && next.fromBeat - beat <= windowBeats + EPS) out[hand].next = next.zone;
  }
  return out;
}

/**
 * The shift whose cue is showing: the first one, inside the playable range, that opens `windowBeats` (about a
 * bar) before its note and is not done yet. `isDone` says the player has played, or passed, the shift note.
 */
export function activeShift(
  shifts: readonly Shift[],
  beat: number,
  windowBeats: number,
  isDone: (shift: Shift) => boolean,
  range: { from: number; to: number } = { from: -Infinity, to: Infinity },
): Shift | null {
  for (const s of shifts) {
    if (s.beat < range.from - EPS || s.beat >= range.to - EPS) continue;
    if (s.beat - windowBeats > beat + EPS) continue;
    if (!isDone(s)) return s;
  }
  return null;
}

/** The beats a shift drill loops: two notes before the shift note to the end of two notes after it, in that hand. */
export function drillRange(shift: Shift, notes: readonly PositionNote[]): { startBeat: number; endBeat: number } {
  const hand = notes
    .filter((n) => n.hand === shift.hand)
    .sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const at = Math.max(0, hand.findIndex((n) => n.id === shift.note.id));
  const first = hand[Math.max(0, at - 2)]!;
  const last = hand[Math.min(hand.length - 1, at + 2)]!;
  return { startBeat: first.startBeat, endBeat: last.startBeat + last.durationBeats };
}
