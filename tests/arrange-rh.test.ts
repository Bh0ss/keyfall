import { describe, expect, it } from 'vitest';
import { chordPcs } from '../src/arrange/chords';
import { simplifyMelody } from '../src/arrange/rh';
import type { ChordSegment, MelodyNote } from '../src/arrange/types';

const m = (midi: number, startBeat: number, durationBeats: number): MelodyNote => ({ midi, startBeat, durationBeats });
const chords: ChordSegment[] = [{ startBeat: 0, endBeat: 8, root: 0, quality: 'maj' }, { startBeat: 8, endBeat: 16, root: 7, quality: 'maj' }];

describe('right hand: beginner', () => {
  it('folds the melody into C4-G5 (60-79) by octaves, keeping the pitch class', () => {
    const out = simplifyMelody([m(88, 0, 1), m(55, 1, 1), m(84, 2, 1), m(64, 3, 1)], chords, 'beginner');
    expect(out.every((n) => n.midi >= 60 && n.midi <= 79 && n.hand === 'right')).toBe(true);
    expect(out.map((n) => n.midi % 12)).toEqual([88 % 12, 55 % 12, 84 % 12, 64 % 12]);
  });

  it('folds a near-octave leap toward the previous note (accompaniment bleed) but keeps a real leap of a sixth', () => {
    expect(simplifyMelody([m(64, 0, 1), m(75, 1, 1)], chords, 'beginner').map((n) => n.midi)).toEqual([64, 63]);
    expect(simplifyMelody([m(62, 0, 1), m(71, 1, 1)], chords, 'beginner').map((n) => n.midi)).toEqual([62, 71]);
  });

  it('is monophonic with nothing under the melody', () => {
    const out = simplifyMelody([m(64, 0, 2), m(65, 2, 2)], chords, 'beginner');
    expect(out).toHaveLength(2);
  });

  it('drops notes shorter than an 8th and never overlaps', () => {
    const out = simplifyMelody([m(64, 0, 0.25), m(65, 0.5, 2), m(67, 2.5, 0.5)], chords, 'beginner');
    expect(out.map((n) => n.midi)).toEqual([65, 67]);
    out.slice(1).forEach((n, i) => expect(n.startBeat).toBeGreaterThanOrEqual(out[i]!.startBeat + out[i]!.durationBeats - 1e-9));
  });
});

describe('right hand: full', () => {
  it('adds a chord tone a third to a sixth below on notes of a beat or more, two on notes of two beats or more', () => {
    const out = simplifyMelody([m(72, 0, 0.5), m(72, 1, 1), m(72, 4, 2)], chords, 'full');
    const at = (b: number) => out.filter((n) => n.startBeat === b).map((n) => n.midi).sort((a, c) => c - a);
    expect(at(0)).toEqual([72]);
    expect(at(1)).toHaveLength(2);
    expect(at(4)).toHaveLength(3);
    for (const b of [1, 4]) {
      const [top, ...below] = at(b);
      expect(top).toBe(72);
      expect(72 - below[0]!).toBeGreaterThanOrEqual(3);
      expect(72 - below[0]!).toBeLessThanOrEqual(9);
      below.forEach((x) => expect(chordPcs(chords[0]!)).toContain(x % 12));
      expect(72 - below.at(-1)!).toBeLessThanOrEqual(10);
    }
  });

  it('folds the top line into C4-C6 and keeps the added tones in the right hand (G3 and up)', () => {
    const out = simplifyMelody([m(90, 0, 2), m(58, 2, 2)], chords, 'full');
    expect(Math.max(...out.map((n) => n.midi))).toBeLessThanOrEqual(84);
    expect(Math.min(...out.map((n) => n.midi))).toBeGreaterThanOrEqual(55);
  });

  it('every added note shares the melody note start and length', () => {
    const out = simplifyMelody([m(76, 8, 2)], chords, 'full');
    expect(out.every((n) => n.startBeat === 8 && n.durationBeats === 2)).toBe(true);
  });
});

describe('right hand: not a copy', () => {
  it('never has more top-line notes than the melody, and empty in means empty out', () => {
    expect(simplifyMelody([], chords, 'full')).toEqual([]);
  });
});
