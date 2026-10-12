import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi } from './helpers';

/**
 * Runs in the ipad-landscape (1180 x 820) and ipad-portrait (820 x 1180) projects, locally and against the live
 * site (KEYFALL_BASE_URL). Every URL carries ?debug=1 and is relative to the base URL, like phone.spec.ts.
 */
const MARY = '?debug=1#/play/mary-had-a-little-lamb';

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const portrait = () => test.info().project.name === 'ipad-portrait';

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test('Play shows the song screen, never the turn-your-phone prompt', async ({ page }) => {
  await gotoApp(page, MARY);
  await expect(page.getByTestId('play-ready')).toBeVisible();
  await expect(page.getByTestId('rotate-prompt')).toHaveCount(0);
  const play = page.getByTestId('play-screen');
  await expect(play).toHaveAttribute('data-phone', 'false');
  await expect(play).toHaveAttribute('data-tablet', portrait() ? 'true' : 'false');
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('portrait stacks the song: header rows, falling notes above, keyboard below, everything inside the screen', async ({ page }) => {
  test.skip(!portrait(), 'portrait layout');
  await gotoApp(page, MARY);
  const vp = page.viewportSize()!;
  const head = (await page.locator('.play-head').boundingBox())!;
  // Two rows: the title row and the stats row, not the one-row desktop header and not a clipped one.
  expect(head.height).toBeGreaterThan(100);
  expect(head.height).toBeLessThan(220);
  for (const sel of ['.play-title', '.play-sub', '[data-testid=stat-correct]', '[data-testid=view-split]', '[data-testid=toggle-labels]', '[aria-label=Pause]']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.x, sel).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height, sel).toBeLessThanOrEqual(head.y + head.height + 1);
  }
  // The title is whole, not wrapped letter by letter.
  expect((await page.locator('.play-title').boundingBox())!.height).toBeLessThan(40);
  const canvas = (await page.getByTestId('highway').boundingBox())!;
  expect(canvas.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(canvas.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(vp.height + 1);
  expect(canvas.height).toBeGreaterThan(vp.height * 0.6);
  // 44 px targets.
  for (const sel of ['[aria-label=Pause]', '[data-testid=toggle-labels]', '[data-testid=view-falling]', '[data-testid=play-start]']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.height, sel).toBeGreaterThanOrEqual(44);
    expect(box.width, sel).toBeGreaterThanOrEqual(44);
  }
});

test('portrait split view puts the score above the highway and the keyboard', async ({ page }) => {
  test.skip(!portrait(), 'portrait layout');
  await gotoApp(page, MARY);
  await page.getByTestId('view-split').click();
  const sheet = page.locator('.sheet-pane');
  await expect(sheet).toBeVisible();
  const s = (await sheet.boundingBox())!;
  const c = (await page.getByTestId('highway').boundingBox())!;
  expect(s.y + s.height).toBeLessThanOrEqual(c.y + c.height * 0.5);
  expect(s.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await expect(page.locator('.sheet-pane svg').first()).toBeVisible();
});

test('landscape keeps the full desktop layout', async ({ page }) => {
  test.skip(portrait(), 'landscape layout');
  await gotoApp(page, MARY);
  const head = (await page.locator('.play-head').boundingBox())!;
  expect(head.height).toBeGreaterThanOrEqual(80);
  expect(head.height).toBeLessThanOrEqual(100);
  const canvas = (await page.getByTestId('highway').boundingBox())!;
  expect(canvas.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  // The full layout shows the whole HUD: view switch, names toggle and three stats on one row.
  for (const id of ['view-falling', 'view-sheet', 'view-split', 'toggle-labels', 'stat-correct', 'stat-wrong', 'stat-time']) await expect(page.getByTestId(id)).toBeVisible();
});

test('the other screens fit and every rail destination works in this orientation', async ({ page }) => {
  await gotoApp(page, '?debug=1#/');
  for (const id of ['home', 'learn', 'play', 'stats', 'settings']) await expect(page.getByTestId(`rail-${id}`)).toBeVisible();
  for (const id of ['learn', 'play', 'stats', 'settings', 'home']) {
    await page.getByTestId(`rail-${id}`).click();
    await expect(page.getByTestId(`rail-${id}`)).toHaveAttribute('aria-current', 'page');
    expect(await overflow(page), id).toBeLessThanOrEqual(1);
  }
});

test('a song autoplays to the end and Results fit the screen', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoApp(page, MARY);
  const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
  expect(result).toEqual({ presses: 26, wrongPresses: 0 });
  await expect(page.getByTestId('play-finished')).toBeVisible();
  await expect(page.getByTestId('stat-correct')).toHaveText('26/26');
  const vp = page.viewportSize()!;
  const box = (await page.getByTestId('play-finished').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  await page.getByTestId('see-results').click();
  await expect(page.getByTestId('results')).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('the turn-your-phone prompt is still for phones: an iPad-sized window never shows it, a phone-sized one does', async ({ page }) => {
  await gotoApp(page, MARY);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByTestId('rotate-prompt')).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 1366 });
  await expect(page.getByTestId('rotate-prompt')).toHaveCount(0);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect(page.getByTestId('rotate-prompt')).toBeVisible();
});
