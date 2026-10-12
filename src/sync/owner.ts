import type { KeyfallDb } from '../storage/db';
import { SYNC_TABLES, localTable } from './tables';

const OWNER_KEY = 'sync.owner';

/** The account whose data this device's synced tables hold, if one was ever confirmed. */
export async function getOwner(db: KeyfallDb): Promise<string | undefined> {
  return (await db.meta.get(OWNER_KEY))?.value as string | undefined;
}

async function hasLocalRows(db: KeyfallDb): Promise<boolean> {
  for (const spec of SYNC_TABLES) if ((await localTable(db, spec.local).count()) > 0) return true;
  return false;
}

/**
 * What to do when `uid` signs in. 'sync' means go ahead (the device is empty or already this account's);
 * 'choose' means the device holds data never synced to this account, so nothing may be sent until the
 * player decides (upload it, start fresh, or cancel).
 */
export async function resolveSignIn(db: KeyfallDb, uid: string): Promise<'sync' | 'choose'> {
  const owner = await getOwner(db);
  if (owner === uid) return 'sync';
  if (!(await hasLocalRows(db))) {
    await db.meta.put({ key: OWNER_KEY, value: uid });
    return 'sync';
  }
  return 'choose';
}

/** The player chose to upload this device's data to the account. */
export async function confirmUpload(db: KeyfallDb, uid: string): Promise<void> {
  await db.meta.put({ key: OWNER_KEY, value: uid });
}

/**
 * Delete the synced tables and every sync position on this device (latency offsets, which describe the
 * keyboard, stay). With a uid the device is then handed to that account; with null it is left empty and unowned.
 */
export async function discardLocalData(db: KeyfallDb, uid: string | null): Promise<void> {
  await db.transaction('rw', [...SYNC_TABLES.map((s) => localTable(db, s.local)), db.meta], async () => {
    for (const spec of SYNC_TABLES) await localTable(db, spec.local).clear();
    const keys = (await db.meta.toCollection().primaryKeys()).filter((k) => k.startsWith('sync.'));
    await db.meta.bulkDelete(keys);
    if (uid) await db.meta.put({ key: OWNER_KEY, value: uid });
  });
}
