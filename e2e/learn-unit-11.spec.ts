import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi, readStore, idsBefore, seedPassed } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });


async function press(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

/** Open a unit as a player who has passed every unit before it. */
async function openUnit(page: Page, n: number, lesson = '') {
  await gotoApp(page, './?debug=1#/learn');
  await seedPassed(page, idsBefore(`unit-${n}`));
  await page.goto(`./?debug=1#/learn/unit-${n}${lesson ? `/${lesson}` : ''}`);
}

const targetOf = async (page: Page) => Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));

/** Answer the current prompt (wrong on purpose when asked), then wait for the next prompt or the result. */
async function answer(page: Page, index: number, wrong = false) {
  const target = await targetOf(page);
  await press(page, wrong ? (target === 60 ? 62 : 60) : target);
  if (wrong) await page.getByTestId('learn-next').click();
  const next = page.getByTestId('learn-prompt').and(page.locator(`[data-index="${index + 1}"][data-state="asking"]`));
  await next.or(page.getByTestId('learn-result')).first().waitFor();
}

async function runPrompts(page: Page, total: number, misses = 0) {
  for (let i = 0; i < total; i++) await answer(page, i, i < misses);
  await expect(page.getByTestId('learn-result')).toBeVisible();
}

/** Play a mini song to the end by reading the next key off the page. */
async function playSong(page: Page, notes: number) {
  const song = page.getByTestId('mini-song');
  for (let i = 0; i < notes; i++) await press(page, Number(await song.getAttribute('data-next-midi')));
}

test.describe('Learn explainer cards', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await isolateMidi(page);
  });

  test('cards show first, step with Next and Back, skip, and come back from the unit', async ({ page }) => {
    await openUnit(page, 2);
    const intro = page.getByTestId('unit-intro');
    await expect(intro).toBeVisible();
    await expect(page.getByTestId('intro-step')).toHaveText('Before you start · 1 of 3');
    await expect(page.getByTestId('intro-title')).toHaveText('Sit so your hands can relax');
    await expect(page.getByTestId('diagram-posture')).toBeVisible();
    // The lessons stay usable underneath the cards.
    await expect(page.getByTestId('learn-start-test')).toBeVisible();

    await page.getByTestId('intro-next').click();
    await expect(page.getByTestId('intro-title')).toHaveText('Fingers have numbers');
    await expect(page.getByTestId('diagram-hands')).toBeVisible();
    await page.getByTestId('intro-back').click();
    await expect(page.getByTestId('intro-step')).toHaveText('Before you start · 1 of 3');

    await page.getByTestId('intro-skip').click();
    await expect(intro).toHaveCount(0);
    await expect(page.getByTestId('intro-open')).toBeVisible();
    await expect(page.getByTestId('learn-start-test')).toBeVisible();
    const rows = await readStore<{ unitId: string; lessonsDone: string[]; passed: boolean }>(page, 'learnProgress');
    expect(rows.find((r) => r.unitId === 'unit-2')).toMatchObject({ lessonsDone: ['intro'], passed: false });

    // Remembered: after a reload the cards stay closed, and the button opens them again.
    await page.reload();
    await expect(page.getByTestId('intro-open')).toBeVisible();
    await expect(page.getByTestId('unit-intro')).toHaveCount(0);
    await page.getByTestId('intro-open').click();
    await expect(page.getByTestId('intro-step')).toHaveText('Before you start · 1 of 3');
    await page.getByTestId('intro-next').click();
    await page.getByTestId('intro-next').click();
    await page.getByTestId('intro-done').click();
    await expect(page.getByTestId('unit-intro')).toHaveCount(0);
  });

  test('dismissing the cards does not mark any lesson in the unit list as done', async ({ page }) => {
    await openUnit(page, 2);
    await page.getByTestId('intro-skip').click();
    await expect(page.getByTestId('intro-open')).toBeVisible();
    for (const id of ['keys', 'flash', 'rhythm', 'song', 'test']) await expect(page.getByTestId(`lesson-${id}`)).not.toHaveAttribute('data-done', 'true');
  });

  test('the cards are operable with the piano command keys (D1 next control, C1 select)', async ({ page }) => {
    const D1 = 26;
    const C1 = 24;
    const stepTo = async (testId: string) => {
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testId)) return;
        await press(page, D1);
      }
      throw new Error(`The selection never reached ${testId}`);
    };
    await openUnit(page, 2);
    await expect(page.getByTestId('intro-step')).toHaveText('Before you start · 1 of 3');
    await stepTo('intro-next');
    await press(page, C1);
    await expect(page.getByTestId('intro-step')).toHaveText('Before you start · 2 of 3');
    await stepTo('intro-skip');
    await press(page, C1);
    await expect(page.getByTestId('unit-intro')).toHaveCount(0);
  });

  test('every unit has cards with a diagram, and the last card closes them', async ({ page }) => {
    const diagram: Record<number, string[]> = {
      1: ['keyboard'],
      2: ['posture', 'hands', 'keyboard'],
      3: ['staff'],
      4: ['keyboard', 'hands'],
      5: ['staff'],
      6: ['beats'],
      7: ['keyboard'],
      8: ['keyboard'],
      9: ['beats'],
      10: ['keyboard'],
      11: ['keyboard', 'keyboard'],
    };
    await gotoApp(page, './?debug=1#/learn');
    for (let n = 1; n <= 11; n++) {
      await seedPassed(page, idsBefore(`unit-${n}`));
      await page.goto(`./?debug=1#/learn/unit-${n}`);
      const kinds = diagram[n]!;
      await expect(page.getByTestId('intro-step')).toHaveText(`Before you start · 1 of ${kinds.length}`);
      for (let i = 0; i < kinds.length; i++) {
        await expect(page.getByTestId(`diagram-${kinds[i]}`)).toBeVisible();
        await expect(page.getByTestId('unit-intro').locator('svg[role="img"]')).toHaveAttribute('aria-label', /.{15,}/);
        if (i < kinds.length - 1) await page.getByTestId('intro-next').click();
      }
      await page.getByTestId('intro-done').click();
      await expect(page.getByTestId('unit-intro')).toHaveCount(0);
    }
  });
});

