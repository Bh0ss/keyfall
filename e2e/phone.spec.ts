import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi } from './helpers';

/**
 * Runs in the iPhone-landscape project, locally (dev server or `vite preview`) and against the live site
 * (KEYFALL_BASE_URL). Production hides window.__keyfall unless ?debug=1, so every URL carries it. URLs are
 * relative to the base URL (which ends in /keyfall/), never absolute paths.
 */
const MARY = '?debug=1#/play/mary-had-a-little-lamb';

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const canvasSize = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="highway"]')!;
    return { w: c.clientWidth, h: c.clientHeight };
  });

test('portrait shows the turn-your-phone prompt and landscape plays', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoApp(page, '?debug=1#/songs');
  await page.goto(MARY);
  const prompt = page.getByTestId('rotate-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Turn your phone sideways');

  await page.setViewportSize({ width: 852, height: 393 });
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId('play-ready')).toBeVisible();
});

test('Home, Songs and Learn are usable in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoApp(page, '?debug=1#/');
  for (const id of ['home', 'learn', 'play', 'stats', 'settings']) await expect(page.getByTestId(`rail-${id}`)).toBeVisible();
  await page.getByTestId('rail-learn').click();
  await expect(page.getByTestId('rail-learn')).toHaveAttribute('aria-current', 'page');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('landscape uses the compact layout with a song-range keyboard and large targets', async ({ page }) => {
  await gotoApp(page, MARY);
  const play = page.getByTestId('play-screen');
  await expect(play).toHaveAttribute('data-phone', 'true');
  await expect(page.getByTestId('rotate-prompt')).toHaveCount(0);

  // Compact HUD: the header is slim, so the highway gets most of the screen height.
  const head = await page.locator('.play-head').boundingBox();
  expect(head!.height).toBeLessThanOrEqual(56);
  const canvas = await canvasSize(page);
  const size = page.viewportSize()!;
  expect(canvas.h).toBeGreaterThan(size.height - 70);
  expect(canvas.w).toBeGreaterThanOrEqual(size.width - 1);

  // Large hit targets: every control in view is at least 44 px.
  const pause = await page.getByRole('button', { name: 'Pause' }).boundingBox();
  expect(pause!.width).toBeGreaterThanOrEqual(44);
  expect(pause!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('play-start')).toBeVisible();
  const start = await page.getByTestId('play-start').boundingBox();
  expect(start!.height).toBeGreaterThanOrEqual(44);
  const vp = page.viewportSize()!;
  const overlay = await page.getByTestId('play-ready').boundingBox();
  expect(overlay!.y).toBeGreaterThanOrEqual(0);
  expect(overlay!.y + overlay!.height).toBeLessThanOrEqual(vp.height);

  // Only the keys the song uses: Mary spans E4 to G4, so one octave C4..C5 (8 white keys), not 88.
  await page.getByTestId('play-start').click();
  const shown = await page.evaluate(() => {
    const dpr = window.devicePixelRatio || 1;
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="highway"]')!;
    const ctx = c.getContext('2d')!;
    const y = c.height - Math.round(30 * dpr);
    const row = ctx.getImageData(0, y, c.width, 1).data;
    // Count light white-key runs along a row just above the bottom edge of the keyboard strip.
    let runs = 0;
    let inKey = false;
    for (let x = 0; x < c.width; x++) {
      const light = row[x * 4]! > 200 && row[x * 4 + 1]! > 200;
      if (light && !inKey) runs++;
      inKey = light;
    }
    return runs;
  });
  expect(shown).toBeGreaterThanOrEqual(8);
  expect(shown).toBeLessThanOrEqual(10);
});

test('a song autoplays to the end on the phone layout', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoApp(page, MARY);
  await expect(page.getByTestId('play-screen')).toHaveAttribute('data-phone', 'true');
  const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
  expect(result).toEqual({ presses: 26, wrongPresses: 0 });
  await expect(page.getByTestId('play-finished')).toBeVisible();
  await expect(page.getByTestId('stat-correct')).toHaveText('26/26');
  await expect(page.getByTestId('see-results')).toBeVisible();
  const vp = page.viewportSize()!;
  const box = await page.getByTestId('play-finished').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
});
