import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi, readStore, seedPassed } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

const unitIds = (upTo: number) => Array.from({ length: upTo }, (_, i) => `unit-${i + 1}`);

async function press(page: Page, ...midis: number[]) {
  await page.evaluate((ms) => {
    for (const m of ms) window.__keyfall!.press(m);
    for (const m of ms) window.__keyfall!.release(m);
  }, midis);
}

/** Open a unit as a player who has passed every unit before it. */
async function openUnit(page: Page, n: number, lesson = '') {
  await gotoApp(page, './?debug=1#/learn');
  await seedPassed(page, unitIds(n - 1));
  await page.goto(`./?debug=1#/learn/unit-${n}${lesson ? `/${lesson}` : ''}`);
}

interface Card {
  kind: string;
  target: number;
  answer: string | null;
  set: number[] | null;
}

async function card(page: Page): Promise<Card> {
  const el = page.getByTestId('learn-prompt');
  const attr = async (name: string) => el.getAttribute(name);
  const set = await attr('data-target-set');
  return { kind: (await attr('data-kind'))!, target: Number(await attr('data-target-midi')), answer: await attr('data-answer'), set: set ? JSON.parse(set) : null };
}

/** Answer the current prompt from what the screen says is right (or wrong on purpose), then wait for the next prompt or the result. */
async function answer(page: Page, index: number, wrong = false) {
  const c = await card(page);
  if (c.answer) {
    const choices = page.getByTestId('choices').locator('button');
    if (wrong) {
      const ids = await choices.evaluateAll((bs) => bs.map((b) => b.getAttribute('data-testid')!));
      await page.getByTestId(ids.find((id) => id !== `choice-${c.answer}`)!).click();
    } else await page.getByTestId(`choice-${c.answer}`).click();
  } else if (c.set) {
    await press(page, ...(wrong ? [c.set[0]!, 61] : c.set));
  } else {
    await press(page, wrong ? (c.target === 60 ? 62 : 60) : c.target);
  }
  if (wrong) await page.getByTestId('learn-next').click();
  const next = page.getByTestId('learn-prompt').and(page.locator(`[data-index="${index + 1}"][data-state="asking"]`));
  await next.or(page.getByTestId('learn-result')).first().waitFor();
}

async function runPrompts(page: Page, total: number, misses = 0) {
  for (let i = 0; i < total; i++) await answer(page, i, i < misses);
  await expect(page.getByTestId('learn-result')).toBeVisible();
}

async function passTest(page: Page, n: number) {
  await page.getByTestId('learn-start-test').click();
  await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
  await runPrompts(page, 20);
  await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
  await expect(page.getByTestId('learn-result-title')).toHaveText(`Unit ${n} passed`);
  const rows = await readStore<{ unitId: string; passed: boolean; bestCorrect: number; bestTotal: number }>(page, 'learnProgress');
  expect(rows.find((r) => r.unitId === `unit-${n}`)).toMatchObject({ passed: true, bestCorrect: 20, bestTotal: 20 });
}

