import { expect } from '@playwright/test';
import { test } from './fixtures';
import { SYNC_TABLES, anonClient, signedInClient, testUser } from './sync-helpers';

/**
 * Row-level security through the real API (no mocks): the second test account cannot read, change,
 * delete or write into the first account's rows or storage objects. Every row and object is created
 * with a run-unique id and removed by that id afterwards, so reruns and crashes leave nothing behind.
 */
const RUN = `e2e-rls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
/** The type the app uploads with; the bucket now refuses anything outside its allowed list. */
const OCTET = 'application/octet-stream';
const rowId = (table: string) => `${RUN}-${table}`;

test('the second account cannot see or touch the first account\'s rows and files', async () => {
  test.setTimeout(60_000);
  const u1 = await signedInClient(testUser(1));
  const u2 = await signedInClient(testUser(2));
  const objectPath = `${u1.uid}/${RUN}`;
  const own2Path = `${u2.uid}/${RUN}`;
  const bytes = new TextEncoder().encode('keyfall-rls-test');

  try {
    // Account 1 writes one row in every table, plus a file.
    for (const t of SYNC_TABLES) {
      const row = { id: rowId(t), updated_at: 1, deleted_at: null, data: { marker: RUN }, ...(t === 'scores' ? { score: 10 } : {}) };
      const { error } = await u1.sb.from(t).upsert(row, { onConflict: 'household_id,id' });
      expect(error, `${t} insert as account 1`).toBeNull();
    }
    expect((await u1.sb.storage.from('songs').upload(objectPath, bytes, { contentType: OCTET })).error).toBeNull();

    // Positive control: account 1 reads its own rows and file (so "nothing found" below means something).
    for (const t of SYNC_TABLES) {
      const { data } = await u1.sb.from(t).select('id, household_id').eq('id', rowId(t));
      expect(data, `${t} readable by owner`).toEqual([{ id: rowId(t), household_id: u1.uid }]);
    }
    expect((await u1.sb.storage.from('songs').download(objectPath)).error).toBeNull();

    // Account 2 sees none of it, by listing or by asking for the exact id.
    for (const t of SYNC_TABLES) {
      const all = await u2.sb.from(t).select('id').like('id', `${RUN}%`);
      expect(all.error).toBeNull();
      expect(all.data, `${t} listing as account 2`).toEqual([]);
      const exact = await u2.sb.from(t).select('*').eq('id', rowId(t)).eq('household_id', u1.uid);
      expect(exact.data, `${t} by id as account 2`).toEqual([]);
    }
    const dl = await u2.sb.storage.from('songs').download(objectPath);
    expect(dl.error).not.toBeNull();
    expect(dl.data).toBeNull();
    const list = await u2.sb.storage.from('songs').list(u1.uid);
    expect(list.data ?? []).toEqual([]);

    // Account 2 cannot change or delete them (zero rows match under RLS)...
    for (const t of SYNC_TABLES) {
      const up = await u2.sb.from(t).update({ updated_at: 99 }).eq('id', rowId(t)).eq('household_id', u1.uid).select('id');
      expect(up.data ?? [], `${t} update as account 2`).toEqual([]);
      const del = await u2.sb.from(t).delete().eq('id', rowId(t)).eq('household_id', u1.uid).select('id');
      expect(del.data ?? [], `${t} delete as account 2`).toEqual([]);
    }
    // ...cannot write rows owned by account 1...
    for (const t of SYNC_TABLES) {
      const ins = await u2.sb.from(t).insert({ household_id: u1.uid, id: `${RUN}-forged-${t}`, updated_at: 1, deleted_at: null, data: {} });
      expect(ins.error, `${t} forged insert as account 2`).not.toBeNull();
    }
    // ...and cannot write or remove files in account 1's folder.
    const up = await u2.sb.storage.from('songs').upload(`${u1.uid}/${RUN}-forged`, bytes, { contentType: OCTET });
    expect(up.error).not.toBeNull();
    const rm = await u2.sb.storage.from('songs').remove([objectPath]);
    expect(rm.data ?? []).toEqual([]);

    // Account 1's data is untouched by all of that.
    for (const t of SYNC_TABLES) {
      const { data } = await u1.sb.from(t).select('updated_at').eq('id', rowId(t));
      expect(data, `${t} unchanged`).toEqual([{ updated_at: 1 }]);
    }
    expect((await u1.sb.storage.from('songs').download(objectPath)).error).toBeNull();

    // Account 2 still works on its own rows and folder.
    expect((await u2.sb.from('profiles').upsert({ id: rowId('own'), updated_at: 1, deleted_at: null, data: {} }, { onConflict: 'household_id,id' })).error).toBeNull();
    expect((await u2.sb.from('profiles').select('household_id').eq('id', rowId('own'))).data).toEqual([{ household_id: u2.uid }]);
    expect((await u2.sb.storage.from('songs').upload(own2Path, bytes, { contentType: OCTET })).error).toBeNull();

    // Signed out (anon key only): nothing is readable.
    const anon = anonClient();
    for (const t of SYNC_TABLES) {
      const r = await anon.from(t).select('id').like('id', `${RUN}%`);
      expect(r.data ?? [], `${t} as anon`).toEqual([]);
    }
    expect((await anon.storage.from('songs').download(objectPath)).error).not.toBeNull();
  } finally {
    // Cleanup by id, in each account's own scope.
    for (const t of SYNC_TABLES) await u1.sb.from(t).delete().in('id', [rowId(t), `${RUN}-forged-${t}`]);
    await u1.sb.storage.from('songs').remove([objectPath, `${u1.uid}/${RUN}-forged`]);
    await u2.sb.from('profiles').delete().eq('id', rowId('own'));
    await u2.sb.storage.from('songs').remove([own2Path]);
  }
});

/**
 * Server limits through the real API: the 64 KiB body cap, the updated_at clamp (5 minutes past the server clock) and
 * the songs bucket's allowed types. Run-unique ids, removed by id afterwards.
 */
test('the server caps row size, clamps future stamps and limits file types', async () => {
  test.setTimeout(60_000);
  const u1 = await signedInClient(testUser(1));
  const id = (s: string) => `${RUN}-limits-${s}`;
  const objectPath = `${u1.uid}/${RUN}-limits`;
  const bytes = new TextEncoder().encode('<score-partwise/>');
  const FIVE_MIN = 5 * 60 * 1000;

  try {
    // Body size: just under the cap is accepted, 64 KiB or more is refused.
    const fits = await u1.sb.from('profiles').upsert({ id: id('fits'), updated_at: 1, deleted_at: null, data: { blob: 'x'.repeat(60_000) } }, { onConflict: 'household_id,id' });
    expect(fits.error, 'a 60 KB body fits').toBeNull();
    for (const t of SYNC_TABLES) {
      const big = await u1.sb.from(t).upsert({ id: id(`big-${t}`), updated_at: 1, deleted_at: null, data: { blob: 'x'.repeat(70_000) } }, { onConflict: 'household_id,id' });
      expect(big.error, `${t} refuses a 70 KB body`).not.toBeNull();
      expect(big.error!.message).toContain('data_size');
    }

    // Clock: a stamp 10 years ahead is stored as at most 5 minutes past the server clock; a past stamp is untouched.
    const before = Date.now();
    const future = before + 10 * 365 * 86_400_000;
    expect((await u1.sb.from('profiles').upsert({ id: id('future'), updated_at: future, deleted_at: future, data: {} }, { onConflict: 'household_id,id' })).error).toBeNull();
    expect((await u1.sb.from('profiles').upsert({ id: id('past'), updated_at: 12345, deleted_at: null, data: {} }, { onConflict: 'household_id,id' })).error).toBeNull();
    const after = Date.now();
    const { data } = await u1.sb.from('profiles').select('id, updated_at, deleted_at').in('id', [id('future'), id('past')]);
    const byId = new Map((data ?? []).map((r) => [r.id as string, r as { updated_at: number; deleted_at: number | null }]));
    const f = byId.get(id('future'))!;
    expect(f.updated_at).toBeLessThanOrEqual(after + FIVE_MIN + 5_000);
    expect(f.updated_at).toBeGreaterThanOrEqual(before + FIVE_MIN - 5_000);
    expect(f.deleted_at).toBeLessThanOrEqual(after + FIVE_MIN + 5_000);
    expect(byId.get(id('past'))!.updated_at).toBe(12345);
    expect(byId.get(id('past'))!.deleted_at, 'a live row stays live (least() ignores null)').toBeNull();
    // A real edit made after the clamp still wins over the clamped row.
    const edit = await u1.sb.from('profiles').upsert({ id: id('future'), updated_at: Date.now() + 6 * 60 * 1000, deleted_at: null, data: { v: 2 } }, { onConflict: 'household_id,id' });
    expect(edit.error).toBeNull();
    expect((await u1.sb.from('profiles').select('data').eq('id', id('future'))).data).toEqual([{ data: { v: 2 } }]);

    // Files: the app's own type is accepted; web content types are refused.
    expect((await u1.sb.storage.from('songs').upload(objectPath, bytes, { contentType: 'application/octet-stream', upsert: true })).error).toBeNull();
    for (const bad of ['text/html', 'image/png', 'application/javascript']) {
      const r = await u1.sb.storage.from('songs').upload(`${objectPath}-bad`, bytes, { contentType: bad, upsert: true });
      expect(r.error, `${bad} refused`).not.toBeNull();
    }
  } finally {
    for (const t of SYNC_TABLES) await u1.sb.from(t).delete().in('id', [id(`big-${t}`)]);
    await u1.sb.from('profiles').delete().in('id', [id('fits'), id('future'), id('past')]);
    await u1.sb.storage.from('songs').remove([objectPath, `${objectPath}-bad`]);
  }
});
