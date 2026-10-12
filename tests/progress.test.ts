import { describe, expect, it } from 'vitest';
import { LESSON_XP, UNIT_PASS_XP, learnXp, levelFor, xpForLevel } from '../src/progress/levels';
import { dayKey, streakFor } from '../src/progress/streak';
import { BADGES, badgeById, earnedBadgeIds } from '../src/progress/badges';
import type { BadgeAttempt, BadgeInput } from '../src/progress/badges';

describe('levels', () => {
  it('xpForLevel follows 50 * n * (n - 1) and clamps below 1', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-4)).toBe(0);
  });

  it('flips level exactly at each threshold and not one below', () => {
    for (let n = 2; n <= 40; n++) {
      expect(levelFor(xpForLevel(n)).level).toBe(n);
      expect(levelFor(xpForLevel(n) - 1).level).toBe(n - 1);
    }
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
  });

  it('is monotonic in level and title is never empty', () => {
    let prev = 0;
    for (let xp = 0; xp < 20000; xp += 37) {
      const info = levelFor(xp);
      expect(info.level).toBeGreaterThanOrEqual(prev);
      expect(info.title.length).toBeGreaterThan(0);
      prev = info.level;
    }
  });

  it('fraction and xpToNext agree with the level span', () => {
    const info = levelFor(450);
    expect(info.level).toBe(3);
    expect(info.levelStartXp).toBe(300);
    expect(info.nextLevelXp).toBe(600);
    expect(info.xpIntoLevel).toBe(150);
    expect(info.xpToNext).toBe(150);
    expect(info.fraction).toBeCloseTo(0.5);
    expect(info.xpIntoLevel + info.xpToNext).toBe(info.nextLevelXp - info.levelStartXp);
    const start = levelFor(300);
    expect(start.fraction).toBe(0);
    expect(levelFor(599).fraction).toBeLessThan(1);
  });

  it('treats negative, NaN and infinite XP sanely', () => {
    expect(levelFor(-50).level).toBe(1);
    expect(levelFor(-50).totalXp).toBe(0);
    expect(levelFor(Number.NaN).totalXp).toBe(0);
    expect(levelFor(Number.NaN).level).toBe(1);
    const big = levelFor(1e12);
    expect(big.level).toBeGreaterThan(1000);
    expect(big.xpIntoLevel).toBeGreaterThanOrEqual(0);
    expect(big.fraction).toBeGreaterThanOrEqual(0);
    expect(big.fraction).toBeLessThan(1);
    expect(Number.isFinite(levelFor(Infinity).level)).toBe(true);
  });

  it('assigns rank titles by band', () => {
    expect(levelFor(xpForLevel(1)).title).toBe(levelFor(xpForLevel(2)).title);
    expect(levelFor(xpForLevel(2)).title).not.toBe(levelFor(xpForLevel(3)).title);
    expect(levelFor(xpForLevel(18)).title).toBe(levelFor(xpForLevel(30)).title);
  });

  it('learnXp sums passes and lessons', () => {
    expect(learnXp([])).toBe(0);
    expect(learnXp([{ passed: false, lessonsDone: [] }])).toBe(0);
    expect(learnXp([{ passed: false, lessonsDone: ['a', 'b'] }])).toBe(2 * LESSON_XP);
    expect(learnXp([
      { passed: true, lessonsDone: ['a', 'b', 'c'] },
      { passed: true, lessonsDone: [] },
      { passed: false, lessonsDone: ['x'] },
    ])).toBe(2 * UNIT_PASS_XP + 4 * LESSON_XP);
    expect(UNIT_PASS_XP).toBe(150);
    expect(LESSON_XP).toBe(20);
  });
});

