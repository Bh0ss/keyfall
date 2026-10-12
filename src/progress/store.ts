import type { KeyfallDb } from '../storage/db';
import { listProgress } from '../storage/learn';
import type { Profile } from '../storage/types';
import { computeProgress, type ProfileProgress, type SongLookups } from './compute';

export async function loadProgress(db: KeyfallDb, profileId: string, lookups: SongLookups, nowMs = Date.now()): Promise<ProfileProgress> {
  const [attempts, learn] = await Promise.all([db.attempts.where('profileId').equals(profileId).toArray(), listProgress(db, profileId)]);
  return computeProgress(attempts, learn, nowMs, lookups);
}

export interface ProgressChange {
  newBadges: string[];
  levelFrom: number;
  levelTo: number;
  after: ProfileProgress;
}

/**
 * Run `write` (which saves an attempt or Learn progress), then work out what it earned: the badges that were not
 * earned before and the level change. Earned badges are remembered on the profile with the time they were
 * first seen, so the badge shelf can show when.
 */
export async function trackProgress<T>(
  db: KeyfallDb,
  profileId: string,
  lookups: SongLookups,
  write: () => Promise<T>,
  at = Date.now(),
): Promise<{ result: T } & ProgressChange> {
  const before = await loadProgress(db, profileId, lookups, at);
  const result = await write();
  const after = await loadProgress(db, profileId, lookups, at);
  const newBadges = after.badges.filter((b) => !before.badges.includes(b));
  await rememberBadges(db, profileId, after.badges, at);
  return { result, newBadges, levelFrom: before.level.level, levelTo: after.level.level, after };
}

/** Stamp any earned badge the profile does not carry yet (first seen now). */
async function rememberBadges(db: KeyfallDb, profileId: string, earned: readonly string[], at: number): Promise<void> {
  await db.transaction('rw', db.profiles, async () => {
    const cur = await db.profiles.get(profileId);
    if (!cur) return;
    const have = cur.badges ?? {};
    const missing = earned.filter((b) => !(b in have));
    if (missing.length === 0) return;
    const next: Profile = { ...cur, badges: { ...have, ...Object.fromEntries(missing.map((b) => [b, at])) }, updatedAt: Math.max(at, cur.updatedAt) };
    await db.profiles.put(next);
  });
}
