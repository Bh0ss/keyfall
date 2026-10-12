import { expect, test, type Browser, type Page } from '@playwright/test';
import { musicXml } from '../tests/fixtures/generate';
import { createProfile, isolateMidi, readStore } from './helpers';
import { SYNC_TABLES, signedInClient, testUser } from './sync-helpers';

const ORIGIN = 'http://localhost:5173';
const MARY = '/#/play/mary-had-a-little-lamb';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NAME = `E2E Sync ${RUN}`;
const FILE = `e2e-sync-${RUN}.musicxml`;

/** A fresh browser context: new storage, no session, no MIDI hardware. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: `${ORIGIN}/keyfall/` });
  await context.grantPermissions(['midi', 'midi-sysex'], { origin: ORIGIN });
  const page = await context.newPage();
  await isolateMidi(page);
  return page;
}

async function signInOnPage(page: Page) {
  const u = testUser(1);
  await page.getByTestId('account-email-input').fill(u.email);
  await page.getByTestId('account-password-input').fill(u.password);
  await page.getByTestId('sign-in').click();
}

/** Remove everything this run created in test account 1, by id, and nothing else. */
async function cleanup() {
  const { sb, uid } = await signedInClient(testUser(1));
  const { data: mine } = await sb.from('profiles').select('id, data');
  const profileIds = (mine ?? []).filter((r) => String((r.data as { name?: string }).name ?? '').startsWith(NAME)).map((r) => r.id as string);
  for (const t of SYNC_TABLES) {
    if (t === 'profiles' || t === 'imported_songs') continue;
    const { data } = await sb.from(t).select('id, data');
    const ids = (data ?? []).filter((r) => profileIds.includes(String((r.data as { profileId?: string }).profileId))).map((r) => r.id as string);
    if (ids.length) await sb.from(t).delete().in('id', ids);
  }
  const { data: songs } = await sb.from('imported_songs').select('id, data');
  const songIds = (songs ?? []).filter((r) => (r.data as { fileName?: string }).fileName === FILE).map((r) => r.id as string);
  if (songIds.length) {
    await sb.storage.from('songs').remove(songIds.map((id) => `${uid}/${id}`));
    await sb.from('imported_songs').delete().in('id', songIds);
  }
  if (profileIds.length) await sb.from('profiles').delete().in('id', profileIds);
}

test.afterAll(async () => {
  await cleanup();
});

