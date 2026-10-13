/** XP, levels and rank titles. Pure functions; no storage or UI. */

import { INTRO_ID } from '../learn/explainers';

export const UNIT_PASS_XP = 150;
export const LESSON_XP = 20;

/** Cumulative XP needed to reach `level` (level 1 costs nothing). */
export function xpForLevel(level: number): number {
  const n = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return 50 * n * (n - 1);
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNext: number;
  /** Progress through the current level, 0..1 (never reaches 1). */
  fraction: number;
  title: string;
}

const TITLES: ReadonlyArray<readonly [minLevel: number, title: string]> = [
  [18, 'Maestro'],
  [12, 'Virtuoso'],
  [8, 'Performer'],
  [5, 'Player'],
  [3, 'Student'],
  [1, 'Newcomer'],
];

function titleFor(level: number): string {
  return TITLES.find(([min]) => level >= min)![1];
}

export function levelFor(totalXp: number): LevelInfo {
  const xp = Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(Math.min(totalXp, Number.MAX_SAFE_INTEGER / 4)) : 0;
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  while (xpForLevel(level) > xp) level--;
  while (xpForLevel(level + 1) <= xp) level++;
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const xpIntoLevel = xp - levelStartXp;
  return {
    level,
    totalXp: xp,
    levelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNext: nextLevelXp - xp,
    fraction: xpIntoLevel / (nextLevelXp - levelStartXp),
    title: titleFor(level),
  };
}

/** XP earned in the Learn path: a flat award per passed unit plus one per finished lesson. */
export function learnXp(rows: ReadonlyArray<{ passed: boolean; lessonsDone: readonly string[] }>): number {
  let xp = 0;
  for (const r of rows) xp += (r.passed ? UNIT_PASS_XP : 0) + r.lessonsDone.filter((id) => id !== INTRO_ID).length * LESSON_XP;
  return xp;
}