import type { SyncName } from './tables';

interface Mergeable {
  updatedAt: number;
  score?: number;
  deletedAt?: number;
}

/**
 * Should a pulled remote record replace the local one?
 * Last write wins by `updatedAt` (a delete is a write, carried by `deletedAt` and a new `updatedAt`).
 * High scores keep the maximum instead; a tie keeps the local record.
 */
export function shouldTakeRemote(table: SyncName, local: Mergeable | undefined, remote: Mergeable): boolean {
  if (!local) return true;
  if (table === 'scores') return (remote.score ?? 0) > (local.score ?? 0);
  return remote.updatedAt > local.updatedAt;
}
