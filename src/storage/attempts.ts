import { noteOutcomes } from '../engine/fade';
import type { Mode, ScoreSummary } from '../engine/judge';
import { xpFor } from '../engine/results';
import type { Song } from '../engine/song';
import type { KeyfallDb } from './db';
import { newId } from './db';
import { recordNoteOutcomes } from './noteStats';
import { recordScore } from './scores';
import type { AttemptRecord, WaitFigures } from './types';

export interface FinishedRun {
  profileId: string;
  song: Song;
  mode: Mode;
  speedPct: number;
  loop: { from: number; to: number } | null;
  summary: ScoreSummary;
  wait: WaitFigures | null;
  at?: number;
}

export interface SavedRun {
  attempt: AttemptRecord;
  isNewBest: boolean;
}

/**
 * Save a finished run: the attempt with its miss log, the profile's high score
 * (full runs only, max rule) and the per-pitch hit stats behind label fade.
 */
export async function saveRun(db: KeyfallDb, run: FinishedRun): Promise<SavedRun> {
  const at = run.at ?? Date.now();
  const s = run.summary;
  const attempt: AttemptRecord = {
    id: newId(),
    profileId: run.profileId,
    songId: run.song.id,
    mode: run.mode,
    speedPct: run.mode === 'practice' ? run.speedPct : 100,
    loop: run.loop,
    score: s.score,
    accuracy: s.accuracy,
    stars: s.stars,
    hits: s.hits,
    total: s.total,
    longestStreak: s.longestStreak,
    grades: s.grades,
    misses: s.misses,
    hitOffsets: s.hitOffsets,
    wait: run.wait,
    xp: xpFor(s.hits, s.stars),
    finishedAt: at,
    updatedAt: at,
  };
  await db.attempts.add(attempt);
  await recordNoteOutcomes(db, run.profileId, noteOutcomes(run.song.notes, s), at);
  let isNewBest = false;
  if (!run.loop) {
    isNewBest = (
      await recordScore(db, {
        profileId: run.profileId,
        songId: run.song.id,
        mode: run.mode,
        speedPct: attempt.speedPct,
        score: s.score,
        accuracy: s.accuracy,
        stars: s.stars,
        attemptId: attempt.id,
        at,
      })
    ).isNewBest;
  }
  return { attempt, isNewBest };
}

export async function getAttempt(db: KeyfallDb, id: string): Promise<AttemptRecord | undefined> {
  return db.attempts.get(id);
}

export async function profileAttempts(db: KeyfallDb, profileId: string): Promise<AttemptRecord[]> {
  return (await db.attempts.where('profileId').equals(profileId).toArray()).sort((a, b) => a.finishedAt - b.finishedAt);
}
