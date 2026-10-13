import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { UNITS } from '../src/learn/units';
import { BUNDLED_ENTRIES } from '../src/songs/entries';
import { createProfile, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

interface Bundled {
  id: string;
  title: string;
  file: string;
}

/** Entity-decode the few XML escapes a title can carry. */
const unescapeXml = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" })[e]!);

/** Every bundled song, derived from the catalog the app ships (never a hand-typed list). Titles come from the file. */
const SONGS: Bundled[] = BUNDLED_ENTRIES.map((e) => {
  const xml = readFileSync(new URL(`../src/songs/${e.file}.musicxml`, import.meta.url), 'utf8');
  const title = xml.match(/<work-title>([^<]*)<\/work-title>/)?.[1];
  return { id: e.meta.id, file: e.file, title: title ? unescapeXml(title) : e.meta.id };
});

/** Every learn unit, so any `unlockedBy` a future song carries is open. */
const ALL_UNITS = UNITS.map((u) => u.id);

/** Bars in the bundled MusicXML, counted from the repo file (the production build does not serve src/). */
function barsIn(file: string): number {
  return (readFileSync(new URL(`../src/songs/${file}.musicxml`, import.meta.url), 'utf8').match(/<measure[ >]/g) ?? []).length;
}

/** An Advanced profile with the given learn units recorded as passed (all of them by default; Advanced opens the expert songs by rule). */
async function advancedPlayer(page: Page, units: string[] = ALL_UNITS) {
  await page.addInitScript(() => {
    const empty = { inputs: new Map(), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(empty), configurable: true });
  });
  await page.goto('./?debug=1#/');
  await page.getByTestId('app-ready').or(page.getByTestId('profile-picker')).first().waitFor({ state: 'attached' });
  await createProfile(page, 'Pro', 'advanced');
  const [profile] = await readStore<{ id: string }>(page, 'profiles');
  await page.evaluate(
    ({ pid, ids }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyfall');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('learnProgress', 'readwrite');
          for (const unitId of ids) {
            tx.objectStore('learnProgress').put({
              id: `${pid}:${unitId}`, profileId: pid, unitId, passed: true, passedAt: Date.now(), bestCorrect: 20, bestTotal: 20,
              attempts: 1, lessonsDone: [], updatedAt: Date.now(),
            });
          }
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { pid: profile!.id, ids: units },
  );
}

test('the song list covers the whole catalog', () => {
  expect(SONGS.length).toBe(BUNDLED_ENTRIES.length);
  expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
});

test.describe('every bundled song plays to the end in Full mode at 100% accuracy', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const song of SONGS) {
    test(`${song.title}`, async ({ page }) => {
      test.setTimeout(420_000);
      // Playwright's fake clock (time flows until paused): the song plays on virtual time, about 3 times faster than the wall
      // clock. Judging only reads the timestamps it is given, so the per-note result matches the real clock (V13 spike, PROGRESS.md).
      // Real-clock timing is still proven by scoring.spec and play.spec.
      await page.clock.install();
      await advancedPlayer(page);
      await page.goto(`./?debug=1#/play/${song.id}`);
      await expect(page.getByTestId('play-ready')).toBeVisible();
      await page.getByTestId('mode-full').click();
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
      let result: { presses: number } | undefined;
      const playing = page.evaluate(() => window.__keyfall!.autoplay({})).then((r) => (result = r));
      const finished = page.getByTestId('play-finished');
      // Up to 15 virtual minutes (the longest bundled song is about 4.5).
      for (let i = 0; i < 450 && !(await finished.count()); i++) await page.clock.runFor(2000);
      await playing;
      await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
      const hits = (await page.getByTestId('summary-hits').textContent())!.match(/(\d+) of (\d+)/)!;
      expect(hits[1]).toBe(hits[2]);
      expect(Number(hits[2])).toBeGreaterThan(20);
      expect(result?.presses).toBe(Number(hits[2]));
      await expect(page.getByTestId('summary-accuracy')).toHaveText('100.0%');
    });
  }
});

test.describe('sheet view renders for every bundled song', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const song of SONGS) {
    test(`${song.title}`, async ({ page }) => {
      test.setTimeout(120_000);
      await advancedPlayer(page);
      await page.goto(`./?debug=1#/play/${song.id}`);
      await expect(page.getByTestId('play-ready')).toBeVisible();
      await page.getByTestId('view-sheet').click();
      const sheet = page.getByTestId('sheet');
      await expect(sheet).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
      await expect(sheet.locator('svg').first()).toBeVisible();
      await expect(sheet).toHaveAttribute('data-measures', String(barsIn(song.file)));
      expect(Number(await sheet.getAttribute('data-mapped'))).toBeGreaterThan(20);
      await expect(page.getByTestId('sheet-cursor')).toBeVisible();
    });
  }
});

