import { describe, expect, it } from 'vitest';
import {
  accuracyTrend,
  averageOffset,
  measureMisses,
  missSummary,
  mostMissedNotes,
  offsetHistogram,
  points,
  practiceRange,
  pressOffsets,
  rankBoard,
  stars,
  timingNote,
  upNext,
  worstMeasures,
  xpFor,
} from '../src/engine/results';

const miss = (measure: number, midi = 60, kind: 'early' | 'late' | 'wrong-key' = 'late', offsetMs: number | null = null) => ({ measure, midi, kind, offsetMs });

describe('error report aggregations', () => {
  const misses = [miss(12, 65), miss(12, 65), miss(15, 65), miss(15, 62, 'wrong-key'), miss(16, 62)];

  it('ranks most-missed notes by count, then pitch', () => {
    expect(mostMissedNotes(misses)).toEqual([
      { midi: 65, count: 3 },
      { midi: 62, count: 2 },
    ]);
    expect(mostMissedNotes([miss(1, 64), miss(1, 60)])).toEqual([
      { midi: 60, count: 1 },
      { midi: 64, count: 1 },
    ]);
    expect(mostMissedNotes(misses, 1)).toHaveLength(1);
    expect(mostMissedNotes([])).toEqual([]);
  });

  it('counts misses per bar and ranks the worst bars', () => {
    const per = measureMisses(misses, 16);
    expect(per).toHaveLength(16);
    expect([per[11], per[14], per[15], per[0]]).toEqual([2, 2, 1, 0]);
    expect(worstMeasures(misses, 16)).toEqual([12, 15, 16]);
    expect(worstMeasures(misses, 16, 2)).toEqual([12, 15]);
    expect(worstMeasures([], 16)).toEqual([]);
  });

  it('ignores misses outside the song', () => {
    expect(measureMisses([miss(0), miss(99)], 8).every((n) => n === 0)).toBe(true);
  });

  it('describes where it went wrong', () => {
    expect(missSummary(misses, 16)).toBe('Bars 12, 15 and 16 hold 5 of your 5 misses. 1 was the wrong key.');
    expect(missSummary([miss(3), miss(3, 60, 'wrong-key'), miss(3, 60, 'wrong-key'), miss(7)], 8)).toBe('Bars 3 and 7 hold 4 of your 4 misses. 2 were the wrong key.');
    expect(missSummary([miss(2)], 8)).toBe('Bar 2 holds 1 of your 1 miss.');
    expect(missSummary([], 8)).toBe('A clean run. Nothing to fix.');
  });
});

describe('Practice my mistakes range', () => {
  it('is null for a clean run', () => {
    expect(practiceRange([], 8)).toBeNull();
  });
  it('is the single bar when only one bar was missed', () => {
    expect(practiceRange([miss(5), miss(5)], 8)).toEqual({ from: 5, to: 5 });
  });
  it('covers neighbouring missed bars and trims unmissed edges', () => {
    expect(practiceRange([miss(3), miss(4), miss(4)], 8)).toEqual({ from: 3, to: 4 });
    expect(practiceRange([miss(2), miss(4)], 8)).toEqual({ from: 2, to: 4 });
  });
  it('takes the densest window of at most 4 bars when misses are spread out', () => {
    // bars 1, 2 are lightly missed; bars 10 and 12 hold more
    const m = [miss(1), miss(2), miss(10), miss(10), miss(12), miss(12)];
    expect(practiceRange(m, 16)).toEqual({ from: 10, to: 12 });
    expect(practiceRange([miss(1), miss(10), miss(10), miss(10)], 16, 2)).toEqual({ from: 10, to: 10 });
  });
  it('prefers the earlier window on a tie and never runs past the last bar', () => {
    expect(practiceRange([miss(1), miss(8)], 8)).toEqual({ from: 1, to: 1 });
    expect(practiceRange([miss(8), miss(8)], 8)).toEqual({ from: 8, to: 8 });
  });
});

describe('timing aggregations', () => {
  it('combines hit offsets with early/late misses and skips unplayed notes', () => {
    expect(pressOffsets([-10, 20], [miss(1, 60, 'late', 180), miss(1, 60, 'wrong-key', null), miss(2, 60, 'late', null)])).toEqual([-10, 20, 180]);
  });
  it('averages offsets (negative = early) and is null with none', () => {
    expect(averageOffset([-30, -26, -28])).toBe(-28);
    expect(averageOffset([])).toBeNull();
  });
  it('words the coaching note: early, late, on the beat', () => {
    expect(timingNote(-28)).toBe('You tend to play a little early: about 28 ms ahead of the beat.');
    expect(timingNote(41.4)).toBe('You tend to play a little late: about 41 ms behind the beat.');
    expect(timingNote(7.9)).toBe('Your timing is right on the beat.');
    expect(timingNote(-8)).toContain('early');
    expect(timingNote(null)).toBe('No timed notes to measure.');
  });
  it('buckets offsets into 25 ms bins across +/-150 and clamps outliers into the end bins', () => {
    const bins = offsetHistogram([-150, -149.9, -1, 0, 24.9, 25, 149.9, 150, 400, -400]);
    expect(bins).toHaveLength(12);
    expect(bins[0]).toEqual({ from: -150, to: -125, count: 3 });
    expect(bins[5]!.count).toBe(1);
    expect(bins[6]!.count).toBe(2);
    expect(bins[7]!.count).toBe(1);
    expect(bins[11]!.count).toBe(3);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(10);
  });
});

describe('board, trend, XP and Home helpers', () => {
  const s = (profileId: string, score: number, achievedAt = 1) => ({ profileId, score, mode: 'full', speedPct: 100, stars: 2, achievedAt });

  it('ranks the board highest first; an earlier achiever wins a tie', () => {
    const board = rankBoard([s('a', 4800, 5), s('b', 3360), s('c', 4800, 2)]);
    expect(board.map((r) => [r.rank, r.profileId])).toEqual([
      [1, 'c'],
      [2, 'a'],
      [3, 'b'],
    ]);
    expect(rankBoard([s('a', 1), s('b', 2), s('c', 3)], 2)).toHaveLength(2);
  });

  it('trend is the last n accuracies, oldest first', () => {
    const attempts = [3, 1, 2, 4].map((t) => ({ finishedAt: t, accuracy: t / 10 }));
    expect(accuracyTrend(attempts)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(accuracyTrend(attempts, 2)).toEqual([0.3, 0.4]);
  });

  it('placeholder XP is 4 per note hit plus 25 per star', () => {
    expect(xpFor(26, 3)).toBe(26 * 4 + 75);
    expect(xpFor(0, 0)).toBe(0);
  });

  it('suggests the song just played while it has stars to win, else the first unfinished, else the first', () => {
    const ids = ['mary', 'twinkle', 'ode'];
    expect(upNext(ids, new Map())).toBe('mary');
    expect(upNext(ids, new Map([['mary', 3]]))).toBe('twinkle');
    expect(upNext(ids, new Map([['mary', 3], ['twinkle', 2]]), 'twinkle')).toBe('twinkle');
    expect(upNext(ids, new Map([['mary', 3], ['twinkle', 3]]), 'twinkle')).toBe('ode');
    expect(upNext(ids, new Map(ids.map((i) => [i, 3] as const)), 'twinkle')).toBe('twinkle');
    expect(upNext(ids, new Map(ids.map((i) => [i, 3] as const)))).toBe('mary');
  });

  it('formats stars and points', () => {
    expect(stars(2)).toBe('★★☆');
    expect(stars(0)).toBe('☆☆☆');
    expect(points(14960)).toBe('14,960');
  });
});
