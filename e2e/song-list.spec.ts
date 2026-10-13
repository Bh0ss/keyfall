import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, isolateMidi, readStore, switchTo } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const SONGS = './?debug=1#/songs';
const titles = (page: Page) => page.locator('li[data-testid^="song-"] h2').allTextContents();
const pressed = (page: Page, id: string) => expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'true');

async function tap(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

test.describe('song list sort and filter', () => {
  test('sort and hands filter are remembered per profile, across a reload', async ({ page }) => {
    await page.goto('./?debug=1');
    await createProfile(page, 'Alex');
    await page.goto(SONGS);
    await expect(page.getByTestId('song-controls')).toBeVisible();

    // Defaults: easiest first, all hands.
    await pressed(page, 'sort-difficulty');
    await pressed(page, 'hands-all');
    const all = await titles(page);
    expect(all.length).toBeGreaterThan(20);
    await expect(page.getByTestId('song-count')).toHaveText(`${all.length} of ${all.length} songs`);

    await page.getByTestId('sort-title').click();
    await page.getByTestId('hands-right').click();
    await pressed(page, 'sort-title');
    await pressed(page, 'hands-right');
    const shown = await titles(page);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(all.length);
    expect(shown).toEqual([...shown].sort(new Intl.Collator(undefined, { sensitivity: 'base' }).compare));
    for (const text of await page.locator('li[data-testid^="song-"] p').allTextContents()) expect(text).toContain('Right hand');

    await expect
      .poll(async () => (await readStore<{ settings: { songSort?: string; songHands?: string } }>(page, 'profiles'))[0]!.settings)
      .toMatchObject({ songSort: 'title', songHands: 'right' });
    await page.reload();
    await pressed(page, 'sort-title');
    await pressed(page, 'hands-right');
    expect(await titles(page)).toEqual(shown);

    // Both hands and left hand only.
    await page.getByTestId('hands-both').click();
    for (const text of await page.locator('li[data-testid^="song-"] p').allTextContents()) expect(text).toContain('Both hands');
    await page.getByTestId('hands-left').click();
    const left = await titles(page);
    for (const text of await page.locator('li[data-testid^="song-"] p').allTextContents()) expect(text).toContain('Left hand');
    if (left.length === 0) await expect(page.getByTestId('song-count')).toHaveText('No songs match this filter.');
    await page.getByTestId('hands-right').click();

    // Another profile starts from the defaults; Alex's choice is still there on return.
    await switchTo(page, 'Sam');
    await page.goto(SONGS);
    await pressed(page, 'sort-difficulty');
    await pressed(page, 'hands-all');
    expect(await titles(page)).toEqual(all);
    await switchTo(page, 'Alex');
    await page.goto(SONGS);
    await pressed(page, 'sort-title');
    await pressed(page, 'hands-right');
  });

  test('recently played puts a played song first, and the controls work from the piano keys', async ({ page }) => {
    await page.goto('./?debug=1');
    await createProfile(page, 'Alex');
    const profileId = (await readStore<{ id: string }>(page, 'profiles'))[0]!.id;
    await page.evaluate(
      (pid) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('keyfall');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('scores', 'readwrite');
            tx.objectStore('scores').put({
              id: `${pid}:london-bridge:wait`,
              profileId: pid,
              songId: 'london-bridge',
              mode: 'wait',
              speedPct: 100,
              score: 100,
              accuracy: 1,
              stars: 3,
              attemptId: 'a1',
              achievedAt: 5000,
              updatedAt: 5000,
            });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      profileId,
    );
    await page.goto(SONGS);
    await page.reload();

    // Select "Recent" with D1 steps and C1, no pointer.
    for (let i = 0; i < 60 && !(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'sort-recent')); i++) await tap(page, 26);
    await tap(page, 24);
    await pressed(page, 'sort-recent');
    const list = await titles(page);
    expect(list[0]).toBe('London Bridge Is Falling Down');
    // The rest, never played, are A-Z.
    const rest = list.slice(1);
    expect(rest).toEqual([...rest].sort(new Intl.Collator(undefined, { sensitivity: 'base' }).compare));
  });
});