describe('streak', () => {
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  it('dayKey is the local calendar day', () => {
    expect(dayKey(at(2026, 3, 9, 8))).toBe('2026-03-09');
    expect(dayKey(at(2026, 12, 1, 0, 0))).toBe('2026-12-01');
  });

  it('empty history gives zeros', () => {
    expect(streakFor([], at(2026, 5, 10))).toEqual({ current: 0, longest: 0, activeToday: false, atRisk: false, lastDay: null });
  });

  it('counts consecutive days ending today', () => {
    const now = at(2026, 5, 10);
    const s = streakFor([at(2026, 5, 8), at(2026, 5, 9), at(2026, 5, 10, 9)], now);
    expect(s).toEqual({ current: 3, longest: 3, activeToday: true, atRisk: false, lastDay: '2026-05-10' });
  });

  it('a gap resets the current run but keeps the longest', () => {
    const now = at(2026, 5, 10);
    const s = streakFor([at(2026, 5, 1), at(2026, 5, 2), at(2026, 5, 3), at(2026, 5, 4), at(2026, 5, 9), at(2026, 5, 10)], now);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(4);
  });

  it('yesterday-only keeps the streak alive but at risk', () => {
    const s = streakFor([at(2026, 5, 8), at(2026, 5, 9)], at(2026, 5, 10, 8));
    expect(s).toEqual({ current: 2, longest: 2, activeToday: false, atRisk: true, lastDay: '2026-05-09' });
  });

  it('older than yesterday is zero and not at risk', () => {
    const s = streakFor([at(2026, 5, 7), at(2026, 5, 8)], at(2026, 5, 10));
    expect(s.current).toBe(0);
    expect(s.atRisk).toBe(false);
    expect(s.activeToday).toBe(false);
    expect(s.longest).toBe(2);
  });

  it('handles duplicates and unsorted input', () => {
    const now = at(2026, 5, 10);
    const s = streakFor([at(2026, 5, 10, 20), at(2026, 5, 8), at(2026, 5, 10, 1), at(2026, 5, 9), at(2026, 5, 8, 23)], now);
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it('ignores future timestamps without crashing', () => {
    const now = at(2026, 5, 10);
    const s = streakFor([at(2026, 5, 9), at(2026, 5, 11), at(2026, 5, 12), at(2030, 1, 1)], now);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.atRisk).toBe(true);
    expect(s.lastDay).toBe('2026-05-09');
    expect(streakFor([at(2026, 5, 11)], now)).toEqual({ current: 0, longest: 0, activeToday: false, atRisk: false, lastDay: null });
  });

  it('counts across the spring-forward boundary', () => {
    const days = [7, 8, 9, 10].map((d) => at(2026, 3, d));
    const s = streakFor(days, at(2026, 3, 10, 23));
    expect(s.current).toBe(4);
    expect(s.longest).toBe(4);
  });

  it('counts across the fall-back boundary', () => {
    const days = [
      at(2026, 10, 31), at(2026, 11, 1), at(2026, 11, 2), at(2026, 11, 3),
    ];
    const s = streakFor(days, at(2026, 11, 3, 23, 30));
    expect(s.current).toBe(4);
    expect(s.longest).toBe(4);
  });

  it('treats 23:59 and 00:01 as different days', () => {
    const late = at(2026, 5, 9, 23, 59);
    const early = at(2026, 5, 10, 0, 1);
    expect(dayKey(late)).not.toBe(dayKey(early));
    const s = streakFor([late, early], early + 60000);
    expect(s.current).toBe(2);
    expect(s.activeToday).toBe(true);
  });
});

const attempt = (over: Partial<BadgeAttempt> = {}): BadgeAttempt => ({
  songId: 's1',
  stars: 1,
  accuracy: 0.5,
  hits: 10,
  total: 20,
  longestStreak: 3,
  mode: 'full',
  loop: null,
  ...over,
});

const input = (over: Partial<BadgeInput> = {}): BadgeInput => ({
  attempts: [],
  learn: [],
  longestStreakDays: 0,
  level: 1,
  songLevel: () => undefined,
  imported: () => false,
  ...over,
});

const earned = (id: string, over: Partial<BadgeInput> = {}) => earnedBadgeIds(input(over)).includes(id);
const units = (n: number, passedCount: number) =>
  Array.from({ length: n }, (_, i) => ({ unitId: `unit-${i + 1}`, passed: i < passedCount }));

describe('badges', () => {
  it('has unique kebab-case ids with names and blurbs', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BADGES.length).toBeGreaterThanOrEqual(16);
    for (const b of BADGES) {
      expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(b.name.trim().length).toBeGreaterThan(0);
      expect(b.blurb.trim().length).toBeGreaterThan(0);
      expect(['play', 'learn', 'streak', 'level']).toContain(b.group);
      expect(badgeById(b.id)).toBe(b);
    }
    expect(badgeById('nope')).toBeUndefined();
  });

  it('earns nothing from an empty slate', () => {
    expect(earnedBadgeIds(input())).toEqual([]);
  });

  it('first-song: any finished song, wait mode included, loops excluded', () => {
    expect(earned('first-song', { attempts: [attempt({ loop: { from: 1, to: 2 } })] })).toBe(false);
    expect(earned('first-song', { attempts: [attempt()] })).toBe(true);
    expect(earned('first-song', { attempts: [attempt({ mode: 'wait' })] })).toBe(true);
  });

  it('three-stars at exactly 3 stars', () => {
    expect(earned('three-stars', { attempts: [attempt({ stars: 2 })] })).toBe(false);
    expect(earned('three-stars', { attempts: [attempt({ stars: 3 })] })).toBe(true);
    expect(earned('three-stars', { attempts: [attempt({ stars: 3, loop: { from: 1, to: 1 } })] })).toBe(false);
  });

  it('flawless needs accuracy 1 and total >= 8', () => {
    expect(earned('flawless', { attempts: [attempt({ accuracy: 0.99, total: 20 })] })).toBe(false);
    expect(earned('flawless', { attempts: [attempt({ accuracy: 1, total: 7 })] })).toBe(false);
    expect(earned('flawless', { attempts: [attempt({ accuracy: 1, total: 8 })] })).toBe(true);
    expect(earned('flawless', { attempts: [attempt({ accuracy: 1, total: 8, loop: { from: 1, to: 2 } })] })).toBe(false);
  });

  it('hot-streak at 30', () => {
    expect(earned('hot-streak', { attempts: [attempt({ longestStreak: 29 })] })).toBe(false);
    expect(earned('hot-streak', { attempts: [attempt({ longestStreak: 30 })] })).toBe(true);
    expect(earned('hot-streak', { attempts: [attempt({ longestStreak: 30, loop: { from: 1, to: 1 } })] })).toBe(false);
  });

  it('repertoire at 10 different finished songs', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => attempt({ songId: `song-${i}` }));
    expect(earned('repertoire', { attempts: many(9) })).toBe(false);
    expect(earned('repertoire', { attempts: [...many(9), attempt({ songId: 'song-0' })] })).toBe(false);
    expect(earned('repertoire', { attempts: many(10) })).toBe(true);
    expect(earned('repertoire', { attempts: [...many(9), attempt({ songId: 'x', loop: { from: 1, to: 2 } })] })).toBe(false);
  });

  it('expert-finisher needs a finished expert-mode run', () => {
    expect(earned('expert-finisher', { attempts: [attempt({ mode: 'full' })] })).toBe(false);
    expect(earned('expert-finisher', { attempts: [attempt({ mode: 'expert' })] })).toBe(true);
    expect(earned('expert-finisher', { attempts: [attempt({ mode: 'expert', loop: { from: 1, to: 2 } })] })).toBe(false);
  });

  it('tough-piece needs a finished song of level 5 or expert', () => {
    const lv = (l: 1 | 2 | 3 | 4 | 5 | 'expert') => ({ songLevel: () => l });
    expect(earned('tough-piece', { attempts: [attempt()], ...lv(4) })).toBe(false);
    expect(earned('tough-piece', { attempts: [attempt()], ...lv(5) })).toBe(true);
    expect(earned('tough-piece', { attempts: [attempt()], ...lv('expert') })).toBe(true);
    expect(earned('tough-piece', { attempts: [attempt({ loop: { from: 1, to: 2 } })], ...lv(5) })).toBe(false);
    expect(earned('tough-piece', { attempts: [attempt()] })).toBe(false);
  });

  it('own-music needs a finished imported song', () => {
    expect(earned('own-music', { attempts: [attempt()] })).toBe(false);
    expect(earned('own-music', { attempts: [attempt()], imported: (id) => id === 's1' })).toBe(true);
    expect(earned('own-music', { attempts: [attempt({ loop: { from: 1, to: 2 } })], imported: () => true })).toBe(false);
  });

  it('star-collector sums best stars per song to 30', () => {
    const songs = (n: number, stars: number) => Array.from({ length: n }, (_, i) => attempt({ songId: `s${i}`, stars }));
    expect(earned('star-collector', { attempts: songs(9, 3) })).toBe(false);
    expect(earned('star-collector', { attempts: songs(10, 3) })).toBe(true);
    expect(earned('star-collector', { attempts: [...songs(9, 3), attempt({ songId: 'x', stars: 2 })] })).toBe(false);
    expect(earned('star-collector', { attempts: [...songs(9, 3), attempt({ songId: 'x', stars: 3 })] })).toBe(true);
    expect(earned('star-collector', { attempts: [...songs(15, 1), ...songs(15, 2)] })).toBe(true);
    const repeats = Array.from({ length: 40 }, () => attempt({ songId: 'same', stars: 3 }));
    expect(earned('star-collector', { attempts: repeats })).toBe(false);
    const looped = Array.from({ length: 12 }, (_, i) => attempt({ songId: `l${i}`, stars: 3, loop: { from: 1, to: 2 } }));
    expect(earned('star-collector', { attempts: looped })).toBe(false);
  });

  it('learn badges follow passed units', () => {
    expect(earned('learn-first-unit', { learn: units(10, 0) })).toBe(false);
    expect(earned('learn-first-unit', { learn: units(10, 1) })).toBe(true);
    expect(earned('learn-half', { learn: units(10, 4) })).toBe(false);
    expect(earned('learn-half', { learn: units(10, 5) })).toBe(true);
    expect(earned('learn-graduate', { learn: units(10, 9) })).toBe(false);
    expect(earned('learn-graduate', { learn: units(10, 10) })).toBe(true);
    const missingFive = units(10, 10).filter((u) => u.unitId !== 'unit-5');
    expect(earned('learn-graduate', { learn: missingFive })).toBe(false);
  });

  it('streak badges at 3, 7 and 30 days', () => {
    for (const [id, n] of [['streak-3', 3], ['streak-7', 7], ['streak-30', 30]] as const) {
      expect(earned(id, { longestStreakDays: n - 1 })).toBe(false);
      expect(earned(id, { longestStreakDays: n })).toBe(true);
    }
  });

  it('level badges at 5 and 10', () => {
    for (const [id, n] of [['level-5', 5], ['level-10', 10]] as const) {
      expect(earned(id, { level: n - 1 })).toBe(false);
      expect(earned(id, { level: n })).toBe(true);
    }
  });

  it('returns earned ids in BADGES order', () => {
    const ids = earnedBadgeIds(input({ attempts: [attempt({ stars: 3 })], longestStreakDays: 7, level: 5 }));
    const order = ids.map((id) => BADGES.findIndex((b) => b.id === id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(ids).toEqual(expect.arrayContaining(['first-song', 'three-stars', 'streak-3', 'streak-7', 'level-5']));
  });
});