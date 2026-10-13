import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi, readStore, idsBefore, seedPassed } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });


async function press(page: Page, ...midis: number[]) {
  await page.evaluate((ms) => {
    for (const m of ms) window.__keyfall!.press(m);
    for (const m of ms) window.__keyfall!.release(m);
  }, midis);
}

/** Open a unit as a player who has passed every unit before it. */
async function openUnit(page: Page, n: number) {
  await gotoApp(page, './?debug=1#/learn');
  await seedPassed(page, idsBefore(`unit-${n}`));
  await page.goto(`./?debug=1#/learn/unit-${n}`);
}

/** Answer the current prompt from what the screen says is right, then wait for the next prompt or the result. */
async function answer(page: Page, index: number) {
  const el = page.getByTestId('learn-prompt');
  const ans = await el.getAttribute('data-answer');
  if (ans) await page.getByTestId(`choice-${ans}`).click();
  else await press(page, Number(await el.getAttribute('data-target-midi')));
  const next = page.getByTestId('learn-prompt').and(page.locator(`[data-index="${index + 1}"][data-state="asking"]`));
  await next.or(page.getByTestId('learn-result')).first().waitFor();
}

async function passTest(page: Page, n: number, unlockLine: string) {
  await page.getByTestId('learn-start-test').click();
  await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
  for (let i = 0; i < 20; i++) await answer(page, i);
  await expect(page.getByTestId('learn-result')).toBeVisible();
  await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
  await expect(page.getByTestId('learn-result-title')).toHaveText(`Unit ${n} passed`);
  await expect(page.getByTestId('learn-result')).toContainText(unlockLine);
  const rows = await readStore<{ unitId: string; passed: boolean; bestCorrect: number; bestTotal: number }>(page, 'learnProgress');
  expect(rows.find((r) => r.unitId === `unit-${n}`)).toMatchObject({ passed: true, bestCorrect: 20, bestTotal: 20 });
  await page.getByTestId('learn-back').click();
  await expect(page.getByTestId(`learn-unit-${n}`)).toContainText('Passed');
  if (n < 10) await expect(page.getByTestId(`learn-unit-${n + 1}`)).toHaveAttribute('data-status', 'open');
}

test.describe('Learn units 2 to 5', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await isolateMidi(page);
  });

  test('Unit 2: middle C position test passes and unlocks Ode to Joy', async ({ page }) => {
    await openUnit(page, 2);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/learn/unit-2');
    await passTest(page, 2, 'Unlocked: Ode to Joy');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-ode-to-joy')).not.toHaveAttribute('data-locked', 'true');
  });

  test('Unit 3: treble staff test passes and unlocks Jingle Bells', async ({ page }) => {
    await openUnit(page, 3);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-jingle-bells')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/learn/unit-3');
    await passTest(page, 3, 'Unlocked: Jingle Bells');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-jingle-bells')).not.toHaveAttribute('data-locked', 'true');
  });

  test('Unit 4: bass clef position test passes and unlocks When the Saints Go Marching In', async ({ page }) => {
    await openUnit(page, 4);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-when-the-saints-go-marching-in')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/learn/unit-4');
    await passTest(page, 4, 'Unlocked:');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-when-the-saints-go-marching-in')).not.toHaveAttribute('data-locked', 'true');
  });

  test('Unit 5: bass staff test passes, unlocks its songs and opens Unit 6', async ({ page }) => {
    await openUnit(page, 5);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-bach-musette-in-d')).toHaveAttribute('data-locked', 'true');
    await page.goto('./?debug=1#/learn/unit-5');
    await passTest(page, 5, 'Unlocked:');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-bach-musette-in-d')).not.toHaveAttribute('data-locked', 'true');
    await expect(page.getByTestId('song-bach-prelude-in-c')).not.toHaveAttribute('data-locked', 'true');
  });
});
