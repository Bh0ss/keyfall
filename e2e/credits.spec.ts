import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const A0 = 21;
const C1 = 24;
const D1 = 26;

async function tap(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

async function stepTo(page: Page, selector: string, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector)) return;
    await tap(page, D1);
  }
  throw new Error(`The selection never reached ${selector}`);
}

test.describe('credits', () => {
  test('is reachable from Settings and from the rail', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await page.getByTestId('credits-link').click();
    await expect(page).toHaveURL(/#\/credits$/);
    await expect(page.getByTestId('credits')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Credits' })).toBeVisible();

    await page.goto('./?debug=1#/songs');
    await page.getByTestId('rail-credits').click();
    await expect(page).toHaveURL(/#\/credits$/);
    await expect(page.getByTestId('rail-credits')).toHaveAttribute('aria-current', 'page');
  });

  test('shows the project, the CC BY-SA attributions with links, and every library and font', async ({ page }) => {
    await gotoApp(page, './?debug=1#/credits');
    const about = page.getByTestId('credits-about');
    await expect(about).toContainText('Keyfall');
    await expect(about).not.toContainText('non-commercial');
    await expect(about).toContainText('personal project');
    await expect(about).toContainText('MIT licence');
    await expect(about).toContainText('keep their own terms');
    await expect(page.getByTestId('credits-licence').getByRole('link', { name: 'MIT licence' })).toHaveAttribute('href', 'https://github.com/Bh0ss/keyfall/blob/main/LICENSE');
    const repo = page.getByTestId('credits-repo');
    await expect(repo).toHaveAttribute('href', 'https://github.com/Bh0ss/keyfall');
    await expect(repo).toHaveAttribute('target', '_blank');
    await expect(repo).toHaveAttribute('rel', 'noopener noreferrer');

    const licensed = page.getByTestId('credits-licensed');
    await expect(licensed).toContainText('Benjamin Esham');
    await expect(licensed).toContainText('Philippe Hezaine');
    await expect(licensed).toContainText('this one file only');
    await expect(licensed).toContainText('these files only');
    await expect(licensed.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
    await expect(licensed.getByRole('link', { name: 'CC BY-SA 2.5' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/2.5/');
    for (const id of [509, 647, 659]) {
      await expect(licensed.locator(`a[href$="id=${id}"]`)).toHaveCount(1);
    }

    await expect(page.getByTestId('credits-mutopia-pd')).toContainText('Keith OHara');
    await expect(page.getByTestId('credits-folk')).toContainText('Frère Jacques');

    const libs = page.getByTestId('credits-library-list');
    for (const [name, licence] of [
      ['OpenSheetMusicDisplay', 'BSD-3-Clause'],
      ['VexFlow', 'MIT'],
      ['@tonejs/midi', 'MIT'],
      ['Basic Pitch', 'Apache-2.0'],
      ['TensorFlow.js', 'Apache-2.0'],
      ['Dexie', 'Apache-2.0'],
      ['supabase-js', 'MIT'],
      ['React', 'MIT'],
    ]) {
      await expect(libs.locator('li', { hasText: name }), name).toContainText(licence!);
    }
    const fonts = page.getByTestId('credits-font-list');
    for (const name of ['Bricolage Grotesque', 'DM Sans', 'JetBrains Mono']) await expect(fonts.locator('li', { hasText: name })).toContainText('OFL-1.1');

    // Every external link opens safely in a new tab.
    const external = await page.locator('main a[href^="http"]').evaluateAll((els) => els.map((a) => [a.getAttribute('target'), a.getAttribute('rel')]));
    expect(external.length).toBeGreaterThan(5);
    for (const [target, rel] of external) {
      expect(target).toBe('_blank');
      expect(rel).toBe('noopener noreferrer');
    }
  });

  test('is reachable and operable with the five piano keys alone', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await stepTo(page, '[data-testid=credits-link]');
    await tap(page, C1);
    await expect(page).toHaveURL(/#\/credits$/);
    await expect(page.getByTestId('credits')).toBeVisible();

    // D1 steps through the links and shows a visible ring; the licence link is reachable.
    await stepTo(page, '[data-testid=credits-repo]');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(3);
    await stepTo(page, 'a[href="https://creativecommons.org/licenses/by-sa/4.0/"]');

    // A0 goes back to Home, then the rail is reachable from Home too.
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/$/);
    await stepTo(page, '[data-testid=rail-credits]');
    await tap(page, C1);
    await expect(page).toHaveURL(/#\/credits$/);
  });
});
