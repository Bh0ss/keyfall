import type { ReviewEntry } from '../learn/review';
import type { KeyfallDb } from './db';
import type { LearnProgressRecord, ReviewRecord } from './types';

const progressId = (profileId: string, unitId: string) => `${profileId}:${unitId}`;
const reviewId = (profileId: string, midi: number) => `${profileId}:${midi}`;

export async function listProgress(db: KeyfallDb, profileId: string): Promise<LearnProgressRecord[]> {
  return db.learnProgress.where('profileId').equals(profileId).toArray();
}

/** Unit ids a profile has passed. */
export async function passedUnits(db: KeyfallDb, profileId: string): Promise<Set<string>> {
  return new Set((await listProgress(db, profileId)).filter((p) => p.passed).map((p) => p.unitId));
}

function blank(profileId: string, unitId: string, now: number): LearnProgressRecord {
  return { id: progressId(profileId, unitId), profileId, unitId, passed: false, passedAt: null, bestCorrect: 0, bestTotal: 0, attempts: 0, lessonsDone: [], updatedAt: now };
}

/** Record a unit-test run. A pass is permanent; the best result is the highest accuracy. */
export async function recordUnitTest(
  db: KeyfallDb,
  profileId: string,
  unitId: string,
  run: { correct: number; total: number; passed: boolean },
  now = Date.now(),
): Promise<LearnProgressRecord> {
  return db.transaction('rw', db.learnProgress, async () => {
    const cur = (await db.learnProgress.get(progressId(profileId, unitId))) ?? blank(profileId, unitId, now);
    const better = cur.bestTotal === 0 || run.correct * cur.bestTotal > cur.bestCorrect * run.total;
    const next: LearnProgressRecord = {
      ...cur,
      attempts: cur.attempts + 1,
      bestCorrect: better ? run.correct : cur.bestCorrect,
      bestTotal: better ? run.total : cur.bestTotal,
      passed: cur.passed || run.passed,
      passedAt: cur.passed ? cur.passedAt : run.passed ? now : null,
      updatedAt: now,
    };
    await db.learnProgress.put(next);
    return next;
  });
}

/** Mark a practice lesson (warm-up, rhythm tap, mini song) finished. */
export async function markLessonDone(db: KeyfallDb, profileId: string, unitId: string, lessonId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.learnProgress, async () => {
    const cur = (await db.learnProgress.get(progressId(profileId, unitId))) ?? blank(profileId, unitId, now);
    if (cur.lessonsDone.includes(lessonId)) return;
    await db.learnProgress.put({ ...cur, lessonsDone: [...cur.lessonsDone, lessonId], updatedAt: now });
  });
}

/** The profile's review queue as the pure learn code sees it (cleared notes included, inactive). */
export async function loadReviewQueue(db: KeyfallDb, profileId: string): Promise<Map<number, ReviewEntry>> {
  const rows = await db.reviewQueue.where('profileId').equals(profileId).toArray();
  return new Map(rows.map((r) => [r.midi, { midi: r.midi, streak: r.streak, misses: r.misses, active: r.active }]));
}

export async function saveReviewEntries(db: KeyfallDb, profileId: string, entries: ReviewEntry[], now = Date.now()): Promise<void> {
  if (!entries.length) return;
  const rows: ReviewRecord[] = entries.map((e) => ({ id: reviewId(profileId, e.midi), profileId, ...e, updatedAt: now }));
  await db.reviewQueue.bulkPut(rows);
}
