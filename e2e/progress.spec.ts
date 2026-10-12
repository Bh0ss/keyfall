import { expect, test, type Page } from '@playwright/test';
import { gotoApp, isolateMidi, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await isolateMidi(page);
});

const press = (page: Page, midi: number) =>
  page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);

/** Play Mary to the end in Full mode at +0 ms (26 notes, 3 stars, no mistakes). */
async function playMary(page: Page) {
  await page.goto('/#/play/mary-had-a-little-lamb');
  await page.getByTestId('mode-full').click();
  await page.evaluate(() => window.__keyfall!.autoplay({}));
  await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
}

test.describe('XP, levels, streak, badges', () => {
  test('a new profile starts at level 1 with no streak and no badges', async ({ page }) => {
    await gotoApp(page, '/#/');
    const strip = page.getByTestId('progress-strip');
    await expect(strip).toBeVisible();
    await expect(page.getByTestId('level-bar-level')).toHaveText('Level 1');
    await expect(page.getByTestId('level-bar-xp')).toHaveText('0 XP · 100 to level 2');
    await expect(page.getByTestId('streak-chip')).toHaveAttribute('data-days', '0');
    await expect(page.getByTestId('badge-count')).toHaveText('0 of 17 badges');
  });

  test('finishing a song earns XP, a level, a streak day and badges; Results, Home and Stats agree', async ({ page }) => {
    await gotoApp(page, '/#/');
    await playMary(page);
    // The end card already celebrates: level 2 (179 XP) and the first badges.
    const card = page.getByTestId('play-finished').getByTestId('earned-card');
    await expect(card.getByTestId('level-up')).toContainText('Level up');
    for (const id of ['first-song', 'three-stars', 'flawless']) await expect(card.getByTestId(`earned-${id}`)).toBeVisible();

    await page.getByTestId('see-results').click();
    await expect(page.getByTestId('results-xp')).toHaveText('+179 XP');
    await expect(page.getByTestId('results-level')).toHaveText('Level 2 · 121 XP to level 3');
    await expect(page.getByTestId('results').getByTestId('earned-card').getByTestId('earned-first-song')).toBeVisible();

    // The attempt remembers what it earned, and the profile when each badge was first seen.
    const [attempt] = await readStore<{ newBadges: string[]; levelFrom: number; levelTo: number; xp: number }>(page, 'attempts');
    expect(attempt).toMatchObject({ levelFrom: 1, levelTo: 2, xp: 179 });
    expect(attempt!.newBadges).toEqual(expect.arrayContaining(['first-song', 'three-stars', 'flawless']));
    const [profile] = await readStore<{ badges: Record<string, number> }>(page, 'profiles');
    expect(Object.keys(profile!.badges).sort()).toEqual([...attempt!.newBadges].sort());

    await page.goto('/#/');
    await expect(page.getByTestId('level-bar-level')).toHaveText('Level 2');
    await expect(page.getByTestId('level-bar-xp')).toHaveText('179 XP · 121 to level 3');
    await expect(page.getByTestId('streak-chip')).toHaveAttribute('data-days', '1');
    await expect(page.getByTestId('streak-chip')).toContainText('1-day streak');
    await expect(page.getByTestId('badge-count')).toHaveText('3 of 17 badges');

    await page.goto('/#/stats');
    await expect(page.getByTestId('stats-xp')).toHaveText('179 XP');
    await expect(page.getByTestId('badges-count')).toHaveText('3 of 17 earned');
    await expect(page.getByTestId('badge-flawless')).toHaveAttribute('data-earned', 'true');
    await expect(page.getByTestId('badge-hot-streak')).toHaveAttribute('data-earned', 'false');
    await expect(page.getByTestId('stats-longest-streak')).toHaveText('Longest streak: 1 day');

    // A second perfect run earns more XP but no badge twice.
    await playMary(page);
    // 358 XP is level 3, but no badge is earned twice.
    const again = page.getByTestId('play-finished').getByTestId('earned-card');
    await expect(again.getByTestId('level-up')).toContainText('level 3');
    await expect(again.locator('[data-testid^="earned-"]')).toHaveCount(0);
    await page.goto('/#/stats');
    await expect(page.getByTestId('stats-xp')).toHaveText('358 XP');
    await expect(page.getByTestId('stats-level-level')).toHaveText('Level 3');
  });

  test('a streak that is alive but not played today says so', async ({ page }) => {
    await gotoApp(page, '/#/');
    // Yesterday and the day before: write two attempts straight into the app database.
    const [profile] = await readStore<{ id: string }>(page, 'profiles');
    await page.evaluate(
      (pid) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('keyfall');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('attempts', 'readwrite');
            for (const back of [1, 2]) {
              const d = new Date();
              d.setDate(d.getDate() - back);
              d.setHours(12, 0, 0, 0);
              tx.objectStore('attempts').put({
                id: `seed-${back}`, profileId: pid, songId: 'mary-had-a-little-lamb', mode: 'wait', speedPct: 100, loop: null, score: 100, accuracy: 0.5, stars: 0,
                hits: 13, total: 26, longestStreak: 3, grades: { perfect: 0, great: 0, good: 0, miss: 0 }, misses: [], hitOffsets: [], wait: null, xp: 52,
                finishedAt: d.getTime(), updatedAt: d.getTime(),
              });
            }
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      profile!.id,
    );
    await page.reload();
    await expect(page.getByTestId('streak-chip')).toHaveAttribute('data-days', '2');
    await expect(page.getByTestId('streak-chip')).toContainText('play today to keep it');
    await playMary(page);
    await page.goto('/#/');
    await expect(page.getByTestId('streak-chip')).toHaveAttribute('data-days', '3');
    await expect(page.getByTestId('streak-chip')).not.toContainText('play today');
  });

  test('passing a Learn unit adds XP, a badge and a level, with the same celebration on the end card', async ({ page }) => {
    await gotoApp(page, '/#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    for (let i = 0; i < 20; i++) {
      const target = Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));
      await press(page, target);
      await page
        .getByTestId('learn-prompt')
        .and(page.locator(`[data-index="${i + 1}"][data-state="asking"]`))
        .or(page.getByTestId('learn-result'))
        .first()
        .waitFor();
    }
    const result = page.getByTestId('learn-result');
    await expect(result).toContainText('Level up! You are level 2.');
    await expect(result).toContainText('New badge: ');
    await page.goto('/#/stats');
    await expect(page.getByTestId('stats-xp')).toHaveText('150 XP');
    await expect(page.getByTestId('badge-learn-first-unit')).toHaveAttribute('data-earned', 'true');
  });
});

