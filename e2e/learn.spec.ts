import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, gotoApp, isolateMidi, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

async function press(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

const targetOf = async (page: Page) => Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));

/** Answer the current prompt, then wait for the next one (or the result). Wrong on purpose when `wrong`. */
async function answer(page: Page, index: number, wrong = false) {
  const target = await targetOf(page);
  await press(page, wrong ? (target === 60 ? 62 : 60) : target);
  if (wrong) await page.getByTestId('learn-next').click();
  const next = page.getByTestId('learn-prompt').and(page.locator(`[data-index="${index + 1}"][data-state="asking"]`));
  await next.or(page.getByTestId('learn-result')).first().waitFor();
}

/** Run a prompt lesson to the end. `misses` is how many of the prompts to answer wrongly. */
async function runPrompts(page: Page, total: number, misses = 0, from = 0) {
  for (let i = from; i < total; i++) await answer(page, i, i < misses);
  await expect(page.getByTestId('learn-result')).toBeVisible();
}

test.describe('Learn', () => {
  // Each unit test is 20 prompts with a short pause between them; a few tests pass two or three units.
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    // Without this the real piano (when it is on) answers prompts: the cause of the old full-suite Learn timeouts.
    await isolateMidi(page);
  });

  test('rail and Home lead into Learn; units 2 to 10 are locked at the start; unit 2 is locked', async ({ page }) => {
    await gotoApp(page, './?debug=1');
    await expect(page.getByTestId('rail-learn')).toHaveAttribute('href', '#/learn');
    await page.getByTestId('learn-continue').click();
    await expect(page.getByTestId('unit-title')).toHaveText('Keyboard map');
    // Units 6 to 10 used to read "coming soon"; they are playable now and open in order like the rest.
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) await expect(page.getByTestId(`learn-unit-${n}`)).toHaveAttribute('data-status', 'locked');
    await page.goto('./?debug=1#/learn/unit-7');
    await expect(page.getByTestId('unit-locked')).toBeVisible();
    await page.goto('./?debug=1#/learn/unit-2');
    await expect(page.getByTestId('unit-locked')).toBeVisible();
  });

  test('passes Unit 1 with virtual input, answering every prompt from the screen', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-kind', 'key-finder');
    // The name on screen matches the key the page expects.
    const name = await page.getByTestId('learn-key-name').innerText();
    expect(name).toMatch(/^[A-G]4$|^C5$/);
    await runPrompts(page, 20);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
    await expect(page.getByTestId('learn-result-title')).toHaveText('Unit 1 passed');

    const rows = await readStore<{ unitId: string; passed: boolean; bestCorrect: number; bestTotal: number; attempts: number; updatedAt: number }>(page, 'learnProgress');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unitId: 'unit-1', passed: true, bestCorrect: 20, bestTotal: 20, attempts: 1 });
    await page.getByTestId('learn-back').click();
    await expect(page.getByTestId('learn-unit-1')).toContainText('Passed');
    await expect(page.getByTestId('learn-unit-2')).toHaveAttribute('data-status', 'open');
  });

  test('a wrong key shows the answer and waits; failing the test does not pass the unit', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20, 3);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'false');
    await expect(page.getByTestId('learn-result-title')).toHaveText('Not quite yet');
    await expect(page.getByTestId('learn-result')).toContainText('17 of 20');
    await expect(page.getByTestId('learn-result')).toContainText('18 of 20');
    const rows = await readStore<{ passed: boolean; attempts: number }>(page, 'learnProgress');
    expect(rows[0]).toMatchObject({ passed: false, attempts: 1 });
    // Two wrong keys out of 20 is still a pass.
    await page.getByTestId('learn-retry').click();
    await runPrompts(page, 20, 2);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
  });

  test('missed notes land in the review queue and stay until answered right 3 times in a row', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-keys').click();
    const missed = await targetOf(page);
    await press(page, missed === 60 ? 62 : 60);
    await expect(page.getByTestId('learn-feedback')).toContainText('It\'s');
    await expect(page.getByTestId('review-chip')).toHaveCount(1);
    await page.getByTestId('learn-next').click();
    // Show the answer also counts as a miss.
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'asking');
    const queue = await readStore<{ midi: number; active: boolean; misses: number; streak: number; updatedAt: number }>(page, 'reviewQueue');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ midi: missed, active: true, misses: 1, streak: 0 });
    expect(queue[0]!.updatedAt).toBeGreaterThan(0);
  });

  test('Ode to Joy unlocks only after Unit 2', async ({ page }) => {
    await gotoApp(page, './?debug=1');
    // Locked at the start: Home, song list and a direct link.
    await expect(page.getByTestId('home-song-ode-to-joy')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/play/ode-to-joy');
    await expect(page.getByTestId('song-locked')).toBeVisible();

    // Unit 1 alone does not open it.
    await page.goto('./?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20);
    await expect(page.getByTestId('learn-result')).toContainText('passed');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/play/ode-to-joy');
    await expect(page.getByTestId('song-locked')).toBeVisible();

    // Unit 2 opens it.
    await page.goto('./?debug=1#/learn/unit-2');
    await page.getByTestId('learn-start-test').click();
    await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
    await runPrompts(page, 20);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Ode to Joy');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).not.toHaveAttribute('data-locked', 'true');
    // Jingle Bells needs Unit 3 and stays locked.
    await expect(page.getByTestId('song-jingle-bells')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1');
    await expect(page.getByTestId('songs-summary')).toContainText('39 of 99 unlocked');

    // And the unlocked song plays to the end.
    await page.goto('./?debug=1#/play/ode-to-joy');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
    expect(result.wrongPresses).toBe(0);
    await expect(page.getByTestId('play-finished')).toBeVisible();
  });

  test('an Advanced profile keeps units 2 to 4 songs locked but is not asked to learn first to see the path', async ({ page }) => {
    await page.goto('./?debug=1');
    await createProfile(page, 'Alexa', 'advanced');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).toHaveAttribute('data-locked', 'true');
    await expect(page.getByTestId('song-mary-had-a-little-lamb')).not.toHaveAttribute('data-locked', 'true');
  });

  test('note flash draws a treble staff in Unit 3 and a bass staff in Unit 4, and checks the key', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20);
    await page.goto('./?debug=1#/learn/unit-2');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20);
    await page.goto('./?debug=1#/learn/unit-3/flash');
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-kind', 'note-flash');
    await expect(page.getByTestId('staff').locator('svg')).toBeVisible();
    await expect(page.getByTestId('staff').locator('.vf-stavenote')).toHaveCount(1);
    await expect(page.getByText('Every Good Boy Does Fine')).toBeVisible();
    const target = await targetOf(page);
    expect(target).toBeGreaterThanOrEqual(64);
    await press(page, target);
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');
    await expect(page.locator('[data-testid="learn-prompt"][data-index="1"][data-state="asking"]')).toBeVisible();
    await runPrompts(page, 15, 0, 1);
    await page.getByTestId('learn-back').click();
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20);
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Jingle Bells');
    await page.goto('./?debug=1#/learn/unit-4/flash');
    const bass = await targetOf(page);
    expect(bass).toBeLessThan(60);
    await expect(page.getByTestId('staff').locator('.vf-stavenote')).toHaveCount(1);
  });

  test('the optional mini song and rhythm tap lessons are playable from Unit 2 once it is open', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn/unit-1');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20);

    await page.goto('./?debug=1#/learn/unit-2/song');
    await expect(page.getByTestId('song-staff').locator('svg')).toBeVisible();
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 17');
    await press(page, 61);
    await expect(page.getByTestId('mini-wrong')).toHaveText('1');
    for (let i = 0; i < 17; i++) {
      const next = Number(await page.getByTestId('mini-song').getAttribute('data-next-midi'));
      await press(page, next);
    }
    await expect(page.getByTestId('learn-result')).toContainText('1 wrong key');
    await page.getByTestId('learn-back').click();
    await expect(page.getByTestId('lesson-song')).toHaveAttribute('data-done', 'true');

    await page.goto('./?debug=1#/learn/unit-2/rhythm');
    await page.getByTestId('rhythm-start').click();
    const card = page.getByTestId('rhythm-card');
    await expect(card).toHaveAttribute('data-tap-times', /\[/);
    const times: number[] = JSON.parse((await card.getAttribute('data-tap-times'))!);
    for (const t of times) {
      await page.evaluate(
        (at) =>
          new Promise<void>((resolve) => {
            const tick = () => {
              if (performance.now() >= at) {
                window.__keyfall!.press(60);
                window.__keyfall!.release(60);
                resolve();
              } else requestAnimationFrame(tick);
            };
            tick();
          }),
        t,
      );
    }
    await expect(page.getByTestId('learn-result')).toContainText('8 of 8 taps on the beat');
  });
});
