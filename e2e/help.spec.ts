import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, gotoApp, isolateMidi, readStore, switchTo } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const C1 = 24;
const D1 = 26;
const bubble = (page: Page) => page.getByTestId('help-bubble');
const btn = (page: Page, id: string) => page.getByTestId(`help-${id}`);

async function tap(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

/** Dismiss the tips tour so it does not sit above the screen under test. */
async function skipTour(page: Page) {
  await page.goto('./?debug=1#/');
  const skip = page.getByTestId('tour-skip');
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByTestId('tips-tour')).toBeHidden();
}

test.describe('help bubbles', () => {
  test('hover opens a bubble and moving away closes it', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await expect(bubble(page)).toHaveCount(0);
    await btn(page, 'settings.sound').hover();
    await expect(bubble(page)).toBeVisible();
    await expect(bubble(page)).toContainText('Soft chimes');
    await page.mouse.move(5, 5);
    await expect(bubble(page)).toHaveCount(0);
  });

  test('a click pins it open (past the mouse leaving) and the next click closes it', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await btn(page, 'settings.reduceMotion').click();
    await page.mouse.move(5, 5);
    await expect(bubble(page)).toBeVisible();
    await expect(btn(page, 'settings.reduceMotion')).toHaveAttribute('aria-expanded', 'true');
    await btn(page, 'settings.reduceMotion').click();
    await expect(bubble(page)).toHaveCount(0);
  });

  test('keyboard focus opens it, Escape closes it, and it does not trap focus', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await btn(page, 'settings.handHelp').focus();
    await expect(bubble(page)).toContainText('shift drill');
    await expect(btn(page, 'settings.handHelp')).toHaveAttribute('aria-describedby', /.+/);
    await page.keyboard.press('Escape');
    await expect(bubble(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.matches('.help-btn'))).toBe(false);
    await expect(bubble(page)).toHaveCount(0);
  });

  test('a bubble stays on screen at the edges of a narrow window', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoApp(page, './?debug=1#/settings');
    await btn(page, 'settings.pianoNav').focus();
    const box = await bubble(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });

  test('piano keys: D1 steps to an (i) button and shows it, C1 closes it, C1 opens it again', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    for (let i = 0; i < 60 && !(await page.evaluate(() => document.activeElement?.matches('[data-testid="help-settings.pianoNav"]'))); i++) await tap(page, D1);
    await expect(btn(page, 'settings.pianoNav')).toBeFocused();
    await expect(bubble(page)).toContainText('A0 back');
    await tap(page, C1);
    await expect(bubble(page)).toHaveCount(0);
    await tap(page, C1);
    await expect(bubble(page)).toBeVisible();
    await tap(page, D1);
    await expect(bubble(page)).toHaveCount(0);
  });

  test('every (i) button is at least 44 px and has a name', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await expect(btn(page, 'settings.latency')).toBeVisible();
    const boxes = await page.locator('.help-btn').evaluateAll((els) =>
      els.map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, name: e.getAttribute('aria-label') })),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(9);
    for (const b of boxes) {
      expect(b.w).toBeGreaterThanOrEqual(43.5);
      expect(b.h).toBeGreaterThanOrEqual(43.5); // same sub-pixel tolerance as e2e/a11y.spec.ts
      expect(b.name).toMatch(/^Help: .{3,}/);
    }
  });
});

test.describe('help bubbles on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap opens it, a tap elsewhere closes it', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    await btn(page, 'settings.sound').tap();
    await expect(bubble(page)).toBeVisible();
    await page.getByRole('heading', { name: 'Latency check' }).tap();
    await expect(bubble(page)).toHaveCount(0);
    await btn(page, 'settings.sound').tap();
    await expect(bubble(page)).toBeVisible();
    await btn(page, 'settings.sound').tap();
    await expect(bubble(page)).toHaveCount(0);
  });
});

