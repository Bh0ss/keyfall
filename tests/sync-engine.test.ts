import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { analyseFile } from '../src/import/analyse';
import { saveNewImport } from '../src/import/save';
import { saveRun } from '../src/storage/attempts';
import { KeyfallDb } from '../src/storage/db';
import { createProfile, listProfiles, saveSettings } from '../src/storage/profiles';
import { profileScores, recordScore } from '../src/storage/scores';
import { allImportedSongs, deleteImportedSong } from '../src/storage/songs';
import { syncOnce } from '../src/sync/engine';
import { musicXml } from './fixtures/generate';
import { FakeRemote } from './sync-fake-remote';
import { getSong } from '../src/songs/catalog';
import { ScoreBoard } from '../src/engine/judge';

let n = 0;
let remote: FakeRemote;
let a: KeyfallDb;
let b: KeyfallDb;
const UID = 'user-1';
beforeEach(() => {
  n++;
  remote = new FakeRemote();
  a = new KeyfallDb(`sync-a-${n}`);
  b = new KeyfallDb(`sync-b-${n}`);
});

const input = { name: 'Alex', colour: '#F5A524', level: 'beginner' as const };
const sync = (db: KeyfallDb, uid = UID) => syncOnce(db, remote, uid);
const score = (profileId: string, s: number, at: number) => ({ profileId, songId: 'song', mode: 'full' as const, speedPct: 100, score: s, accuracy: 1, stars: 3, attemptId: `att-${s}`, at });

describe('sync engine: last write wins', () => {
  it('copies a profile to a second device', async () => {
    const p = await createProfile(a, input, 1000);
    await sync(a);
    await sync(b);
    expect(await listProfiles(b)).toEqual([p]);
  });

  it('the later edit wins on both devices', async () => {
    const p = await createProfile(a, input, 1000);
    await sync(a);
    await sync(b);
    await saveSettings(a, p.id, { speedPct: 60 }, 2000);
    await saveSettings(b, p.id, { speedPct: 90 }, 3000);
    await sync(a);
    await sync(b);
    await sync(a);
    expect((await listProfiles(a))[0]!.settings.speedPct).toBe(90);
    expect((await listProfiles(b))[0]!.settings.speedPct).toBe(90);
  });

  it('a late push of an older edit does not overwrite the newer remote row', async () => {
    const p = await createProfile(a, input, 1000);
    await sync(a);
    await sync(b);
    await saveSettings(b, p.id, { speedPct: 90 }, 3000);
    await saveSettings(a, p.id, { speedPct: 60 }, 2000);
    await sync(b);
    await sync(a);
    expect((await listProfiles(a))[0]!.settings.speedPct).toBe(90);
    expect(remote.rows('profiles')[0]!.data).toMatchObject({ settings: { speedPct: 90 } });
  });
});

describe('sync engine: the auto-fingering switch', () => {
  it('turning it off on one device reaches the other, because it lives in the profile settings', async () => {
    const p = await createProfile(a, input, 1000);
    await sync(a);
    await sync(b);
    await saveSettings(a, p.id, { autoFingering: false }, 2000);
    await sync(a);
    await sync(b);
    expect((await listProfiles(b))[0]!.settings.autoFingering).toBe(false);
    expect(remote.rows('profiles')[0]!.data).toMatchObject({ settings: { autoFingering: false } });
  });
});

describe('sync engine: high scores keep the max', () => {
  it('keeps the higher score whichever device syncs last', async () => {
    const p = await createProfile(a, input, 1);
    await sync(a);
    await sync(b);
    await recordScore(a, score(p.id, 4800, 5000));
    await recordScore(b, score(p.id, 3000, 9000));
    await sync(b);
    await sync(a);
    await sync(b);
    expect((await profileScores(a, p.id))[0]!.score).toBe(4800);
    expect((await profileScores(b, p.id))[0]!.score).toBe(4800);
    expect(remote.rows('scores')[0]!.score).toBe(4800);
  });
});