test.describe('Learn unit 11: Moving around the keyboard', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await isolateMidi(page);
  });

  test('is on the path as Unit 9, right after Both hands, and opens only after Unit 8', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn');
    await expect(page.getByTestId('learn-unit-11')).toHaveAttribute('data-status', 'locked');
    await seedPassed(page, idsBefore('unit-8'));
    await page.goto('./?debug=1#/learn/unit-11');
    await expect(page.getByTestId('unit-locked')).toBeVisible();
    await seedPassed(page, idsBefore('unit-11'));
    await page.reload();
    await expect(page.getByTestId('learn-unit-11')).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('unit-title')).toHaveText('Moving around the keyboard');
    await expect(page.getByTestId('unit-unlocks')).toHaveCount(0);
    for (const id of ['landmarks', 'anchors', 'shift', 'homes', 'test']) await expect(page.getByTestId(`lesson-${id}`)).toBeVisible();
  });

  test('the eyes-off lesson hides the keyboard until you press, then shows it', async ({ page }) => {
    await openUnit(page, 11, 'anchors');
    await expect(page.getByTestId('learn-count')).toHaveText('1 / 12');
    await expect(page.getByTestId('eyes-off-note')).toBeVisible();
    await expect(page.getByTestId('mini-keyboard')).toHaveCount(0);
    // Only C, F and G are asked.
    const t = await targetOf(page);
    expect([0, 5, 7]).toContain(t % 12);
    await press(page, t);
    await expect(page.getByTestId('mini-keyboard')).toBeVisible();
    await expect(page.getByTestId('eyes-off-note')).toHaveCount(0);
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');
  });

  test('a wrong key in the eyes-off lesson shows the keyboard with the answer', async ({ page }) => {
    await openUnit(page, 11, 'anchors');
    const t = await targetOf(page);
    await press(page, t === 60 ? 62 : 60);
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'wrong');
    await expect(page.getByTestId('mini-keyboard')).toBeVisible();
    await expect(page.locator('[data-mark="target"]').first()).toBeVisible();
  });

  test('plays both shift drills to the end', async ({ page }) => {
    await openUnit(page, 11, 'shift');
    await playSong(page, 21);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');
    await page.goto('./?debug=1#/learn/unit-11/homes');
    await playSong(page, 29);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');
    const rows = await readStore<{ unitId: string; lessonsDone: string[] }>(page, 'learnProgress');
    expect(rows.find((r) => r.unitId === 'unit-11')!.lessonsDone).toEqual(expect.arrayContaining(['shift', 'homes']));
  });

  test('a missed key joins the review queue, and the unit test passes at 18 of 20 with virtual input', async ({ page }) => {
    await openUnit(page, 11);
    await page.getByTestId('learn-start-test').click();
    await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-kind', 'key-finder');
    await expect(page.getByTestId('mini-keyboard')).toBeVisible();
    await runPrompts(page, 20, 2);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
    await expect(page.getByTestId('learn-result-title')).toHaveText('Unit 9 passed');
    await expect(page.getByTestId('learn-result')).toContainText('18 of 20');
    const rows = await readStore<{ unitId: string; passed: boolean; bestCorrect: number }>(page, 'learnProgress');
    expect(rows.find((r) => r.unitId === 'unit-11')).toMatchObject({ passed: true, bestCorrect: 18 });
    // The two misses were queued (they may be cleared again by later right answers, so check they were recorded).
    const review = await readStore<{ misses: number }>(page, 'reviewQueue');
    expect(review.reduce((a, r) => a + r.misses, 0)).toBeGreaterThanOrEqual(2);
  });

  test('17 of 20 does not pass', async ({ page }) => {
    await openUnit(page, 11);
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20, 3);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'false');
    const rows = await readStore<{ unitId: string; passed: boolean }>(page, 'learnProgress');
    expect(rows.find((r) => r.unitId === 'unit-11')).toMatchObject({ passed: false });
  });
});
