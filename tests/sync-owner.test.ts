import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyfallDb } from '../src/storage/db';
import { saveLatency } from '../src/storage/latency';
import { createProfile, listProfiles } from '../src/storage/profiles';
import { confirmUpload, discardLocalData, getOwner, resolveSignIn } from '../src/sync/owner';
import { syncOnce } from '../src/sync/engine';
import { FakeRemote } from './sync-fake-remote';

let n = 0;
let db: KeyfallDb;
let remote: FakeRemote;
beforeEach(() => {
  db = new KeyfallDb(`owner-${++n}`);
  remote = new FakeRemote();
});
const input = { name: 'Alex', colour: '#F5A524', level: 'beginner' as const };

/** What the controller does: sync only when sign-in resolves to 'sync'. */
async function signIn(uid: string): Promise<'sync' | 'choose'> {
  const d = await resolveSignIn(db, uid);
  if (d === 'sync') await syncOnce(db, remote, uid);
  return d;
}

describe('device ownership on sign-in', () => {
  it('an empty device just syncs and becomes the account\'s', async () => {
    expect(await signIn('u1')).toBe('sync');
    expect(await getOwner(db)).toBe('u1');
  });

  it('local data from before any sign-in needs a choice and nothing is sent', async () => {
    await createProfile(db, input, 1000);
    expect(await signIn('u1')).toBe('choose');
    expect(await getOwner(db)).toBeUndefined();
    expect(remote.upserts).toHaveLength(0);
  });

  it('Upload claims the device and then syncs normally', async () => {
    await createProfile(db, input, 1000);
    await signIn('u1');
    await confirmUpload(db, 'u1');
    await syncOnce(db, remote, 'u1');
    expect(await getOwner(db)).toBe('u1');
    expect(remote.rows('profiles')).toHaveLength(1);
  });

  it('Start fresh discards local rows (keeps latency), claims the device, and pulls only the account\'s data', async () => {
    const other = new KeyfallDb(`owner-other-${n}`);
    await createProfile(other, { ...input, name: 'Sam' }, 2000);
    await syncOnce(other, remote, 'u1');

    await createProfile(db, input, 1000);
    await saveLatency(db, 'kb', 12);
    expect(await signIn('u1')).toBe('choose');
    await discardLocalData(db, 'u1');
    expect(await listProfiles(db)).toEqual([]);
    expect(await db.latency.get('kb')).toBeDefined();
    expect(remote.rows('profiles')).toHaveLength(1);
    await syncOnce(db, remote, 'u1');
    expect((await listProfiles(db)).map((p) => p.name)).toEqual(['Sam']);
    expect(remote.rows('profiles')).toHaveLength(1);
  });

  it('a different account on a device owned by another needs a choice and sends nothing', async () => {
    await createProfile(db, input, 1000);
    await signIn('u1');
    await confirmUpload(db, 'u1');
    await syncOnce(db, remote, 'u1');
    const before = remote.upserts.length;
    expect(await signIn('u2')).toBe('choose');
    expect(remote.upserts.length).toBe(before);
    expect(remote.rows('profiles')).toHaveLength(1);
  });

  it('signing back in as the owner syncs normally, including offline changes', async () => {
    await createProfile(db, input, 1000);
    await signIn('u1');
    await confirmUpload(db, 'u1');
    await syncOnce(db, remote, 'u1');
    await createProfile(db, { ...input, name: 'Sam' }, 2000);
    expect(await signIn('u1')).toBe('sync');
    expect(remote.rows('profiles')).toHaveLength(2);
  });

  it('discarding for a new account also wipes the old account\'s sync positions', async () => {
    await createProfile(db, input, 1000);
    await signIn('u1');
    await confirmUpload(db, 'u1');
    await syncOnce(db, remote, 'u1');
    await discardLocalData(db, 'u2');
    expect(await getOwner(db)).toBe('u2');
    expect((await db.meta.toArray()).some((m) => m.key.startsWith('sync.seen.u1'))).toBe(false);
  });

  it('clearing local data on sign-out leaves an empty device with no owner', async () => {
    await createProfile(db, input, 1000);
    await signIn('u1');
    await confirmUpload(db, 'u1');
    await discardLocalData(db, null);
    expect(await listProfiles(db)).toEqual([]);
    expect(await getOwner(db)).toBeUndefined();
  });
});
