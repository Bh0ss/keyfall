import { chordPcs } from './chords';
import type { ArrangedNote, ChordSegment, MelodyNote, Version } from './types';

/** Beginner melody range, C4 to G5: a five-finger hand plus a small reach. */
export const BEGINNER_RANGE: [number, number] = [60, 79];
/** Full melody range, C4 to C6. */
export const FULL_RANGE: [number, number] = [60, 84];
/** Added chord tones stay at G3 or above, so they belong to the right hand. */
const LOW_LIMIT = 55;
/** A chord tone this far below the melody is a third to a sixth; the second tone must stay within a tenth-less span. */
const NEAR = 3;
const FAR = 9;
const SPAN = 10;
/** Added tones: from a beat, one; from two beats, two. */
const ONE_TONE_FROM = 1;
const TWO_TONES_FROM = 2;
/** A leap of 10 to 14 semitones is probably the accompaniment's octave bleeding in: fold it toward the previous note. */
const BLEED = [10, 14] as const;
/** Shorter than an 8th is dropped. */
const MIN_BEATS = 0.5 - 1e-6;

function fold(midi: number, [lo, hi]: [number, number], prev: number | undefined): number {
  const options: number[] = [];
  for (let m = midi % 12; m <= 127; m += 12) if (m >= lo && m <= hi) options.push(m);
  const inRange = midi >= lo && midi <= hi;
  const target = prev ?? midi;
  if (inRange) {
    if (prev === undefined) return midi;
    const d = Math.abs(midi - prev);
    if (d < BLEED[0] || d > BLEED[1]) return midi;
  }
  return options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) ? o : best), options[0]!);
}

/**
 * The right hand: the extracted melody folded into a comfortable range (octave bleed pulled toward the previous
 * note), notes shorter than an 8th dropped, and in the full version one or two chord tones added below the long notes.
 * It is a simplification of the melody, never the transcription itself.
 */
export function simplifyMelody(melody: MelodyNote[], chords: ChordSegment[], version: Version): ArrangedNote[] {
  const range = version === 'beginner' ? BEGINNER_RANGE : FULL_RANGE;
  const out: ArrangedNote[] = [];
  let prev: number | undefined;
  for (const n of melody) {
    if (n.durationBeats < MIN_BEATS) continue;
    const midi = fold(n.midi, range, prev);
    prev = midi;
    out.push({ midi, startBeat: n.startBeat, durationBeats: n.durationBeats, hand: 'right' });
    if (version !== 'full' || n.durationBeats < ONE_TONE_FROM) continue;
    const chord = chords.find((c) => n.startBeat >= c.startBeat && n.startBeat < c.endBeat);
    if (!chord) continue;
    const pcs = chordPcs(chord);
    const below = (ceiling: number, floor: number) => {
      for (let p = ceiling; p >= floor; p--) if (pcs.includes(p % 12)) return p;
      return undefined;
    };
    const first = below(midi - NEAR, Math.max(midi - FAR, LOW_LIMIT));
    if (first === undefined) continue;
    out.push({ midi: first, startBeat: n.startBeat, durationBeats: n.durationBeats, hand: 'right' });
    if (n.durationBeats < TWO_TONES_FROM) continue;
    const second = below(first - NEAR, Math.max(midi - SPAN, LOW_LIMIT));
    if (second !== undefined) out.push({ midi: second, startBeat: n.startBeat, durationBeats: n.durationBeats, hand: 'right' });
  }
  return out;
}
