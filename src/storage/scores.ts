import type { Mode } from '../engine/judge';
import type { KeyfallDb } from './db';
import type { ScoreRecord } from './types';

export function scoreId(profileId: string, songId: string, mode: Mode): string {
  return `${profileId}:${songId}:${mode}`;
}

export interface ScoreInput {
  profileId: string;
  songId: string;
  mode: Mode;
  speedPct: number;
  score: number;
  accuracy: number;
  stars: number;
  attemptId: string;
  at: number;
}

/**
 * High-score rule: keep the maximum. A lower or equal score never replaces the
 * stored one (the first to reach a score keeps the credit). Returns whether the
 * stored record changed, and the record now held.
 */
export async function recordScore(db: KeyfallDb, input: ScoreInput): Promise<{ isNewBest: boolean; record: ScoreRecord }> {
  const id = scoreId(input.profileId, input.songId, input.mode);
  return db.transaction('rw', db.scores, async () => {
    const cur = await db.scores.get(id);
    if (cur && cur.score >= input.score) return { isNewBest: false, record: cur };
    const record: ScoreRecord = {
      id,
      profileId: input.profileId,
      songId: input.songId,
      mode: input.mode,
      speedPct: input.speedPct,
      score: input.score,
      accuracy: input.accuracy,
      stars: input.stars,
      attemptId: input.attemptId,
      achievedAt: input.at,
      updatedAt: input.at,
    };
    await db.scores.put(record);
    return { isNewBest: true, record };
  });
}

/** Every profile's best scores on a song, highest first. */
export async function songScores(db: KeyfallDb, songId: string): Promise<ScoreRecord[]> {
  return (await db.scores.where('songId').equals(songId).toArray()).sort((a, b) => b.score - a.score || a.achievedAt - b.achievedAt);
}

export async function profileScores(db: KeyfallDb, profileId: string): Promise<ScoreRecord[]> {
  return db.scores.where('profileId').equals(profileId).toArray();
}

/** A profile's best score and stars on each song (best across modes). */
export function bestPerSong(scores: ScoreRecord[]): Map<string, ScoreRecord> {
  const best = new Map<string, ScoreRecord>();
  for (const s of scores) {
    const cur = best.get(s.songId);
    if (!cur || s.score > cur.score) best.set(s.songId, s);
  }
  return best;
}