test.describe('help coverage on the screens', () => {
  test('Play setup: every control sits next to a bubble, and the modes and the shift marker are explained', async ({ page }) => {
    await gotoApp(page, './?debug=1#/play/frere-jacques?mode=practice&from=4&to=7');
    await skipTourIfAny(page);
    await expect(page.getByTestId('setup')).toBeVisible();
    for (const id of ['play.mode', 'play.speed', 'play.metronome', 'play.countIn', 'play.drill', 'play.shiftMarker', 'play.positionNames', 'play.loop']) {
      await expect(btn(page, id), id).toBeVisible();
    }
    await page.getByTestId('toggle-drill').click();
    await expect(btn(page, 'play.drillStep')).toBeVisible();
    await page.getByTestId('toggle-drill').click();
    await expect(page.getByTestId('toggle-loop')).toHaveAttribute('aria-pressed', 'true'); // the preset opens with the loop on
    await expect(btn(page, 'play.loopBars')).toBeVisible();
    await btn(page, 'play.mode').click();
    for (const m of ['Wait', 'Practice', 'Full', 'Expert']) await expect(bubble(page)).toContainText(m);
    await btn(page, 'play.shiftMarker').click();
    await expect(bubble(page)).toHaveCount(1); // pressing another (i) closes the first bubble
    await expect(bubble(page)).toContainText('dashed line');
    await expect(bubble(page)).toContainText('Shaded keys');
  });

  test('Play setup: the auto fingers button has a bubble on a song with no fingers', async ({ page }) => {
    // Minuet in G is locked for a new Beginner, so play as Advanced.
    await page.goto('./?debug=1#/play/minuet-in-g?mode=wait');
    await page.getByTestId('app-ready').or(page.getByTestId('profile-picker')).first().waitFor({ state: 'attached' });
    if (await page.getByTestId('profile-picker').isVisible()) await createProfile(page, 'Tester', 'advanced');
    await expect(page.getByTestId('toggle-autofingers')).toBeVisible();
    await btn(page, 'play.autoFingers').focus();
    await expect(bubble(page)).toContainText('(3)');
  });

  test('Play setup: no bubble ever covers Start on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await gotoApp(page, './?debug=1#/play/frere-jacques?mode=wait');
    await expect(page.getByTestId('setup')).toBeVisible();
    await expect(page.getByTestId('play-start')).toBeVisible();
    await btn(page, 'play.mode').focus();
    await expect(bubble(page)).toBeVisible();
  });

  test('Songs: Sort and Hands have bubbles', async ({ page }) => {
    await gotoApp(page, './?debug=1#/songs');
    await btn(page, 'songs.sort').focus();
    await expect(bubble(page)).toContainText('Recent');
    await btn(page, 'songs.hands').focus();
    await expect(bubble(page)).toContainText('Both hands');
  });

  test('Settings: every preference and the About, Latency check and tips tour cards have one', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    for (const id of ['pianoNav', 'sound', 'handHelp', 'autoFingering', 'positionLabels', 'reduceMotion', 'tour', 'about', 'latency']) {
      await expect(btn(page, `settings.${id}`), id).toBeVisible();
    }
  });

  test('Learn: the pass rule and the review list are explained on a unit', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await btn(page, 'learn.pass').focus();
    await expect(bubble(page)).toContainText('18 right');
    await btn(page, 'learn.review').focus();
    await expect(bubble(page)).toContainText('3 times in a row');
  });

  test('Results: terms have bubbles, and B0 steps through them from the piano', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, './?debug=1#/play/mary-had-a-little-lamb?mode=full');
    await page.evaluate(() => window.__keyfall!.autoplay({ wrongKeyRate: 0.3, seed: 2 }));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('see-results').click();
    await expect(page.getByTestId('results')).toBeVisible();
    for (const id of ['score', 'accuracy', 'streak', 'xp', 'timing', 'missed', 'practice', 'board']) await expect(btn(page, `results.${id}`), id).toBeVisible();
    await btn(page, 'results.timing').focus();
    await expect(bubble(page)).toContainText('Within 50 ms');
    await page.getByTestId('results').click({ position: { x: 2, y: 2 } });
    await tap(page, 23); // B0
    await expect(page.locator('.help-btn:focus')).toHaveCount(1);
    await expect(bubble(page)).toBeVisible();
    await tap(page, 23);
    await expect(page.locator('.help-btn:focus')).toHaveCount(1);
    expect(page.url()).toContain('#/results/');
  });
});

async function skipTourIfAny(page: Page) {
  const skip = page.getByTestId('tour-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

test.describe('tips tour', () => {
  test('shows once for a new profile, steps through, and Skip hides it for good (also after a reload)', async ({ page }) => {
    await gotoApp(page, './?debug=1#/');
    const tour = page.getByTestId('tips-tour');
    await expect(tour).toBeVisible();
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 1 of 6');
    await expect(page.getByTestId('tour-back')).toHaveCount(0);
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 2 of 6');
    await page.getByTestId('tour-back').click();
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 1 of 6');
    await page.getByTestId('tour-skip').click();
    await expect(tour).toBeHidden();
    await expect.poll(async () => (await readStore<{ settings: { tipsSeen?: boolean } }>(page, 'profiles'))[0]!.settings.tipsSeen).toBe(true);
    await page.reload();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(tour).toHaveCount(0);
    // Skipping is not Learn practice: it must not count toward a streak.
    expect(await readStore(page, 'learnProgress')).toEqual([]);
  });

  test('finishing the last step also marks it seen; another new profile sees it again', async ({ page }) => {
    await gotoApp(page, './?debug=1#/', 'First');
    for (let i = 0; i < 5; i++) await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 6 of 6');
    await expect(page.getByTestId('tour-text')).toContainText('(i)');
    await expect(page.getByTestId('tour-next')).toHaveCount(0);
    await page.getByTestId('tour-done').click();
    await expect(page.getByTestId('tips-tour')).toBeHidden();
    await switchTo(page, 'Second');
    await expect(page.getByTestId('tips-tour')).toBeVisible();
    await switchTo(page, 'First');
    await expect(page.getByTestId('tips-tour')).toHaveCount(0);
  });

  test('can be run again from Settings', async ({ page }) => {
    await gotoApp(page, './?debug=1#/');
    await skipTour(page);
    await page.goto('./?debug=1#/settings');
    await page.getByTestId('tour-replay').click();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('tips-tour')).toBeVisible();
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 1 of 6');
  });

  test('the tour can be stepped and skipped with the piano keys alone', async ({ page }) => {
    await gotoApp(page, './?debug=1#/');
    // The tour's Next button is the piano-nav default, so the first D1 reaches it. The bound is set by the screen's
    // structure, not the catalog: everything before the tour in page order is the sidebar links and the header
    // controls (well under 20 stops), and Home shows at most 8 song tiles plus All songs after it.
    for (let i = 0; i < 30 && !(await page.evaluate(() => document.activeElement?.matches('[data-testid="tour-next"]'))); i++) await tap(page, D1);
    await expect(page.getByTestId('tour-next')).toBeFocused();
    await tap(page, C1);
    await expect(page.getByTestId('tour-step')).toHaveText('Tip 2 of 6');
    for (let i = 0; i < 10 && !(await page.evaluate(() => document.activeElement?.matches('[data-testid="tour-skip"]'))); i++) await tap(page, D1);
    await tap(page, C1);
    await expect(page.getByTestId('tips-tour')).toBeHidden();
  });
});