test.describe('sound and motion', () => {
  /** Count the oscillators the page asks Web Audio for. */
  async function countOscillators(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __osc: number };
      w.__osc = 0;
      const proto = AudioContext.prototype;
      const orig = proto.createOscillator;
      proto.createOscillator = function (this: AudioContext) {
        w.__osc++;
        return orig.call(this);
      };
    });
  }
  const oscillators = (page: Page) => page.evaluate(() => (window as unknown as { __osc: number }).__osc);

  test('menu sounds play, and the Sounds switch silences them for the profile', async ({ page }) => {
    await countOscillators(page);
    await gotoApp(page, '/#/songs');
    await press(page, 26); // D1: next
    await expect.poll(() => oscillators(page)).toBeGreaterThan(0);

    await page.goto('/#/settings');
    await page.getByTestId('pref-sound').click();
    await expect(page.getByTestId('pref-sound')).toHaveAttribute('aria-checked', 'false');
    const before = await oscillators(page);
    await press(page, 26);
    await press(page, 24);
    await page.waitForTimeout(300);
    expect(await oscillators(page)).toBe(before);
    // It is remembered with the profile.
    await expect.poll(async () => (await readStore<{ settings: { sound?: boolean } }>(page, 'profiles'))[0]!.settings.sound).toBe(false);
  });

  test('Reduce animation and the system setting both turn the animations off', async ({ page }) => {
    await gotoApp(page, '/#/');
    const duration = () => page.getByTestId('progress-strip').evaluate(() => parseFloat(getComputedStyle(document.querySelector('.main')!).animationDuration));
    expect(await duration()).toBeGreaterThan(0.1);
    await page.goto('/#/settings');
    await page.getByTestId('pref-reduceMotion').click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await expect.poll(async () => (await readStore<{ settings: { reduceMotion?: boolean } }>(page, 'profiles'))[0]!.settings.reduceMotion).toBe(true);
    await page.goto('/#/');
    await expect(page.getByTestId('progress-strip')).toBeVisible();
    expect(await duration()).toBeLessThan(0.001);

    await page.goto('/#/settings');
    await page.getByTestId('pref-reduceMotion').click();
    await expect.poll(async () => (await readStore<{ settings: { reduceMotion?: boolean } }>(page, 'profiles'))[0]!.settings.reduceMotion).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/');
    await expect(page.getByTestId('progress-strip')).toBeVisible();
    expect(await duration()).toBeLessThan(0.001);
  });
});
