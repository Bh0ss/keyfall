import type { KeyfallDb } from '../storage/db';
import { shouldTakeRemote } from './merge';
import { SYNC_TABLES, fromRemote, localTable, toRemote, type Rec, type SyncSpec } from './tables';
import type { Remote, RemoteRow, SyncResult } from './types';

const PAGE = 500;
const PUSH_CHUNK = 100;
const SONG_CHUNK = 4;

type Seen = Record<string, number>;

const seenKey = (uid: string, remote: string) => `sync.seen.${uid}.${remote}`;
const cursorKey = (uid: string, remote: string) => `sync.pull.${uid}.${remote}`;
const uploadedKey = (uid: string, id: string) => `sync.up.${uid}.${id}`;

async function metaGet<T>(db: KeyfallDb, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

const songPath = (uid: string, id: string) => `${uid}/${id}`;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Records the server has acknowledged are remembered per account as id -> updatedAt ("seen").
 * Anything whose stamp differs from what was seen is waiting to be sent. That is the queue:
 * it survives restarts, nothing is lost while offline, and rows that arrived from the server
 * are never sent back. Keys, not rows, are scanned, so large tables stay cheap.
 */
export async function pendingIds(db: KeyfallDb, spec: SyncSpec, uid: string): Promise<string[]> {
  const seen = (await metaGet<Seen>(db, seenKey(uid, spec.remote))) ?? {};
  const t = localTable(db, spec.local);
  const [stamps, ids] = await Promise.all([t.orderBy('updatedAt').keys(), t.orderBy('updatedAt').primaryKeys()]);
  return ids.filter((id, i) => seen[id] !== stamps[i]);
}

async function markSeen(db: KeyfallDb, uid: string, remote: string, marks: [string, number][]): Promise<void> {
  if (!marks.length) return;
  const key = seenKey(uid, remote);
  const seen = (await metaGet<Seen>(db, key)) ?? {};
  for (const [id, at] of marks) seen[id] = at;
  await db.meta.put({ key, value: seen });
}

async function pushTable(db: KeyfallDb, remote: Remote, spec: SyncSpec, uid: string): Promise<number> {
  const ids = await pendingIds(db, spec, uid);
  const t = localTable(db, spec.local);
  const size = spec.local === 'songs' ? SONG_CHUNK : PUSH_CHUNK;
  let pushed = 0;
  for (let i = 0; i < ids.length; i += size) {
    const recs = (await t.bulkGet(ids.slice(i, i + size))).filter((r): r is Rec => !!r);
    const rows: RemoteRow[] = [];
    for (const rec of recs) {
      if (spec.local === 'songs') {
        const path = songPath(uid, rec.id);
        if (rec.deletedAt) {
          await remote.remove(path);
        } else if (!(await metaGet(db, uploadedKey(uid, rec.id)))) {
          await remote.upload(path, rec.source as ArrayBuffer);
          await db.meta.put({ key: uploadedKey(uid, rec.id), value: true });
        }
        rows.push(toRemote('songs', rec, path));
      } else {
        rows.push(toRemote(spec.local, rec));
      }
    }
    await remote.upsert(spec.remote, rows);
    await markSeen(db, uid, spec.remote, recs.map((r) => [r.id, r.updatedAt]));
    pushed += rows.length;
  }
  return pushed;
}

/** Rebuild an imported song from its original file and the synced choices. */
async function songFromRemote(db: KeyfallDb, remote: Remote, uid: string, row: RemoteRow, local: Rec | undefined): Promise<Rec> {
  const rec = fromRemote(row);
  if (row.deleted_at !== null) {
    // A deleted song needs no file; keep whatever copy exists so the record stays whole.
    return local ? { ...local, updatedAt: rec.updatedAt, deletedAt: row.deleted_at } : { ...rec, source: new ArrayBuffer(0) };
  }
  const bytes = (local?.source as ArrayBuffer | undefined) ?? (await remote.download(row.storage_path ?? songPath(uid, row.id)));
  const [{ analyseFile }, { buildSong }] = await Promise.all([import('../import/analyse'), import('../import/build')]);
  const a = await analyseFile(String(rec.fileName), bytes);
  const { song, approximate } = buildSong(a, row.id, {
    title: String(rec.title),
    composer: String(rec.composer),
    splitMode: rec.splitMode as 'groups' | 'pitch',
    splitMidi: Number(rec.splitMidi),
    level: rec.level as 1,
  });
  const { title: _t, composer: _c, level: _l, ...rest } = rec;
  void _t;
  void _c;
  void _l;
  await db.meta.put({ key: uploadedKey(uid, row.id), value: true });
  return { ...rest, song, approximate, source: bytes };
}

async function pullTable(db: KeyfallDb, remote: Remote, spec: SyncSpec, uid: string): Promise<number> {
  const since = (await metaGet<string>(db, cursorKey(uid, spec.remote))) ?? null;
  const rows: RemoteRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await remote.fetchSince(spec.remote, since, offset, PAGE);
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const t = localTable(db, spec.local);
  let applied = 0;
  const marks: [string, number][] = [];
  for (const row of rows) {
    const local = await t.get(row.id);
    let incoming = fromRemote(row);
    if (spec.local === 'scores') incoming = { ...incoming, score: row.score ?? Number(incoming.score ?? 0) };
    if (!shouldTakeRemote(spec.local, local, incoming)) {
      if (local && local.updatedAt === incoming.updatedAt) marks.push([row.id, local.updatedAt]);
      continue;
    }
    if (spec.local === 'songs') incoming = await songFromRemote(db, remote, uid, row, local);
    await t.put(incoming);
    marks.push([row.id, incoming.updatedAt]);
    applied++;
  }
  await markSeen(db, uid, spec.remote, marks);
  const last = rows[rows.length - 1]?.server_at;
  if (last) await db.meta.put({ key: cursorKey(uid, spec.remote), value: last });
  return applied;
}

/**
 * One sync pass for a signed-in household: send everything waiting, then pull what changed.
 * Never throws; a table that fails (offline, rejected) is reported and retried next pass.
 */
export async function syncOnce(db: KeyfallDb, remote: Remote, uid: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, applied: 0, errors: [] };
  for (const spec of SYNC_TABLES) {
    try {
      result.pushed += await pushTable(db, remote, spec, uid);
    } catch (e) {
      result.errors.push(`${spec.remote}: ${msg(e)}`);
    }
    try {
      result.applied += await pullTable(db, remote, spec, uid);
    } catch (e) {
      result.errors.push(`${spec.remote}: ${msg(e)}`);
    }
  }
  return result;
}
