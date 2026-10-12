import { LEGACY_LATENCY_KEY, readLegacyLatency } from '../engine/latency';
import type { KeyfallDb } from './db';

const LATENCY_FLAG = 'migrated.latency.v1';

/**
 * Phase 2 kept latency offsets in localStorage (`keyfall.latency.v1`). Copy them
 * into Dexie once, then drop the old key. Rows already in Dexie win.
 */
export async function migrateLegacyLatency(db: KeyfallDb, storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined, now = Date.now()): Promise<number> {
  if (await db.meta.get(LATENCY_FLAG)) return 0;
  const legacy = readLegacyLatency(storage);
  let moved = 0;
  await db.transaction('rw', db.latency, db.meta, async () => {
    for (const [device, offsetMs] of Object.entries(legacy)) {
      if (await db.latency.get(device)) continue;
      await db.latency.put({ id: device, offsetMs, updatedAt: now });
      moved++;
    }
    await db.meta.put({ key: LATENCY_FLAG, value: now });
  });
  try {
    storage?.removeItem(LEGACY_LATENCY_KEY);
  } catch {
    // Storage blocked: nothing to clean up.
  }
  return moved;
}
