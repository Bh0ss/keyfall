import { describe, expect, it } from 'vitest';
import { clearLatency, deviceKey, getLatency, hasLatency, medianOffset, saveLatency } from '../src/engine/latency';

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

describe('per-device storage', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('stores one offset per device and defaults to 0', () => {
    const s = mem();
    expect(getLatency('FP-30X', s)).toBe(0);
    expect(hasLatency('FP-30X', s)).toBe(false);
    saveLatency('FP-30X', 42.5, s);
    saveLatency('Other', -7, s);
    expect(getLatency('FP-30X', s)).toBe(42.5);
    expect(getLatency('Other', s)).toBe(-7);
    clearLatency('FP-30X', s);
    expect(hasLatency('FP-30X', s)).toBe(false);
    expect(getLatency('Other', s)).toBe(-7);
  });
  it('survives corrupt storage', () => {
    expect(getLatency('x', { getItem: () => '{nope' })).toBe(0);
  });
  it('names the default device', () => {
    expect(deviceKey(null)).toBe('default');
    expect(deviceKey('FP-30X')).toBe('FP-30X');
  });
});
