import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { labelVisible } from '../src/engine/fade';
import { ScoreBoard, type ScoreSummary } from '../src/engine/judge';
import type { Song } from '../src/engine/song';
import { getSong } from '../src/songs/catalog';
import { profileAttempts, saveRun } from '../src/storage/attempts';
import { KeyfallDb } from '../src/storage/db';
import { clearLatency, getLatency, saveLatency, savedLatency } from '../src/storage/latency';
import { migrateLegacyLatency } from '../src/storage/migrate';
import { noteStreaks, recordNoteOutcomes } from '../src/storage/noteStats';
import { createProfile, defaultSettings, listProfiles, ProfileError, saveSettings, updateProfile } from '../src/storage/profiles';
import { bestPerSong, profileScores, recordScore, scoreId, songScores } from '../src/storage/scores';

let n = 0;
let db: KeyfallDb;
beforeEach(() => {
  db = new KeyfallDb(`test-${++n}`);
});

const input = { name: 'Alex', colour: '#F5A524', level: 'beginner' as const };

describe('profiles', () => {
  it('creates profiles with stable ids, timestamps and level-based default settings', async () => {
    const a = await createProfile(db, input, 1000);
    const b = await createProfile(db, { name: 'Sam', colour: '#4DA8FF', level: 'advanced' }, 2000);
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ name: 'Alex', createdAt: 1000, updatedAt: 1000, settings: defaultSettings('beginner') });
    expect(b.settings).toEqual({ labels: 'fade', mode: 'full', speedPct: 70, metronome: false, countIn: true });
    expect(a.settings).toMatchObject({ labels: 'on', mode: 'wait' });
    expect((await listProfiles(db)).map((p) => p.name)).toEqual(['Alex', 'Sam']);
  });

  it('persists across a reopened database', async () => {
    await createProfile(db, input);
    db.close();
    const again = new KeyfallDb(db.name);
    expect((await listProfiles(again)).map((p) => p.name)).toEqual(['Alex']);
    again.close();
  });

  it('trims names and rejects empty, too long and duplicate (case-insensitive) names', async () => {
    expect((await createProfile(db, { ...input, name: '  Alex   B  ' })).name).toBe('Alex B');
    await expect(createProfile(db, { ...input, name: '   ' })).rejects.toThrow(ProfileError);
    await expect(createProfile(db, { ...input, name: 'x'.repeat(25) })).rejects.toThrow(/24/);
    await expect(createProfile(db, { ...input, name: 'alex b' })).rejects.toThrow(/already/);
  });

  it('edits name, colour and level, bumping updatedAt; keeps own name valid', async () => {
    const p = await createProfile(db, input, 1);
    const edited = await updateProfile(db, p.id, { name: 'Alex', colour: '#B78CFF', level: 'advanced' }, 5);
    expect(edited).toMatchObject({ name: 'Alex', colour: '#B78CFF', level: 'advanced', updatedAt: 5, createdAt: 1 });
    expect(edited.settings).toEqual(p.settings);
    const q = await createProfile(db, { ...input, name: 'Sam' });
    await expect(updateProfile(db, q.id, { name: 'ALEX' })).rejects.toThrow(/already/);
    await expect(updateProfile(db, 'missing', { name: 'Z' })).rejects.toThrow(/no longer exists/);
  });

  it('saves settings per profile without touching another', async () => {
    const a = await createProfile(db, input);
    const b = await createProfile(db, { ...input, name: 'Sam' });
    await saveSettings(db, a.id, { mode: 'practice', speedPct: 60, labels: 'fade' });
    const [pa, pb] = await listProfiles(db);
    expect(pa!.settings).toMatchObject({ mode: 'practice', speedPct: 60, labels: 'fade', countIn: true });
    expect(pb!.settings).toEqual(b.settings);
  });
});