describe('sync engine: attempts and progress', () => {
  it('carries an attempt with its miss log', async () => {
    const song = getSong('mary-had-a-little-lamb')!;
    const board = new ScoreBoard(song.notes.length);
    const p = await createProfile(a, input, 1);
    const { attempt } = await saveRun(a, { profileId: p.id, song, mode: 'full', speedPct: 100, loop: null, summary: board.summary(), wait: null, at: 7000 });
    await sync(a);
    await sync(b);
    expect(await b.attempts.get(attempt.id)).toEqual(attempt);
  });
});

describe('sync engine: imported songs', () => {
  const importFixture = async (db: KeyfallDb) => {
    const bytes = new TextEncoder().encode(musicXml());
    const an = await analyseFile('frere.musicxml', bytes);
    return saveNewImport(db, an, 'frere.musicxml', bytes.buffer.slice(0) as ArrayBuffer, { title: 'Frere', composer: 'Trad', splitMode: an.groupHands ? 'groups' : 'pitch', splitMidi: 60, level: 2, levelOverridden: true });
  };

  it('uploads the original file and rebuilds the song on another device', async () => {
    const rec = await importFixture(a);
    await sync(a);
    expect(remote.uploads).toEqual([`${UID}/${rec.id}`]);
    await sync(b);
    const got = (await allImportedSongs(b))[0]!;
    expect(got.id).toBe(rec.id);
    expect(got.song.title).toBe('Frere');
    expect(got.song.level).toBe(2);
    expect(got.song.notes).toEqual(rec.song.notes);
    expect(new Uint8Array(got.source)).toEqual(new Uint8Array(rec.source));
  });

  it('does not upload again after a metadata edit, and carries a soft delete', async () => {
    const rec = await importFixture(a);
    await sync(a);
    await sync(b);
    await deleteImportedSong(a, rec.id, Date.now() + 10);
    await sync(a);
    await sync(b);
    expect(remote.uploads).toHaveLength(1);
    expect((await allImportedSongs(b))[0]!.deletedAt).toBeGreaterThan(0);
    expect(remote.files.size).toBe(0);
  });
});

describe('sync engine: offline replay', () => {
  it('keeps changes made offline and sends them once when back online', async () => {
    remote.online = false;
    const p = await createProfile(a, input, 1000);
    await recordScore(a, score(p.id, 100, 2000));
    const off = await sync(a);
    expect(off.errors.length).toBeGreaterThan(0);
    await saveSettings(a, p.id, { speedPct: 55 }, 3000);
    await sync(a);
    expect(remote.rows('profiles')).toHaveLength(0);

    remote.online = true;
    await sync(a);
    expect(remote.rows('profiles')[0]!.data).toMatchObject({ settings: { speedPct: 55 } });
    expect(remote.rows('scores')).toHaveLength(1);

    const before = remote.upserts.length;
    const again = await sync(a);
    expect(again.pushed).toBe(0);
    expect(remote.upserts.length).toBe(before);
  });

  it('does not push rows it just pulled', async () => {
    await createProfile(a, input, 1000);
    await sync(a);
    await sync(b);
    const before = remote.upserts.length;
    const r = await sync(b);
    expect(r.pushed).toBe(0);
    expect(remote.upserts.length).toBe(before);
  });

  it('a pulled row stamped in the future does not hide later local edits', async () => {
    const p = await createProfile(a, input, Date.now() + 86_400_000);
    await sync(a);
    await sync(b);
    await saveSettings(b, p.id, { speedPct: 65 }, Date.now() + 86_400_001);
    const q = await createProfile(b, { ...input, name: 'Sam' }, Date.now());
    await sync(b);
    expect(remote.rows('profiles').map((r) => r.id)).toContain(q.id);
  });

  it('a different account on the same device gets its own sync position', async () => {
    await createProfile(a, input, 1000);
    await sync(a, 'user-1');
    await sync(a, 'user-2');
    expect(remote.upserts.filter((u) => u.table === 'profiles')).toHaveLength(2);
  });
});
