import type { AttemptRecord, LearnProgressRecord } from '../storage/types';
import { earnedBadgeIds, type BadgeInput } from './badges';
import { learnXp, levelFor, type LevelInfo } from './levels';
import { streakFor, type StreakInfo } from './streak';

/** How the badge rules look up facts about a song id. */
export interface SongLookups {
  songLevel: BadgeInput['songLevel'];
  imported: BadgeInput['imported'];
}

export interface ProfileProgress {
  /** XP from finished songs (the sum of the attempts' XP). */
  runXp: number;
  /** XP from Learn: units passed and practice lessons finished. */
  learnXp: number;
  totalXp: number;
  level: LevelInfo;
  streak: StreakInfo;
  /** Badge ids earned so far, in catalog order. */
  badges: string[];
}

/**
 * Everything the XP bar, level, streak and badges show, worked out from the profile's history (attempts and
 * Learn progress). Nothing here is stored, so it cannot drift between devices: the same history gives the same answer.
 */
export function computeProgress(
  attempts: readonly AttemptRecord[],
  learn: readonly LearnProgressRecord[],
  nowMs: number,
  lookups: SongLookups,
): ProfileProgress {
  const runXp = attempts.reduce((n, a) => n + a.xp, 0);
  const fromLearn = learnXp(learn);
  const totalXp = runXp + fromLearn;
  const level = levelFor(totalXp);
  const activity = [...attempts.map((a) => a.finishedAt), ...learn.flatMap((r) => (r.passedAt === null ? [r.updatedAt] : [r.passedAt, r.updatedAt]))];
  const streak = streakFor(activity, nowMs);
  const badges = earnedBadgeIds({ attempts, learn, longestStreakDays: streak.longest, level: level.level, ...lookups });
  return { runXp, learnXp: fromLearn, totalXp, level, streak, badges };
}
