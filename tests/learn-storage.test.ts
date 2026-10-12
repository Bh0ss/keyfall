import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyfallDb } from '../src/storage/db';
import { listProgress, loadReviewQueue, markLessonDone, passedUnits, recordUnitTest, saveReviewEntries } from '../src/storage/learn';

let db: KeyfallDb;
let n = 0;
beforeEach(() => {
  db = new KeyfallDb(`learn-${n++}`);
});

describe('learn progress', () => {
  it('a failed test does not pass the unit but counts the attempt', async () => {
    const r = await recordUnitTest(db, 'p1', 'unit-1', { correct: 15, total: 20, passed: false }, 100);
    expect(r).toMatchObject({ passed: false, attempts: 1, bestCorrect: 15, bestTotal: 20, passedAt: null });
    expect((await passedUnits(db, 'p1')).size).toBe(0);
  });
  it('a pass is permanent and keeps its time; a later worse run does not undo it or the best', async () => {
    await recordUnitTest(db, 'p1', 'unit-1', { correct: 19, total: 20, passed: true }, 100);
    const r = await recordUnitTest(db, 'p1', 'unit-1', { correct: 10, total: 20, passed: false }, 200);
    expect(r).toMatchObject({ passed: true, passedAt: 100, bestCorrect: 19, attempts: 2, updatedAt: 200 });
  });
  it('progress is per profile and rows carry a stable id and updatedAt', async () => {
    await recordUnitTest(db, 'p1', 'unit-1', { correct: 20, total: 20, passed: true }, 100);
    expect([...(await passedUnits(db, 'p2'))]).toEqual([]);
    const [row] = await listProgress(db, 'p1');
    expect(row).toMatchObject({ id: 'p1:unit-1', updatedAt: 100 });
  });
  it('marks a lesson done once', async () => {
    await markLessonDone(db, 'p1', 'unit-2', 'song', 5);
    await markLessonDone(db, 'p1', 'unit-2', 'song', 6);
    expect((await listProgress(db, 'p1'))[0]!.lessonsDone).toEqual(['song']);
  });
});

describe('review queue storage', () => {
  it('round-trips entries per profile and keeps cleared notes as inactive rows', async () => {
    await saveReviewEntries(db, 'p1', [{ midi: 62, streak: 1, misses: 2, active: true }], 10);
    await saveReviewEntries(db, 'p1', [{ midi: 62, streak: 0, misses: 2, active: false }], 20);
    await saveReviewEntries(db, 'p2', [{ midi: 64, streak: 0, misses: 1, active: true }], 30);
    expect([...(await loadReviewQueue(db, 'p1')).values()]).toEqual([{ midi: 62, streak: 0, misses: 2, active: false }]);
    expect((await db.reviewQueue.get('p1:62'))!.updatedAt).toBe(20);
    expect((await loadReviewQueue(db, 'p2')).has(64)).toBe(true);
  });
});