describe('high scores keep the maximum', () => {
  const base = { profileId: 'p1', songId: 's1', mode: 'full' as const, speedPct: 100, accuracy: 1, stars: 3, attemptId: 'a1', at: 10 };

  it('stores the first score, raises it, and ignores lower or equal ones', async () => {
    expect((await recordScore(db, { ...base, score: 3000 })).isNewBest).toBe(true);
    const lower = await recordScore(db, { ...base, score: 2000, attemptId: 'a2', at: 20 });
    expect(lower.isNewBest).toBe(false);
    expect(lower.record).toMatchObject({ score: 3000, attemptId: 'a1' });
    expect((await recordScore(db, { ...base, score: 3000, attemptId: 'a3', at: 30 })).isNewBest).toBe(false);
    const higher = await recordScore(db, { ...base, score: 4800, attemptId: 'a4', at: 40 });
    expect(higher).toMatchObject({ isNewBest: true, record: { score: 4800, attemptId: 'a4', achievedAt: 40, updatedAt: 40 } });
    expect(await db.scores.count()).toBe(1);
    expect((await db.scores.get(scoreId('p1', 's1', 'full')))?.score).toBe(4800);
  });

  it('keeps one best per profile, song and mode', async () => {
    await recordScore(db, { ...base, score: 100 });
    await recordScore(db, { ...base, mode: 'wait', score: 2600 });
    await recordScore(db, { ...base, profileId: 'p2', score: 900 });
    await recordScore(db, { ...base, songId: 's2', score: 5 });
    expect(await db.scores.count()).toBe(4);
    expect((await songScores(db, 's1')).map((s) => [s.profileId, s.mode, s.score])).toEqual([
      ['p1', 'wait', 2600],
      ['p2', 'full', 900],
      ['p1', 'full', 100],
    ]);
    const mine = await profileScores(db, 'p1');
    expect(bestPerSong(mine).get('s1')?.score).toBe(2600);
    expect(bestPerSong(mine).get('s2')?.score).toBe(5);
  });
});

describe('note stats and label fade', () => {
  it('builds streaks across attempts and persists them per profile', async () => {
    await recordNoteOutcomes(db, 'p1', Array.from({ length: 6 }, () => ({ midi: 64, hit: true })), 1);
    await recordNoteOutcomes(db, 'p1', [...Array.from({ length: 3 }, () => ({ midi: 64, hit: true })), { midi: 62, hit: false }], 2);
    expect(await noteStreaks(db, 'p1')).toEqual(new Map([[64, 9], [62, 0]]));
    expect(labelVisible('fade', (await noteStreaks(db, 'p1')).get(64) ?? 0)).toBe(true);
    await recordNoteOutcomes(db, 'p1', [{ midi: 64, hit: true }]);
    expect(labelVisible('fade', (await noteStreaks(db, 'p1')).get(64) ?? 0)).toBe(false);
    await recordNoteOutcomes(db, 'p1', [{ midi: 64, hit: false }]);
    expect((await noteStreaks(db, 'p1')).get(64)).toBe(0);
    expect((await noteStreaks(db, 'p2')).size).toBe(0);
    const row = await db.noteStats.get('p1:64');
    expect(row).toMatchObject({ profileId: 'p1', midi: 64, hits: 10, misses: 1 });
  });

  it('does nothing for an empty run', async () => {
    await recordNoteOutcomes(db, 'p1', []);
    expect(await db.noteStats.count()).toBe(0);
  });
});

describe('latency offsets', () => {
  it('stores one offset per device, defaults to 0, clears one device', async () => {
    expect(await getLatency(db, 'FP-30X')).toBe(0);
    expect(await savedLatency(db, 'FP-30X')).toBeNull();
    await saveLatency(db, 'FP-30X', 42.5, 7);
    await saveLatency(db, 'Other', -7);
    expect(await getLatency(db, 'FP-30X')).toBe(42.5);
    expect(await savedLatency(db, 'Other')).toBe(-7);
    expect((await db.latency.get('FP-30X'))?.updatedAt).toBe(7);
    await clearLatency(db, 'FP-30X');
    expect(await savedLatency(db, 'FP-30X')).toBeNull();
    expect(await getLatency(db, 'Other')).toBe(-7);
  });
});

