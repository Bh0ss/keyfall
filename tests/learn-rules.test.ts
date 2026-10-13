import { describe, expect, it } from 'vitest';
import { PASS_PROMPTS, passes } from '../src/learn/pass';
import { REVIEW_EXIT_STREAK, noteWeight, recordAnswer, type ReviewEntry } from '../src/learn/review';
import { isSongUnlocked, nextUnit, unitStatus } from '../src/learn/unlocks';
import { UNITS, getUnit, taughtThrough } from '../src/learn/units';

describe('unit pass threshold', () => {
  it('needs 90% over 20 prompts', () => {
    expect(PASS_PROMPTS).toBe(20);
    expect(passes(20, 20)).toBe(true);
    expect(passes(18, 20)).toBe(true);
    expect(passes(17, 20)).toBe(false);
    expect(passes(0, 20)).toBe(false);
  });
  it('does not pass a run shorter than 20 prompts', () => {
    expect(passes(10, 10)).toBe(false);
  });
});

describe('review queue', () => {
  it('a miss enters the queue with a zero streak', () => {
    const e = recordAnswer(undefined, 64, false)!;
    expect(e).toMatchObject({ midi: 64, streak: 0, misses: 1, active: true });
  });
  it('a correct answer for a note not in the queue changes nothing', () => {
    expect(recordAnswer(undefined, 64, true)).toBeUndefined();
  });
  it('leaves the queue only after 3 right answers in a row', () => {
    let e: ReviewEntry | undefined = recordAnswer(undefined, 64, false);
    e = recordAnswer(e, 64, true);
    expect(e).toMatchObject({ streak: 1, active: true });
    e = recordAnswer(e, 64, true);
    expect(e).toMatchObject({ streak: 2, active: true });
    e = recordAnswer(e, 64, true);
    expect(REVIEW_EXIT_STREAK).toBe(3);
    expect(e).toMatchObject({ streak: 0, active: false, misses: 1 });
  });
  it('a miss in the middle resets the streak', () => {
    let e = recordAnswer(undefined, 64, false);
    e = recordAnswer(e, 64, true);
    e = recordAnswer(e, 64, true);
    e = recordAnswer(e, 64, false)!;
    expect(e).toMatchObject({ streak: 0, active: true, misses: 2 });
  });
  it('a note re-enters the queue after it left', () => {
    let e = recordAnswer(undefined, 64, false);
    for (let i = 0; i < 3; i++) e = recordAnswer(e, 64, true);
    e = recordAnswer(e, 64, false);
    expect(e).toMatchObject({ active: true, streak: 0, misses: 2 });
  });
  it('queued notes weigh more, and less as the streak builds; cleared notes weigh nothing extra', () => {
    const base = { midi: 1, misses: 1, active: true };
    expect(noteWeight(undefined)).toBe(0);
    expect(noteWeight({ ...base, streak: 0 })).toBeGreaterThan(noteWeight({ ...base, streak: 1 }));
    expect(noteWeight({ ...base, streak: 1 })).toBeGreaterThan(noteWeight({ ...base, streak: 2 }));
    expect(noteWeight({ ...base, streak: 2 })).toBeGreaterThan(0);
    expect(noteWeight({ ...base, streak: 0, active: false })).toBe(0);
  });
});

describe('unlock rules', () => {
  const none = new Set<string>();
  it('a song with no unit is always open', () => {
    expect(isSongUnlocked({}, none, 'beginner')).toBe(true);
  });
  it('a unit-gated song needs that unit passed', () => {
    expect(isSongUnlocked({ unlockedBy: 'unit-2' }, none, 'beginner')).toBe(false);
    expect(isSongUnlocked({ unlockedBy: 'unit-2' }, new Set(['unit-1']), 'beginner')).toBe(false);
    expect(isSongUnlocked({ unlockedBy: 'unit-2' }, new Set(['unit-2']), 'beginner')).toBe(true);
  });
  it('Advanced profiles have the songs behind units 6 to 9 open', () => {
    for (const n of [6, 7, 8, 9]) {
      expect(isSongUnlocked({ unlockedBy: `unit-${n}` }, none, 'advanced')).toBe(true);
      expect(isSongUnlocked({ unlockedBy: `unit-${n}` }, none, 'beginner')).toBe(false);
    }
  });
  it('the Advanced override does not open songs behind units 2 to 4', () => {
    expect(isSongUnlocked({ unlockedBy: 'unit-2' }, none, 'advanced')).toBe(false);
    expect(isSongUnlocked({ unlockedBy: 'unit-4' }, none, 'advanced')).toBe(false);
  });
  it('an advanced-only song opens for Advanced profiles only', () => {
    expect(isSongUnlocked({ unlockedBy: 'advanced' }, none, 'advanced')).toBe(true);
    expect(isSongUnlocked({ unlockedBy: 'advanced' }, none, 'beginner')).toBe(false);
  });
});

describe('unit path', () => {
  it('defines eleven units, all playable (6 to 10 were "coming soon" before the Learn Units 6 to 10 addition; 11 is "Moving around the keyboard", added in v1.1)', () => {
    expect(UNITS).toHaveLength(11);
    expect(UNITS.every((u) => !u.comingSoon)).toBe(true);
  });
  it('opens units in order', () => {
    expect(unitStatus(getUnit('unit-1')!, new Set())).toBe('open');
    expect(unitStatus(getUnit('unit-2')!, new Set())).toBe('locked');
    expect(unitStatus(getUnit('unit-2')!, new Set(['unit-1']))).toBe('open');
    expect(unitStatus(getUnit('unit-1')!, new Set(['unit-1']))).toBe('passed');
    expect(unitStatus(getUnit('unit-6')!, new Set(['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5']))).toBe('open');
    expect(unitStatus(getUnit('unit-6')!, new Set(['unit-1', 'unit-2', 'unit-3', 'unit-4']))).toBe('locked');
  });
  it('nextUnit is the first unit not yet passed, or null after the last unit', () => {
    expect(nextUnit(new Set())!.id).toBe('unit-1');
    expect(nextUnit(new Set(['unit-1', 'unit-2']))!.id).toBe('unit-3');
    expect(nextUnit(new Set(['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5']))!.id).toBe('unit-6');
    expect(nextUnit(new Set(UNITS.map((u) => u.id)))).toBeNull();
  });
  it('taught notes accumulate across units', () => {
    expect(taughtThrough(2)).toEqual(expect.arrayContaining(getUnit('unit-1')!.notes));
    expect(taughtThrough(1).includes(43)).toBe(false);
    expect(taughtThrough(5)).toContain(43);
  });
});
