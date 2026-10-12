import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

interface Bundled {
  id: string;
  title: string;
  file: string;
  /** Needs these learn units passed on the Advanced profile used here (units 6 to 9 and `advanced` are open for it). */
  units: string[];
}

const SONGS: Bundled[] = [
  { id: 'mary-had-a-little-lamb', title: 'Mary Had a Little Lamb', file: 'mary-had-a-little-lamb', units: [] },
  { id: 'twinkle-twinkle-little-star', title: 'Twinkle Twinkle Little Star', file: 'twinkle-twinkle-little-star', units: [] },
  { id: 'ode-to-joy', title: 'Ode to Joy', file: 'ode-to-joy', units: ['unit-2'] },
  { id: 'jingle-bells', title: 'Jingle Bells', file: 'jingle-bells', units: ['unit-3'] },
  { id: 'when-the-saints-go-marching-in', title: 'When the Saints Go Marching In', file: 'when-the-saints', units: ['unit-4'] },
  { id: 'minuet-in-g', title: 'Minuet in G', file: 'minuet-in-g', units: [] },
  { id: 'greensleeves', title: 'Greensleeves', file: 'greensleeves', units: [] },
  { id: 'fur-elise-opening', title: 'Für Elise (opening)', file: 'fur-elise', units: [] },
  { id: 'canon-in-d', title: 'Canon in D', file: 'canon-in-d', units: [] },
  { id: 'clair-de-lune', title: 'Clair de Lune', file: 'clair-de-lune', units: [] },
  { id: 'chopin-nocturne-op72-1', title: 'Nocturne in E minor, Op. 72 No. 1', file: 'chopin-nocturne-op72-1', units: [] },
  { id: 'row-row-row-your-boat', title: "Row, Row, Row Your Boat", file: 'row-row-row-your-boat', units: [] },
  { id: 'london-bridge', title: "London Bridge Is Falling Down", file: 'london-bridge', units: [] },
  { id: 'frere-jacques', title: "Frère Jacques", file: 'frere-jacques', units: [] },
  { id: 'yankee-doodle', title: "Yankee Doodle", file: 'yankee-doodle', units: [] },
  { id: 'oh-susanna', title: "Oh! Susanna", file: 'oh-susanna', units: [] },
  { id: 'happy-birthday', title: "Happy Birthday to You", file: 'happy-birthday', units: [] },
  { id: 'amazing-grace', title: "Amazing Grace", file: 'amazing-grace', units: [] },
  { id: 'brahms-lullaby', title: "Brahms' Lullaby (Wiegenlied)", file: 'brahms-lullaby', units: [] },
  { id: 'auld-lang-syne', title: "Auld Lang Syne", file: 'auld-lang-syne', units: [] },
  { id: 'scarborough-fair', title: "Scarborough Fair", file: 'scarborough-fair', units: [] },
  { id: 'bach-musette-in-d', title: "Musette in D, BWV Anh. 126", file: 'bach-musette-in-d', units: [] },
  { id: 'tchaikovsky-old-french-song', title: "Old French Song (Op. 39 No. 16)", file: 'tchaikovsky-old-french-song', units: [] },
  { id: 'schumann-melody-op68-1', title: "Melody (Album for the Young, Op. 68 No. 1)", file: 'schumann-melody-op68-1', units: [] },
  { id: 'schumann-happy-farmer', title: "The Happy Farmer (Op. 68 No. 10)", file: 'schumann-happy-farmer', units: [] },
  { id: 'burgmuller-arabesque', title: "Arabesque, Op. 100 No. 2", file: 'burgmuller-arabesque', units: [] },
  { id: 'bach-prelude-in-c', title: "Prelude in C, BWV 846 (WTC I)", file: 'bach-prelude-in-c', units: [] },
  { id: 'clementi-sonatina-op36-1-mvt1', title: "Sonatina in C, Op. 36 No. 1, 1st mvt", file: 'clementi-sonatina-op36-1-mvt1', units: [] },
  { id: 'joplin-the-entertainer', title: "The Entertainer", file: 'joplin-the-entertainer', units: [] },
];

/** Bars in the bundled MusicXML, counted from the repo file (the production build does not serve src/). */
function barsIn(file: string): number {
  return (readFileSync(new URL(`../src/songs/${file}.musicxml`, import.meta.url), 'utf8').match(/<measure[ >]/g) ?? []).length;
}

/** An Advanced profile with Units 2 to 5 recorded as passed (Units 5 to 9 and Clair de Lune/the Nocturne are open to Advanced by rule). */
async function advancedPlayer(page: Page, units: string[] = ['unit-2', 'unit-3', 'unit-4', 'unit-5']) {
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

test.describe('every bundled song plays to the end in Full mode at 100% accuracy', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const song of SONGS) {
    test(`${song.title}`, async ({ page }) => {
      test.setTimeout(420_000);
      await advancedPlayer(page);
      await page.goto(`./?debug=1#/play/${song.id}`);
      await expect(page.getByTestId('play-ready')).toBeVisible();
      await page.getByTestId('mode-full').click();
      const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
      await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
      const hits = (await page.getByTestId('summary-hits').textContent())!.match(/(\d+) of (\d+)/)!;
      expect(hits[1]).toBe(hits[2]);
      expect(Number(hits[2])).toBeGreaterThan(20);
      expect(result.presses).toBe(Number(hits[2]));
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
