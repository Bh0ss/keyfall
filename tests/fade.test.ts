import { describe, expect, it } from 'vitest';
import { applyOutcomes, FADE_STREAK, labelVisible, noteOutcomes } from '../src/engine/fade';

describe('label fade rule', () => {
  it('on always shows, off never shows', () => {
    expect(labelVisible('on', 0)).toBe(true);
    expect(labelVisible('on', 500)).toBe(true);
    expect(labelVisible('off', 0)).toBe(false);
  });

  it('fade hides a label only once the pitch has been hit correctly 10 times in a row', () => {
    expect(FADE_STREAK).toBe(10);
    expect(labelVisible('fade', 0)).toBe(true);
    expect(labelVisible('fade', 9)).toBe(true);
    expect(labelVisible('fade', 10)).toBe(false);
    expect(labelVisible('fade', 11)).toBe(false);
  });

  it('nine hits keep the label, the tenth hides it, and one miss brings it back', () => {
    let stat = applyOutcomes(undefined, Array(9).fill(true));
    expect(stat).toEqual({ streak: 9, hits: 9, misses: 0 });
    expect(labelVisible('fade', stat.streak)).toBe(true);
    stat = applyOutcomes(stat, [true]);
    expect(labelVisible('fade', stat.streak)).toBe(false);
    stat = applyOutcomes(stat, [false]);
    expect(stat).toEqual({ streak: 0, hits: 10, misses: 1 });
    expect(labelVisible('fade', stat.streak)).toBe(true);
  });

  it('a streak carries across attempts and restarts after a miss mid-run', () => {
    const a = applyOutcomes(undefined, [true, true, true, true, true, true]);
    const b = applyOutcomes(a, [true, true, true, true]);
    expect(b.streak).toBe(10);
    expect(applyOutcomes(b, [true, false, true, true]).streak).toBe(2);
  });
});

describe('noteOutcomes', () => {
  const notes = [
    { id: 'c', midi: 64, startBeat: 2 },
    { id: 'a', midi: 60, startBeat: 0 },
    { id: 'b', midi: 62, startBeat: 1 },
    { id: 'd', midi: 65, startBeat: 3 },
  ];
  it('orders by song time, marks hits and misses, and skips notes that were never judged', () => {
    expect(noteOutcomes(notes, { hitNoteIds: ['a', 'c'], missedNoteIds: ['b'] })).toEqual([
      { midi: 60, hit: true },
      { midi: 62, hit: false },
      { midi: 64, hit: true },
    ]);
  });
});