test.describe('sheet view in play', () => {
  test('notes turn green when hit and coral when missed, and the cursor moves with the clock', async ({ page }) => {
    test.setTimeout(120_000);
    await advancedPlayer(page);
    await page.goto('./?debug=1#/play/mary-had-a-little-lamb');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('mode-full').click();
    await page.getByTestId('view-sheet').click();
    await expect(page.getByTestId('sheet')).toHaveAttribute('data-state', 'ready');
    const cursor = page.getByTestId('sheet-cursor');
    const x0 = await cursor.evaluate((el) => (el as HTMLElement).style.left);
    const run = page.evaluate(() => window.__keyfall!.autoplay({ missRate: 0.3, seed: 5 }));
    await expect.poll(() => cursor.evaluate((el) => (el as HTMLElement).style.left), { timeout: 20_000 }).not.toBe(x0);
    await run;
    await expect(page.getByTestId('play-finished')).toBeVisible();
    const tones = await page.evaluate(() => ({
      hit: document.querySelectorAll('[data-testid="sheet"] [data-tone="hit"]').length,
      miss: document.querySelectorAll('[data-testid="sheet"] [data-tone="miss"]').length,
      green: Array.from(document.querySelectorAll<SVGElement>('[data-testid="sheet"] [data-tone="hit"] path')).some((p) => p.style.fill === 'rgb(111, 227, 168)'),
      coral: Array.from(document.querySelectorAll<SVGElement>('[data-testid="sheet"] [data-tone="miss"] path')).some((p) => p.style.fill === 'rgb(255, 107, 90)'),
    }));
    const m = (await page.getByTestId('summary-hits').textContent())!.match(/(\d+) of (\d+)/)!;
    expect(tones.hit).toBe(Number(m[1]));
    expect(tones.miss).toBe(Number(m[2]) - Number(m[1]));
    expect(tones.miss).toBeGreaterThan(0);
    expect(tones.green && tones.coral).toBe(true);
  });

  test('split view shows the score above the highway; the view is remembered per profile', async ({ page }) => {
    await advancedPlayer(page);
    await page.goto('./?debug=1#/play/mary-had-a-little-lamb');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('view-split').click();
    await expect(page.getByTestId('sheet')).toHaveAttribute('data-state', 'ready');
    const sheetBox = (await page.getByTestId('sheet').boundingBox())!;
    const canvasBox = (await page.getByTestId('highway').boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(canvasBox.y + 2);
    await expect(page.getByTestId('highway')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('view-split')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('sheet')).toHaveAttribute('data-state', 'ready');
    await page.getByTestId('view-falling').click();
    await expect(page.getByTestId('sheet')).toHaveCount(0);
  });

  test('Expert: labels start off and the sheet view is available', async ({ page }) => {
    await advancedPlayer(page);
    await page.goto('./?debug=1#/play/mary-had-a-little-lamb');
    await page.getByTestId('mode-expert').click();
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: Off');
    await page.getByTestId('view-sheet').click();
    await expect(page.getByTestId('sheet')).toHaveAttribute('data-state', 'ready');
  });
});

test.describe('unlocks for the new songs', () => {
  test('a Beginner profile finds the later songs locked; an Advanced one has Units 6 to 9, Clair de Lune and the Nocturne open', async ({ page }) => {
    await advancedPlayer(page, []);
    await page.goto('./?debug=1#/songs');
    for (const id of ['minuet-in-g', 'greensleeves', 'fur-elise-opening', 'canon-in-d', 'clair-de-lune', 'chopin-nocturne-op72-1', 'bach-prelude-in-c', 'burgmuller-arabesque', 'joplin-the-entertainer']) {
      await expect(page.getByTestId(`song-${id}`)).not.toHaveAttribute('data-locked', 'true');
    }
    await expect(page.getByTestId('song-locked-when-the-saints-go-marching-in')).toBeVisible();
    await page.goto('./?debug=1#/');
    await page.getByTestId('switch-profile').click();
    await createProfile(page, 'Newbie', 'beginner');
    await page.goto('./?debug=1#/songs');
    for (const id of ['when-the-saints-go-marching-in', 'minuet-in-g', 'greensleeves', 'fur-elise-opening', 'canon-in-d', 'clair-de-lune', 'chopin-nocturne-op72-1', 'bach-prelude-in-c', 'burgmuller-arabesque', 'joplin-the-entertainer']) {
      await expect(page.getByTestId(`song-locked-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('song-locked-clair-de-lune')).toHaveText('Open on Advanced profiles');
  });
});
