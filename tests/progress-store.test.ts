import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreBoard, type ScoreSummary } from '../src/engine/judge';
import type { Song } from '../src/engine/song';
import { computeProgress } from '../src/progress/compute';
import { loadProgress, trackProgress } from '../src/progress/store';
import { getSong } from '../src/songs/catalog';
import { saveRun } from '../src/storage/attempts';
import { KeyfallDb } from '../src/storage/db';
import { markLessonDone, recordUnitTest } from '../src/storage/learn';
import { createProfile } from '../src/storage/profiles';

let n = 0;
let db: KeyfallDb;
beforeEach(() => {
  db = new KeyfallDb(`progress-${++n}`);
});

const mary = getSong('mary-had-a-little-lamb') as Song;
const lookups = { songLevel: (id: string) => (id === mary.id ? mary.level : undefined), imported: (id: string) => id.startsWith('imp-') };
const DAY = 86_400_000;
const NOON = new Date(2026, 9, 12, 12).getTime();

function summary(hits: number): ScoreSummary {
  const board = new ScoreBoard(mary.notes.length);
  mary.notes.forEach((nt, i) => {
    if (i < hits) board.hit(nt.id, 'perfect', -20);
    else board.miss({ noteId: nt.id, midi: nt.midi, pressedMidi: nt.midi, measure: nt.measure, kind: 'late', offsetMs: 200 });
  });
  return board.summary();
}

const run = (profileId: string, hits: number, at: number) =>
  saveRun(db, { profileId, song: mary, mode: 'full', speedPct: 100, loop: null, wait: null, summary: summary(hits), at }, lookups);

describe('XP, level and streak come from history', () => {
  it('a new profile has level 1, no XP, no streak and no badges', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    const progress = await loadProgress(db, p.id, lookups, NOON);
    expect(progress).toMatchObject({ runXp: 0, learnXp: 0, totalXp: 0, badges: [] });
    expect(progress.level.level).toBe(1);
    expect(progress.streak.current).toBe(0);
  });

  it('run XP is 4 per note hit plus 25 per star and adds across runs; levels follow total XP', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    await run(p.id, 26, NOON);
    await run(p.id, 26, NOON + 1000);
    const progress = await loadProgress(db, p.id, lookups, NOON + 2000);
    expect(progress.runXp).toBe(2 * (26 * 4 + 75));
    expect(progress.totalXp).toBe(358);
    expect(progress.level.level).toBe(3); // 100 for level 2, 300 for level 3
  });

  it('Learn adds 150 XP per passed unit and 20 per finished practice lesson, once each', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    await recordUnitTest(db, p.id, 'unit-1', { correct: 20, total: 20, passed: true }, NOON);
    await markLessonDone(db, p.id, 'unit-1', 'warmup', NOON);
    await markLessonDone(db, p.id, 'unit-1', 'warmup', NOON);
    const progress = await loadProgress(db, p.id, lookups, NOON);
    expect(progress.learnXp).toBe(150 + 20);
    expect(progress.badges).toContain('learn-first-unit');
  });

  it('the daily streak counts consecutive days of songs or Learn and survives until the end of tomorrow', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    await run(p.id, 26, NOON - 2 * DAY);
    await markLessonDone(db, p.id, 'unit-1', 'warmup', NOON - DAY);
    const alive = await loadProgress(db, p.id, lookups, NOON);
    expect(alive.streak).toMatchObject({ current: 2, activeToday: false, atRisk: true });
    await run(p.id, 26, NOON);
    expect((await loadProgress(db, p.id, lookups, NOON)).streak).toMatchObject({ current: 3, activeToday: true, atRisk: false });
    expect((await loadProgress(db, p.id, lookups, NOON + 3 * DAY)).streak.current).toBe(0);
  });

  it('computeProgress is a pure function of the history', () => {
    expect(computeProgress([], [], NOON, lookups)).toMatchObject({ totalXp: 0, badges: [] });
  });
});

describe('saving a run reports what it earned', () => {
  it('first song: Opening Night, Full Marks and Flawless, with the level change; the second run earns nothing new', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    const first = await run(p.id, 26, NOON);
    expect(first.newBadges).toEqual(expect.arrayContaining(['first-song', 'three-stars', 'flawless']));
    expect([first.levelFrom, first.levelTo]).toEqual([1, 2]); // 179 XP
    expect(first.attempt).toMatchObject({ newBadges: first.newBadges, levelFrom: 1, levelTo: 2 });
    expect((await db.attempts.get(first.attempt.id))?.newBadges).toEqual(first.newBadges);

    const second = await run(p.id, 26, NOON + 1000);
    expect(second.newBadges).toEqual([]);
    expect(second.levelFrom).toBe(2);
  });

  it('the profile remembers when each badge was first seen, and never forgets one', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    await run(p.id, 26, NOON);
    const saved = (await db.profiles.get(p.id))!;
    expect(saved.badges?.['first-song']).toBe(NOON);
    await run(p.id, 5, NOON + 5000);
    expect((await db.profiles.get(p.id))!.badges?.['first-song']).toBe(NOON);
  });

  it('a bad run earns Opening Night only, and a run for a profile row that does not exist still saves', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    const r = await run(p.id, 3, NOON);
    expect(r.newBadges).toEqual(['first-song']);
    const orphan = await run('ghost', 26, NOON);
    expect(orphan.attempt.profileId).toBe('ghost');
  });

  it('trackProgress reports a level up from Learn', async () => {
    const p = await createProfile(db, { name: 'Alex', colour: '#F5A524', level: 'beginner' });
    const t = await trackProgress(db, p.id, lookups, () => recordUnitTest(db, p.id, 'unit-1', { correct: 20, total: 20, passed: true }, NOON), NOON);
    expect(t.newBadges).toEqual(['learn-first-unit']);
    expect([t.levelFrom, t.levelTo]).toEqual([1, 2]);
  });
});
