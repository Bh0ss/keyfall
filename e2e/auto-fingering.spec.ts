import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, gotoApp, isolateMidi, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

// Minuet in G has no finger numbers in its score (level 4), so every finger on screen is the program's.
const MINUET = './?debug=1#/play/minuet-in-g?mode=wait';
// The auto fingers put the right hand's first position change in bar 3 ("thumb → C"); this loop opens a bar before it.
const MINUET_SHIFT = './?debug=1#/play/minuet-in-g?mode=wait&from=3&to=4';
const HOME = './?debug=1#/';
/** Open a URL as an Advanced player, who has every song unlocked (Minuet in G is locked for a new Beginner). */
async function gotoAdvanced(page: Page, url: string) {
  await page.goto(url);
  const ready = page.getByTestId('app-ready');
  const picker = page.getByTestId('profile-picker');
  await ready.or(picker).first().waitFor({ state: 'attached' });
  if (await picker.isVisible()) await createProfile(page, 'Tester', 'advanced');
}
const canvas = (page: Page) => page.getByTestId('highway');

test.describe('auto fingering', () => {
  test('an unfingered song shows auto fingers on the highway with the switch on, and none with it off', async ({ page }) => {
    await gotoAdvanced(page, MINUET);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    const toggle = page.getByTestId('toggle-autofingers');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toContainText('Auto fingers: On');
    await page.getByTestId('play-start').click();
    await expect.poll(async () => Number(await canvas(page).getAttribute('data-auto-fingers')), { timeout: 10_000 }).toBeGreaterThan(0);

    // Off, and the same song draws none. The switch is on the setup card, so start over.
    await page.goto(HOME);
    await page.goto(MINUET);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('toggle-autofingers').click();
    await expect(page.getByTestId('toggle-autofingers')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('toggle-autofingers')).toContainText('Auto fingers: Off');
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', /waiting|playing/, { timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(canvas(page)).toHaveAttribute('data-auto-fingers', '0');
  });

  test('the B1 hand-position help uses the auto fingers: a shift cue and zones with the switch on, none with it off', async ({ page }) => {
    await gotoAdvanced(page, MINUET_SHIFT);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('play-start').click();
    const cue = page.getByTestId('shift-cue');
    await expect(cue).toBeVisible({ timeout: 10_000 });
    await expect(cue).toHaveAttribute('data-hand', 'right');
    await expect(cue).toHaveAttribute('data-measure', '3');
    await expect(page.getByTestId('shift-cue-label')).toHaveText('thumb → C');
    await expect(canvas(page)).toHaveAttribute('data-zone-right', /\d+-\d+/);

    await page.goto(HOME);
    await page.goto(MINUET_SHIFT);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('toggle-autofingers').click();
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', /waiting|playing/, { timeout: 10_000 });
    await page.waitForTimeout(500);
    await expect(cue).toHaveCount(0);
    await expect(canvas(page)).not.toHaveAttribute('data-zone-left', /.+/);
    await expect(canvas(page)).not.toHaveAttribute('data-zone-right', /.+/);
  });

  test('a song with fingers in its score offers no switch and draws no auto fingers', async ({ page }) => {
    await gotoApp(page, './?debug=1#/play/frere-jacques?mode=wait');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('toggle-autofingers')).toHaveCount(0);
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', /waiting|playing/, { timeout: 10_000 });
    await expect(canvas(page)).toHaveAttribute('data-auto-fingers', '0');
  });

  test('the switch is a profile setting: Settings flips it, it is stored, and the setup card follows', async ({ page }) => {
    await gotoAdvanced(page, './?debug=1#/settings');
    const pref = page.getByTestId('pref-autoFingering');
    await expect(pref).toHaveAttribute('aria-checked', 'true');
    await pref.click();
    await expect(pref).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await readStore<{ settings: { autoFingering?: boolean } }>(page, 'profiles'))[0]?.settings.autoFingering).toBe(false);
    await page.goto(MINUET);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('toggle-autofingers')).toHaveAttribute('aria-pressed', 'false');
    // Turning it back on from the setup card is stored too.
    await page.getByTestId('toggle-autofingers').click();
    await expect.poll(async () => (await readStore<{ settings: { autoFingering?: boolean } }>(page, 'profiles'))[0]?.settings.autoFingering).toBe(true);
  });

  test('the score shows the auto fingers in parentheses and italic, and drops them when the switch goes off', async ({ page }) => {
    await gotoAdvanced(page, MINUET);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.getByTestId('view-sheet').click();
    const sheet = page.getByTestId('sheet');
    await expect(sheet).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect.poll(async () => Number(await sheet.getAttribute('data-auto-fingers'))).toBeGreaterThan(0);
    const first = sheet.locator('text.auto-finger').first();
    await expect(first).toHaveText(/^\([1-5]\)$/);
    await expect(first).toHaveAttribute('font-style', 'italic');
    await page.getByTestId('toggle-autofingers').click();
    await expect(sheet).toHaveAttribute('data-auto-fingers', '0');
    await expect(sheet.locator('text.auto-finger')).toHaveCount(0);
  });

  test('the switch is reachable with the piano navigation keys', async ({ page }) => {
    await gotoAdvanced(page, MINUET);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    const tap = (midi: number) =>
      page.evaluate((m) => {
        window.__keyfall!.press(m);
        window.__keyfall!.release(m);
      }, midi);
    const onSwitch = () => page.evaluate(() => document.activeElement?.matches('[data-testid=toggle-autofingers]') ?? false);
    for (let i = 0; i < 30 && !(await onSwitch()); i++) await tap(26); // D1: next
    expect(await onSwitch()).toBe(true);
    await tap(24); // C1: select
    await expect(page.getByTestId('toggle-autofingers')).toHaveAttribute('aria-pressed', 'false');
  });
});
