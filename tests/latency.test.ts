import { describe, expect, it } from 'vitest';
import { deviceKey, medianOffset, readLegacyLatency } from '../src/engine/latency';

const clicks = Array.from({ length: 8 }, (_, i) => 1000 + i * 750);

describe('medianOffset', () => {
  it('returns the median tap-minus-click offset', () => {
    const taps = clicks.map((c, i) => c + [20, 40, 30, 90, 35, 25, 28, 32][i]!);
    expect(medianOffset(clicks, taps)).toEqual({ offsetMs: 31, matched: 8 });
  });
  it('resists an outlier tap', () => {
    const taps = clicks.map((c, i) => c + (i === 3 ? 300 : 50));
    expect(medianOffset(clicks, taps)?.offsetMs).toBe(50);
  });
  it('handles early taps (negative offset)', () => {
    expect(medianOffset(clicks, clicks.map((c) => c - 15))?.offsetMs).toBe(-15);
  });
  it('uses each click once and ignores taps far from any click', () => {
    const r = medianOffset(clicks, [...clicks.map((c) => c + 10), 1000 + 375 + 8 * 750]);
    expect(r).toEqual({ offsetMs: 10, matched: 8 });
  });
  it('refuses to guess from too few taps', () => {
    expect(medianOffset(clicks, clicks.slice(0, 3).map((c) => c + 10))).toBeNull();
    expect(medianOffset(clicks, [])).toBeNull();
  });
});

// Phase 3 moved the per-device store from localStorage to Dexie (tests/storage.test.ts covers
// get / save / clear / default and the one-time migration). What stays here is parsing the old store.
describe('legacy localStorage store', () => {
  const mem = (raw: string | null) => ({ getItem: () => raw });
  it('reads one offset per device', () => {
    expect(readLegacyLatency(mem(JSON.stringify({ 'FP-30X': 42.5, Other: -7 })))).toEqual({ 'FP-30X': 42.5, Other: -7 });
  });
  it('is empty when nothing was stored', () => {
    expect(readLegacyLatency(mem(null))).toEqual({});
    expect(readLegacyLatency(undefined)).toEqual({});
  });
  it('survives corrupt storage and drops non-numeric entries', () => {
    expect(readLegacyLatency(mem('{nope'))).toEqual({});
    expect(readLegacyLatency(mem(JSON.stringify({ a: 'x', b: 5, c: null })))).toEqual({ b: 5 });
    expect(readLegacyLatency(mem('42'))).toEqual({});
  });
  it('names the default device', () => {
    expect(deviceKey(null)).toBe('default');
    expect(deviceKey('FP-30X')).toBe('FP-30X');
  });
});