/** Tap middle C at the times the page says (debug attribute), then wait for the verdict. */
async function tapPattern(page: Page, lesson: string, expectedLine: RegExp) {
  await page.goto(`./?debug=1#/learn/unit-${lesson.split(':')[0]}/${lesson.split(':')[1]}`);
  await page.getByTestId('rhythm-start').click();
  const rhythmCard = page.getByTestId('rhythm-card');
  await expect(rhythmCard).toHaveAttribute('data-tap-times', /\[/);
  await expect(page.getByTestId('rhythm-staff').locator('.vf-stavenote').first()).toBeVisible();
  const times: number[] = JSON.parse((await rhythmCard.getAttribute('data-tap-times'))!);
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
  await expect(page.getByTestId('learn-result')).toContainText(expectedLine);
  await expect(page.getByTestId('learn-result-title')).toHaveText('Nice and steady');
}

/** Play a mini song to the end by reading the next key(s) off the page. */
async function playSong(page: Page, notes: number) {
  const song = page.getByTestId('mini-song');
  for (let i = 0; i < notes; i++) {
    const set = await song.getAttribute('data-next-set');
    if (set) await press(page, ...(JSON.parse(set) as number[]));
    else await press(page, Number(await song.getAttribute('data-next-midi')));
  }
}

test.describe('Learn units 6 to 10', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await isolateMidi(page);
  });

  test('the path lists all ten units as playable, and a unit opens only after the one before it', async ({ page }) => {
    await gotoApp(page, './?debug=1#/learn');
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10]) await expect(page.getByTestId(`learn-unit-${n}`)).toHaveAttribute('data-status', 'locked');
    await seedPassed(page, unitIds(5));
    await page.goto('./?debug=1#/learn/unit-6');
    await expect(page.getByTestId('learn-unit-6')).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('learn-unit-7')).toHaveAttribute('data-status', 'locked');
    await expect(page.getByTestId('unit-coming-soon')).toHaveCount(0);
    await expect(page.getByTestId('unit-title')).toHaveText('Rhythm basics');
    await page.goto('./?debug=1#/learn/unit-10');
    await expect(page.getByTestId('unit-locked')).toBeVisible();
  });

  test('Unit 6: reads rhythm, taps it in time, plays the rest song, passes and unlocks Minuet in G', async ({ page }) => {
    await openUnit(page, 6);
    await expect(page.getByTestId('lesson-tap-1')).toBeVisible();
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-minuet-in-g')).toHaveAttribute('data-locked', 'true');

    // Reading practice: a staff symbol and buttons; a wrong button shows the answer and queues the symbol.
    await page.goto('./?debug=1#/learn/unit-6/read');
    await expect(page.getByTestId('rhythm-staff').locator('.vf-stavenote')).toHaveCount(1);
    const c = await card(page);
    expect(c.answer).toMatch(/^(s|b)/);
    const wrongId = (await page.getByTestId('choices').locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-testid')!))).find((id) => id !== `choice-${c.answer}`)!;
    await page.getByTestId(wrongId).click();
    await expect(page.getByTestId('learn-feedback')).toContainText("It's");
    await expect(page.getByTestId('review-chip')).toHaveCount(1);
    const queue = await readStore<{ midi: number; active: boolean }>(page, 'reviewQueue');
    expect(queue).toHaveLength(1);
    expect(queue[0]!.midi).toBeGreaterThanOrEqual(200);
    expect(queue[0]!.midi).toBeLessThan(300);

    // Timed taps against the pattern.
    await tapPattern(page, '6:tap-1', /6 of 6 taps on the beat/);
    await tapPattern(page, '6:tap-2', /5 of 5 taps on the beat/);

    // The song with rests: rests are skipped, only the 11 sounding notes are played.
    await page.goto('./?debug=1#/learn/unit-6/song');
    await expect(page.getByTestId('song-staff').locator('.vf-stavenote')).toHaveCount(14);
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 12');
    await playSong(page, 12);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');

    await page.goto('./?debug=1#/learn/unit-6');
    await passTest(page, 6);
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Minuet in G');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-minuet-in-g')).not.toHaveAttribute('data-locked', 'true');
  });

  test('Unit 7: black keys by sharp or flat name, accidentals on the staff, enharmonic names, passes and unlocks Greensleeves', async ({ page }) => {
    await openUnit(page, 7, 'keys');
    const name = await page.getByTestId('learn-key-name').innerText();
    expect(name).toMatch(/^[A-G][♯♭]4$/);
    const target = Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));
    expect([61, 63, 66, 68, 70]).toContain(target);
    await press(page, target);
    // The feedback gives the other name of the same key.
    await expect(page.getByTestId('learn-feedback')).toContainText('also');

    await page.goto('./?debug=1#/learn/unit-7/flash');
    await expect(page.getByTestId('staff').locator('.vf-stavenote')).toHaveCount(1);
    await expect(page.getByTestId('staff')).toHaveAttribute('data-accidental', /^(#|b)$/);
    const t = Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));
    await press(page, t);
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');
    await expect(page.getByTestId('learn-feedback')).toContainText(/sharp|flat/);

    await page.goto('./?debug=1#/learn/unit-7/song');
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 17');
    await playSong(page, 17);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');

    await page.goto('./?debug=1#/learn/unit-7');
    await passTest(page, 7);
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Greensleeves');
  });

  test('Unit 8: grand staff, two hands pressed together judged as a set, both-hands song, passes and unlocks Für Elise', async ({ page }) => {
    await openUnit(page, 8, 'flash');
    await expect(page.getByTestId('staff').locator('.vf-stave')).toHaveCount(2);
    const t = Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));
    await press(page, t);
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');

    // A set: one key alone does not settle it; the second key, held with the first, does.
    await page.goto('./?debug=1#/learn/unit-8/together');
    await expect(page.getByTestId('staff').locator('.vf-stave')).toHaveCount(2);
    const c = await card(page);
    expect(c.kind).toBe('both-hands');
    const set = c.set!;
    await page.evaluate((m) => window.__keyfall!.press(m), set[0]!);
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'asking');
    await page.evaluate((m) => window.__keyfall!.release(m), set[0]!);
    // Released before the rest went down: pressing only the others still waits.
    for (const m of set.slice(1)) await page.evaluate((k) => window.__keyfall!.press(k), m);
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'asking');
    await page.evaluate((m) => window.__keyfall!.press(m), set[0]!);
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'right');
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');
    await page.evaluate((ms) => ms.forEach((m) => window.__keyfall!.release(m)), set);
    // A wrong second key misses the set. (A reload: the same hash URL would not start a fresh lesson.)
    await page.reload();
    const c2 = await card(page);
    await press(page, c2.set![0]!, 61);
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-state', 'wrong');
    await expect(page.getByTestId('review-chip').first()).toBeVisible();

    await page.goto('./?debug=1#/learn/unit-8/song');
    await expect(page.getByTestId('song-staff').locator('.vf-stave')).toHaveCount(10);
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 16');
    await playSong(page, 16);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');

    // Under 90% fails; a clean run passes.
    await page.goto('./?debug=1#/learn/unit-8');
    await page.getByTestId('learn-start-test').click();
    await runPrompts(page, 20, 3);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'false');
    await expect(page.getByTestId('learn-result')).toContainText('17 of 20');
    await page.getByTestId('learn-retry').click();
    await expect(page.getByTestId('learn-count')).toHaveText('1 / 20');
    await runPrompts(page, 20);
    await expect(page.getByTestId('learn-result')).toHaveAttribute('data-passed', 'true');
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Für Elise');
  });

  test('Unit 9: eighth and dotted rhythm reading and timed taps, the song, passes and unlocks Canon in D', async ({ page }) => {
    await openUnit(page, 9);
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-canon-in-d')).toHaveAttribute('data-locked', 'true');

    await page.goto('./?debug=1#/learn/unit-9/read');
    await expect(page.getByTestId('rhythm-staff').locator('.vf-stavenote')).toHaveCount(1);
    await expect(page.getByTestId('choices').locator('button').first()).toBeVisible();

    await tapPattern(page, '9:tap-1', /10 of 10 taps on the beat/);
    await tapPattern(page, '9:tap-2', /7 of 7 taps on the beat/);

    await page.goto('./?debug=1#/learn/unit-9/song');
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 14');
    await playSong(page, 14);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');

    await page.goto('./?debug=1#/learn/unit-9');
    await passTest(page, 9);
    await expect(page.getByTestId('learn-result')).toContainText('Unlocked: Canon in D');
    await page.goto('./?debug=1#/songs');
    await expect(page.getByTestId('song-canon-in-d')).not.toHaveAttribute('data-locked', 'true');
  });

  test('Unit 10: key signatures drawn and named, notes played with the signature applied, scale and song, passes and unlocks nothing new', async ({ page }) => {
    await openUnit(page, 10, 'read');
    await expect(page.getByTestId('staff').locator('.vf-stave')).toHaveCount(1);
    const c = await card(page);
    expect(c.kind).toBe('keysig-name');
    await page.getByTestId(`choice-${c.answer}`).click();
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');

    await page.goto('./?debug=1#/learn/unit-10/in-key');
    await expect(page.getByTestId('learn-prompt')).toHaveAttribute('data-kind', 'in-key');
    await expect(page.getByTestId('staff').locator('.vf-stavenote')).toHaveCount(1);
    const k = Number(await page.getByTestId('learn-prompt').getAttribute('data-target-midi'));
    await press(page, k);
    await expect(page.getByTestId('learn-feedback')).toContainText('Correct');

    await page.goto('./?debug=1#/learn/unit-10/scale');
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 16');
    await playSong(page, 16);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');
    await page.goto('./?debug=1#/learn/unit-10/song');
    await expect(page.getByTestId('mini-progress')).toHaveText('0 / 16');
    await playSong(page, 16);
    await expect(page.getByTestId('learn-result')).toContainText('No wrong keys');

    await page.goto('./?debug=1#/learn/unit-10');
    await expect(page.getByTestId('unit-unlocks')).toHaveCount(0);
    await passTest(page, 10);
    await expect(page.getByTestId('learn-result')).not.toContainText('Unlocked');
    await page.getByTestId('learn-back').click();
    await expect(page.getByTestId('learn-unit-10')).toContainText('Passed');
  });
});
