import { describe, expect, it } from 'vitest';
import { getSong } from '../src/songs/catalog';
import { buildLayout, keyRangeFor } from '../src/ui/highwayLayout';

describe('keyRangeFor', () => {
  it('centres a one-octave song in a C-to-C range of 15 white keys, like the Play canvas', () => {
    const mary = getSong('mary-had-a-little-lamb')!;
    expect(keyRangeFor(mary.notes.map((n) => n.midi))).toEqual({ lo: 48, hi: 72 });
  });

  it('widens to whole octaves for wide songs and clamps to the 88 keys', () => {
    const r = keyRangeFor([30, 100]);
    expect(r.lo % 12).toBe(0);
    expect(r.lo).toBeLessThanOrEqual(30);
    expect(r.hi).toBeGreaterThanOrEqual(100);
    expect(r.lo).toBeGreaterThanOrEqual(21);
    expect(r.hi).toBeLessThanOrEqual(108);
  });

  it('falls back to the middle of the piano for an empty song', () => {
    expect(keyRangeFor([])).toEqual({ lo: 48, hi: 72 });
  });
});

describe('buildLayout', () => {
  const l = buildLayout({ lo: 48, hi: 72 });

  it('has 15 equal white lanes covering 0..1', () => {
    expect(l.whites).toHaveLength(15);
    expect(l.laneOf(48)).toEqual({ x: 0, w: 1 / 15 });
    expect(l.laneOf(60).x).toBeCloseTo(7 / 15);
    expect(l.laneOf(72).x).toBeCloseTo(14 / 15);
  });

  it('puts a black key centred on the boundary between its neighbours, narrower than a lane', () => {
    const cs = l.laneOf(61);
    expect(cs.x + cs.w / 2).toBeCloseTo(8 / 15);
    expect(cs.w).toBeLessThan(1 / 15);
    expect(l.blacks.map((b) => b.midi)).toContain(61);
  });

  it('knows whether a pitch is on the keyboard', () => {
    expect(l.has(60)).toBe(true);
    expect(l.has(47)).toBe(false);
  });
});
