import { describe, expect, it } from 'vitest';
import { BPM_RANGE, clampBpm, doubleBpm, halveBpm, tapBpm } from '../src/audioImport/tempo';

describe('tapBpm', () => {
  it('needs two taps', () => {
    expect(tapBpm([])).toBeNull();
    expect(tapBpm([1000])).toBeNull();
  });
  it('reads 500 ms between taps as 120 bpm', () => {
    expect(tapBpm([0, 500, 1000, 1500])).toBe(120);
  });
  it('uses the median gap so one stray tap does not move it', () => {
    expect(tapBpm([0, 500, 1000, 1700, 2200, 2700])).toBe(120);
  });
  it('forgets taps before a pause of more than 2.5 s', () => {
    expect(tapBpm([0, 1000, 2000, 10000, 10600, 11200])).toBe(100);
  });
  it('looks only at the last eight taps', () => {
    const slow = [0, 1000, 2000, 3000, 4000];
    const fast = Array.from({ length: 8 }, (_, i) => 4500 + i * 500);
    expect(tapBpm([...slow, ...fast])).toBe(120);
  });
  it('clamps to the supported range', () => {
    expect(tapBpm([0, 100, 200])).toBe(BPM_RANGE[1]);
    expect(tapBpm([0, 2400])).toBe(BPM_RANGE[0]);
  });
});

describe('half, double and clamp', () => {
  it('halves and doubles to whole numbers, inside the range', () => {
    expect(halveBpm(150)).toBe(75);
    expect(halveBpm(121)).toBe(61);
    expect(doubleBpm(70)).toBe(140);
    expect(doubleBpm(200)).toBe(BPM_RANGE[1]);
    expect(halveBpm(40)).toBe(BPM_RANGE[0]);
  });
  it('clampBpm rounds and bounds', () => {
    expect(clampBpm(99.6)).toBe(100);
    expect(clampBpm(0)).toBe(BPM_RANGE[0]);
    expect(clampBpm(Number.NaN)).toBeNull();
  });
});
