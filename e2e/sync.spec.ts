import { expect, type Browser, type Page } from '@playwright/test';
import { test, watchCsp } from './fixtures';
import { musicXml } from '../tests/fixtures/generate';
import { createProfile, isolateMidi, readStore, ORIGIN } from './helpers';
import { bundledSong, synthesize, toWav } from '../tests/fixtures/audio';
import { SYNC_TABLES, signedInClient, testUser } from './sync-helpers';

const MARY = './?debug=1#/play/mary-had-a-little-lamb';
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NAME = `E2E Sync ${RUN}`;
const FILE = `e2e-sync-${RUN}.musicxml`;
const AUDIO_TITLE = `e2e-sync-audio-${RUN}`;
const AUDIO_FILE = `${AUDIO_TITLE}.musicxml`;

/** A fresh browser context: new storage, no session, no MIDI hardware. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: `${ORIGIN}/keyfall/` });
  await context.grantPermissions(['midi', 'midi-sysex'], { origin: ORIGIN });
  cspViolations.push(watchCsp(context));
  const page = await context.newPage();
  await isolateMidi(page);
  return page;
}

/** Content-Security-Policy violations seen by the extra contexts a test opens (the built-in fixture only watches its own). */
const cspViolations: string[][] = [];
test.afterEach(() => {
  const seen = cspViolations.splice(0).flat();
  expect(seen, 'Content-Security-Policy violations').toEqual([]);
});

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
  const songIds = (songs ?? []).filter((r) => [FILE, AUDIO_FILE].includes(String((r.data as { fileName?: string }).fileName))).map((r) => r.id as string);
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
    await one.goto('./?debug=1');
    await expect(one.getByTestId('profile-picker')).toBeVisible();
    await createProfile(one, NAME);
    await expect(one.getByTestId('account-chip')).toHaveText('Not syncing');

    await one.goto(MARY);
    await one.getByTestId('mode-full').click();
    await one.evaluate(() => window.__keyfall!.autoplay({ offsetMs: 0 }));
    await expect(one.getByTestId('summary')).toBeVisible({ timeout: 20_000 });

    // Import a song too, so the original file has to travel through the private bucket.
    await one.goto('./?debug=1#/import');
    await one.getByTestId('import-file').setInputFiles({ name: FILE, mimeType: 'application/vnd.recordare.musicxml+xml', buffer: Buffer.from(musicXml()) });
    await expect(one.getByTestId('import-form')).toBeVisible();
    await one.getByTestId('import-save').click();
    await expect(one).toHaveURL(/#\/songs$/);
    const importedId = (await one.getByTestId(/^song-imp-/).getAttribute('data-testid'))!.replace(/^song-/, '');

    await one.goto('./?debug=1#/settings');
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
    await two.goto('./?debug=1');
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

    await two.goto('./?debug=1#/stats');
    await expect(two.getByTestId('stats-best-row').first()).toHaveAttribute('data-song', 'mary-had-a-little-lamb');
    await two.goto('./?debug=1#/songs');
    await expect(two.getByTestId(`song-${importedId}`)).toBeVisible();

    // The server really holds it, scoped to the household.
    const { sb } = await signedInClient(testUser(1));
    const { data } = await sb.from('scores').select('score').eq('id', scores1[0]!.id);
    expect((data ?? []).map((r) => r.score)).toEqual([4800]);

    await one.context().close();
    await two.context().close();
  });

  test('a song added from a recording syncs as MusicXML text, and no audio-shaped object reaches the bucket', async ({ browser }) => {
    test.setTimeout(120_000);
    const name = `${NAME}a`; // profile names are capped at 22 characters
    const wav = Buffer.from(toWav(synthesize(bundledSong('ode-to-joy'), { seconds: 8 })));
    const one = await freshPage(browser);
    await one.goto('./?debug=1');
    await createProfile(one, name);
    await one.goto('./?debug=1#/add/audio');
    await expect(one.getByTestId('add-audio-screen')).toBeVisible();
    expect(await one.evaluate(() => window.__keyfall!.useFakeTranscriber('ode-to-joy', { stepMs: 10, steps: 3, finishingMs: 60 }))).toBe(true);
    await one.getByTestId('link-title').fill(AUDIO_TITLE);
    await one.getByTestId('link-artist').fill('E2E');
    await one.getByTestId('audio-file').setInputFiles({ name: 'recording.wav', mimeType: 'audio/wav', buffer: wav });
    await expect(one.getByTestId('import-form')).toBeVisible();
    await one.getByTestId('import-save').click();
    await expect(one).toHaveURL(/#\/play\/imp-/);
    const id = decodeURIComponent(one.url().split('#/play/')[1]!.split('?')[0]!);

    await one.goto('./?debug=1#/settings');
    await signInOnPage(one);
    await expect(one.getByTestId('account-card')).toHaveAttribute('data-state', 'choose', { timeout: 20_000 });
    await one.getByTestId('choice-upload').click();
    await expect(one.getByTestId('account-card')).toHaveAttribute('data-state', 'signed-in', { timeout: 20_000 });
    await expect(one.getByTestId('sync-status')).toHaveAttribute('data-phase', 'synced', { timeout: 30_000 });

    // The bucket holds the generated MusicXML text, smaller than the recording, and nothing audio-shaped at all.
    const { sb, uid } = await signedInClient(testUser(1));
    const row = await sb.from('imported_songs').select('id, data').eq('id', id).single();
    expect((row.data?.data as { fileName?: string }).fileName).toBe(AUDIO_FILE);
    const file = await sb.storage.from('songs').download(`${uid}/${id}`);
    expect(file.error).toBeNull();
    const bytes = Buffer.from(await file.data!.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('utf8')).toBe('<?xml');
    expect(bytes.byteLength).toBeLessThan(wav.byteLength);
    const listed = await sb.storage.from('songs').list(uid, { limit: 1000 });
    expect(listed.error).toBeNull();
    for (const o of listed.data ?? []) {
      const meta = (o.metadata ?? {}) as { mimetype?: string };
      expect(`${o.name} ${meta.mimetype ?? ''}`, 'bucket object').not.toMatch(/audio\/|\.(wav|mp3|m4a|aac|flac)\b|wav|mpeg/i);
    }

    // A second fresh context gets the song.
    const two = await freshPage(browser);
    await two.goto('./?debug=1');
    await expect(two.getByTestId('profile-picker')).toBeVisible();
    await signInOnPage(two);
    await expect(two.getByTestId(`profile-card-${name}`)).toBeVisible({ timeout: 30_000 });
    await two.getByRole('button', { name: `Play as ${name}` }).click();
    await expect(two.getByTestId('app-ready')).toBeAttached();
    await expect.poll(async () => (await readStore<{ id: string }>(two, 'songs')).map((s) => s.id), { timeout: 30_000 }).toContain(id);
    await two.goto('./?debug=1#/songs');
    await expect(two.getByTestId(`song-${id}`)).toContainText(AUDIO_TITLE);

    await one.context().close();
    await two.context().close();
  });

  test('a device with local data does not upload on sign-in until the player confirms', async ({ browser }) => {
    test.setTimeout(90_000);
    const name = `${NAME} hold`;
    const page = await freshPage(browser);
    await page.goto('./?debug=1');
    await createProfile(page, name);
    await page.goto('./?debug=1#/settings');
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
    await page.goto('./?debug=1');
    await createProfile(page, name);
    await page.goto('./?debug=1#/settings');
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
