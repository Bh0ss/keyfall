import type { KeyfallDb } from './db';

/** Calibrated latency for a device name (0 when never calibrated). */
export async function getLatency(db: KeyfallDb, device: string): Promise<number> {
  return (await db.latency.get(device))?.offsetMs ?? 0;
}

/** The saved offset, or null when the device was never calibrated. */
export async function savedLatency(db: KeyfallDb, device: string): Promise<number | null> {
  return (await db.latency.get(device))?.offsetMs ?? null;
}

export async function saveLatency(db: KeyfallDb, device: string, offsetMs: number, now = Date.now()): Promise<void> {
  await db.latency.put({ id: device, offsetMs, updatedAt: now });
}

export async function clearLatency(db: KeyfallDb, device: string): Promise<void> {
  await db.latency.delete(device);
}