test.describe('sync across devices', () => {
  test.setTimeout(180_000);

  test('a score recorded in one browser context shows up in a second fresh context after sign-in', async ({ browser }) => {
    // Device 1: works signed out, then signs in.
    const one = await freshPage(browser);
    await one.goto('/');
    await expect(one.getByTestId('profile-picker')).toBeVisible();
    await createProfile(one, NAME);
    await expect(one.getByTestId('account-chip')).toHaveText('Not syncing');

    await one.goto(MARY);
    await one.getByTestId('mode-full').click();
    await one.evaluate(() => window.__keyfall!.autoplay({ offsetMs: 0 }));
    await expect(one.getByTestId('summary')).toBeVisible({ timeout: 20_000 });

    // Import a song too, so the original file has to travel through the private bucket.
    await one.goto('/#/import');
    await one.getByTestId('import-file').setInputFiles({ name: FILE, mimeType: 'application/vnd.recordare.musicxml+xml', buffer: Buffer.from(musicXml()) });
    await expect(one.getByTestId('import-form')).toBeVisible();
    await one.getByTestId('import-save').click();
    await expect(one).toHaveURL(/#\/songs$/);
    const importedId = (await one.getByTestId(/^song-imp-/).getAttribute('data-testid'))!.replace(/^song-/, '');

    await one.goto('/#/settings');
    await expect(one.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-out');
    await signInOnPage(one);
    // This device has local data that was never synced to the account: it waits for an explicit choice.
    await expect(one.getByTestId('account-card')).toHaveAttribute('data-state', 'choose', { timeout: 20_000 });
    await one.getByTestId('choice-upload').click();
    await expect(one.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-in', { timeout: 20_000 });
    await expect(one.getByTestId('sync-status')).toHaveAttribute('data-phase', 'synced', { timeout: 30_000 });

    const scores1 = await readStore<{ id: string; score: number }>(one, 'scores');
    expect(scores1).toHaveLength(1);
    expect(scores1[0]!.score).toBe(4800);

    // Device 2: a brand-new context. It has no profile, signs in from the picker, and gets everything.
    const two = await freshPage(browser);
    await two.goto('/');
    await expect(two.getByTestId('profile-picker')).toBeVisible();
    expect(await readStore(two, 'scores')).toEqual([]);
    await signInOnPage(two);
    // The fresh context has no local rows, so there is nothing to ask: it just pulls.
    await expect(two.getByTestId('choice-upload')).toHaveCount(0);
    await expect(two.getByTestId(`profile-card-${NAME}`)).toBeVisible({ timeout: 30_000 });
    await two.getByRole('button', { name: `Play as ${NAME}` }).click();
    await expect(two.getByTestId('app-ready')).toBeAttached();

    await expect.poll(async () => (await readStore<{ score: number }>(two, 'scores')).map((s) => s.score), { timeout: 30_000 }).toEqual([4800]);
    await expect.poll(async () => (await readStore<{ id: string }>(two, 'songs')).map((s) => s.id), { timeout: 30_000 }).toEqual([importedId]);
    expect((await readStore<{ misses: unknown[] }>(two, 'attempts'))).toHaveLength(1);

    await two.goto('/#/stats');
    await expect(two.getByTestId('stats-best-row').first()).toHaveAttribute('data-song', 'mary-had-a-little-lamb');
    await two.goto('/#/songs');
    await expect(two.getByTestId(`song-${importedId}`)).toBeVisible();

    // The server really holds it, scoped to the household.
    const { sb } = await signedInClient(testUser(1));
    const { data } = await sb.from('scores').select('score').eq('id', scores1[0]!.id);
    expect((data ?? []).map((r) => r.score)).toEqual([4800]);

    await one.context().close();
    await two.context().close();
  });

  test('a device with local data does not upload on sign-in until the player confirms', async ({ browser }) => {
    test.setTimeout(90_000);
    const name = `${NAME} hold`;
    const page = await freshPage(browser);
    await page.goto('/');
    await createProfile(page, name);
    await page.goto('/#/settings');
    await signInOnPage(page);
    await expect(page.getByTestId('account-card')).toHaveAttribute('data-state', 'choose', { timeout: 20_000 });

    // Wait well past the push delay and a sync pass; the server must still hold nothing of ours.
    await page.waitForTimeout(5_000);
    const { sb } = await signedInClient(testUser(1));
    const held = await sb.from('profiles').select('id, data');
    expect((held.data ?? []).filter((r) => String((r.data as { name?: string }).name).startsWith(name))).toEqual([]);

    // Cancel signs out and keeps the local data, still unsent.
    await page.getByTestId('choice-cancel').click();
    await expect(page.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-out');
    expect(await readStore(page, 'profiles')).toHaveLength(1);
    await page.waitForTimeout(3_000);
    const after = await sb.from('profiles').select('id, data');
    expect((after.data ?? []).filter((r) => String((r.data as { name?: string }).name).startsWith(name))).toEqual([]);
    await page.context().close();
  });

  test('Start fresh discards the device\'s data and takes the account\'s, uploading nothing', async ({ browser }) => {
    test.setTimeout(90_000);
    const name = `${NAME} fresh`;
    const page = await freshPage(browser);
    await page.goto('/');
    await createProfile(page, name);
    await page.goto('/#/settings');
    await signInOnPage(page);
    await expect(page.getByTestId('account-card')).toHaveAttribute('data-state', 'choose', { timeout: 20_000 });
    await page.getByTestId('choice-fresh').click();
    await expect(page.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-in', { timeout: 20_000 });
    await expect(page.getByTestId('sync-status')).toHaveAttribute('data-phase', 'synced', { timeout: 30_000 });
    expect((await readStore<{ name: string }>(page, 'profiles')).some((p) => p.name === name)).toBe(false);
    const { sb } = await signedInClient(testUser(1));
    const rows = await sb.from('profiles').select('id, data');
    expect((rows.data ?? []).filter((r) => String((r.data as { name?: string }).name).startsWith(name))).toEqual([]);
    await page.context().close();
  });
});