describe('migrating latency from localStorage', () => {
  const store = (initial: Record<string, number>) => {
    const m = new Map<string, string>([['keyfall.latency.v1', JSON.stringify(initial)]]);
    return { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k) };
  };

  it('moves every device once, removes the old key and never runs twice', async () => {
    const s = store({ default: 80, 'FP-30X': 33 });
    expect(await migrateLegacyLatency(db, s, 5)).toBe(2);
    expect(await getLatency(db, 'default')).toBe(80);
    expect(await getLatency(db, 'FP-30X')).toBe(33);
    expect(s.has('keyfall.latency.v1')).toBe(false);
    await saveLatency(db, 'default', 10);
    expect(await migrateLegacyLatency(db, store({ default: 999 }))).toBe(0);
    expect(await getLatency(db, 'default')).toBe(10);
  });

  it('does not overwrite an offset already in Dexie, and tolerates no storage', async () => {
    await saveLatency(db, 'default', 12);
    expect(await migrateLegacyLatency(db, store({ default: 80 }))).toBe(0);
    expect(await getLatency(db, 'default')).toBe(12);
    const other = new KeyfallDb('test-nostorage');
    expect(await migrateLegacyLatency(other, undefined)).toBe(0);
    other.close();
  });
});

describe('saving a finished run', () => {
  const mary = getSong('mary-had-a-little-lamb') as Song;

  /** A summary where the first `hits` notes were hit and the rest missed, all late by 200 ms. */
  function summary(hits: number): ScoreSummary {
    const board = new ScoreBoard(mary.notes.length);
    mary.notes.forEach((nt, i) => {
      if (i < hits) board.hit(nt.id, 'perfect', -20);
      else board.miss({ noteId: nt.id, midi: nt.midi, pressedMidi: nt.midi, measure: nt.measure, kind: 'late', offsetMs: 200 });
    });
    return board.summary();
  }

  it('records the attempt with its miss log, XP, the high score and per-pitch stats', async () => {
    const run = { profileId: 'p1', song: mary, mode: 'full' as const, speedPct: 70, loop: null, wait: null };
    const first = await saveRun(db, { ...run, summary: summary(26), at: 100 });
    expect(first.isNewBest).toBe(true);
    expect(first.attempt).toMatchObject({ profileId: 'p1', songId: mary.id, mode: 'full', speedPct: 100, hits: 26, total: 26, stars: 3, finishedAt: 100, xp: 26 * 4 + 75 });
    expect(first.attempt.score).toBe(4800);
    expect(first.attempt.hitOffsets).toHaveLength(26);

    const worse = await saveRun(db, { ...run, summary: summary(10), at: 200 });
    expect(worse.isNewBest).toBe(false);
    expect(worse.attempt.misses).toHaveLength(16);
    expect(worse.attempt.stars).toBe(0);
    expect((await songScores(db, mary.id))[0]).toMatchObject({ score: 4800, attemptId: first.attempt.id });
    expect((await profileAttempts(db, 'p1')).map((a) => a.finishedAt)).toEqual([100, 200]);
    // E4 is the first note of Mary: hit in both runs' first bars, so it has streak data now.
    expect((await noteStreaks(db, 'p1')).size).toBeGreaterThan(0);
  });

  it('stores Practice speed, ignores speed for other modes, and never sets a high score for a looped run', async () => {
    const base = { profileId: 'p1', song: mary, wait: null, summary: summary(26) };
    const practice = await saveRun(db, { ...base, mode: 'practice', speedPct: 70, loop: null });
    expect(practice.attempt.speedPct).toBe(70);
    const looped = await saveRun(db, { ...base, mode: 'practice', speedPct: 70, loop: { from: 2, to: 3 } });
    expect(looped.isNewBest).toBe(false);
    expect(looped.attempt.loop).toEqual({ from: 2, to: 3 });
    expect(await db.scores.count()).toBe(1);
  });

  it('two profiles both land on the same song board', async () => {
    const run = { song: mary, mode: 'full' as const, speedPct: 100, loop: null, wait: null };
    await saveRun(db, { ...run, profileId: 'alex', summary: summary(26), at: 1 });
    await saveRun(db, { ...run, profileId: 'sam', summary: summary(20), at: 2 });
    const board = await songScores(db, mary.id);
    expect(board.map((s) => s.profileId)).toEqual(['alex', 'sam']);
    expect(board[0]!.score).toBeGreaterThan(board[1]!.score);
  });

  it('keeps wait-mode figures on the attempt', async () => {
    const wait = { wrong: 3, avgTimeToPressMs: 820 };
    const r = await saveRun(db, { profileId: 'p1', song: mary, mode: 'wait', speedPct: 70, loop: null, summary: summary(26), wait });
    expect(r.attempt.wait).toEqual(wait);
    expect(r.attempt.speedPct).toBe(100);
  });
});
