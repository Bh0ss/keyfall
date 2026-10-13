import { describe, expect, it } from 'vitest';
import { generateLeftHand, LH_PATTERNS, type LhInput } from '../src/arrange/lh';
import type { ChordSegment } from '../src/arrange/types';

const seg = (startBeat: number, endBeat: number, root: number, quality: ChordSegment['quality'] = 'maj'): ChordSegment => ({ startBeat, endBeat, root, quality });
const input = (over: Partial<LhInput> = {}): LhInput => ({
  chords: [seg(0, 4, 0), seg(4, 6, 7), seg(6, 8, 9, 'min'), seg(8, 12, 5)],
  grid: { barBeats: 4, timeSignature: [4, 4] },
  bars: 3,
  version: 'beginner',
  energy: [0, 0.5, 1],
  ...over,
});

describe('left hand generator: structural guarantee', () => {
  it('its input type has no field for notes, and a notes field is a type error', () => {
    // @ts-expect-error the input carries chords, the grid and per-bar energy only
    const bad: LhInput = { ...input(), notes: [{ midi: 60, startSec: 0, durationSec: 1, amplitude: 1 }] };
    expect(bad).toBeDefined();
  });

  it('the output is a function of chords, grid and energy only: smuggling notes in changes nothing', () => {
    const plain = generateLeftHand(input({ version: 'full' }));
    const smuggled = generateLeftHand({ ...input({ version: 'full' }), notes: [{ midi: 60 }] } as LhInput);
    expect(smuggled).toEqual(plain);
  });

  it('every note it writes belongs to the left hand', () => {
    expect(generateLeftHand(input()).every((n) => n.hand === 'left')).toBe(true);
  });
});

describe('beginner left hand', () => {
  it('holds the root per chord (plus the fifth when the chord lasts half a bar or more), restruck at each bar line', () => {
    const notes = generateLeftHand(input());
    const at = (b: number) => notes.filter((n) => n.startBeat === b).map((n) => n.midi).sort((a, c) => a - c);
    expect(at(0)).toEqual([36, 43]); // C2 + G2, a whole bar
    expect(at(4)).toEqual([43, 50]); // G2 + D3, two beats = half a bar
    expect(at(6)).toEqual([45, 52]); // A2 + E3
    expect(at(8)).toEqual([41, 48]); // F2 + C3
    expect(notes.find((n) => n.startBeat === 0)!.durationBeats).toBe(4);
  });

  it('a chord shorter than half a bar gets the root alone', () => {
    const notes = generateLeftHand(input({ chords: [seg(0, 1, 0), seg(1, 4, 7)], bars: 1, energy: [0] }));
    expect(notes.filter((n) => n.startBeat === 0).map((n) => n.midi)).toEqual([36]);
  });

  it('a chord that crosses a bar line is restruck in the next bar', () => {
    const notes = generateLeftHand(input({ chords: [seg(0, 8, 0)], bars: 2, energy: [0, 0] }));
    expect(notes.filter((n) => n.midi === 36).map((n) => [n.startBeat, n.durationBeats])).toEqual([[0, 4], [4, 4]]);
  });

  it('stays in C2 to F#3 (36-54)', () => {
    for (let root = 0; root < 12; root++) {
      const notes = generateLeftHand(input({ chords: [seg(0, 12, root)], energy: [0, 0, 0] }));
      expect(Math.min(...notes.map((n) => n.midi))).toBeGreaterThanOrEqual(36);
      expect(Math.max(...notes.map((n) => n.midi))).toBeLessThanOrEqual(54);
    }
  });
});

describe('full left hand', () => {
  const full = (over: Partial<LhInput> = {}) => input({ version: 'full', ...over });

  it('is busier when the section is busier', () => {
    const notes = generateLeftHand(full({ chords: [seg(0, 12, 0)], energy: [0, 0.5, 1] }));
    const perBar = [0, 1, 2].map((b) => notes.filter((n) => n.startBeat >= b * 4 && n.startBeat < b * 4 + 4).length);
    expect(perBar[0]!).toBeLessThan(perBar[1]!);
    expect(perBar[1]!).toBeLessThan(perBar[2]! + 1);
    expect(perBar[2]!).toBeGreaterThan(perBar[0]!);
  });

  it('is monophonic, fills each chord with no overlap, and stays in C2 to E4 (36-64)', () => {
    for (const quality of ['maj', 'min', 'dim', 'sus2', 'sus4'] as const) {
      for (let root = 0; root < 12; root++) {
        const notes = generateLeftHand(full({ chords: [seg(0, 12, root, quality)], energy: [0.1, 0.5, 0.9] })).sort((a, b) => a.startBeat - b.startBeat);
        notes.slice(1).forEach((n, i) => expect(n.startBeat).toBeGreaterThanOrEqual(notes[i]!.startBeat + notes[i]!.durationBeats - 1e-9));
        expect(notes.at(-1)!.startBeat + notes.at(-1)!.durationBeats).toBeCloseTo(12, 9);
        expect(Math.min(...notes.map((n) => n.midi))).toBeGreaterThanOrEqual(36);
        expect(Math.max(...notes.map((n) => n.midi))).toBeLessThanOrEqual(64);
      }
    }
  });

  it('every pattern note is on the 8th grid and every pattern has its own name', () => {
    const all = Object.values(LH_PATTERNS).flatMap((family) => family.flat());
    for (const p of all) for (const [off] of p.events) expect((off * 2) % 1).toBe(0);
    const names = all.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses a waltz family in 3/4 and fills the bar', () => {
    const notes = generateLeftHand(full({ grid: { barBeats: 3, timeSignature: [3, 4] }, chords: [seg(0, 6, 9, 'min')], bars: 2, energy: [0.2, 0.6] }));
    expect(notes.filter((n) => n.startBeat < 3).reduce((a, n) => a + n.durationBeats, 0)).toBe(3);
  });

  it('is deterministic', () => {
    expect(generateLeftHand(full())).toEqual(generateLeftHand(full()));
  });

  it('the same chord gets different patterns in different bars (seeded variety) without any randomness', () => {
    const notes = generateLeftHand(full({ chords: [seg(0, 16, 0)], bars: 4, energy: [0.5, 0.5, 0.5, 0.5] }));
    const shape = (b: number) => notes.filter((n) => n.startBeat >= b * 4 && n.startBeat < b * 4 + 4).map((n) => `${n.startBeat - b * 4}:${n.midi}`).join(',');
    expect(new Set([0, 1, 2, 3].map(shape)).size).toBeGreaterThan(1);
  });
});
