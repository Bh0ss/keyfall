import { expect, test, type Page } from '@playwright/test';
import { gotoApp, isolateMidi } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

/** The five command keys. Everything below is driven only by these (and by the song's own notes while a song plays). */
const A0 = 21;
const B0 = 23;
const C1 = 24;
const D1 = 26;
const E1 = 28;

async function tap(page: Page, midi: number) {
  await page.evaluate((m) => {
    window.__keyfall!.press(m);
    window.__keyfall!.release(m);
  }, midi);
}

const selected = (page: Page, selector: string) => page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);

/** Step the selection with D1 (or B0 for 'prev') until it sits on the element matching `selector`. */
async function stepTo(page: Page, selector: string, key = D1, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await selected(page, selector)) return;
    await tap(page, key);
  }
  throw new Error(`The selection never reached ${selector} in ${max} presses`);
}

/** C1 on the control the selection is on (the first press may only select the screen's default; press again if still here). */
async function press(page: Page, selector: string) {
  await stepTo(page, selector);
  await tap(page, C1);
}

test.describe('piano-key navigation', () => {
  test('the first-run legend appears once, is operable by piano, and Settings shows it', async ({ page }) => {
    await gotoApp(page, '/#/');
    const legend = page.getByTestId('nav-legend');
    await expect(legend).toBeVisible();
    await expect(legend.getByTestId('key-legend')).toContainText('A0');
    await expect(legend.getByTestId('key-legend')).toContainText('E1');
    await press(page, '[data-testid=nav-legend-dismiss]');
    await expect(legend).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(page.getByTestId('nav-legend')).toHaveCount(0);
    await page.goto('/#/settings');
    await expect(page.getByTestId('prefs-card').getByTestId('key-legend')).toBeVisible();
  });

  test('a visible ring marks the selected item', async ({ page }) => {
    await gotoApp(page, '/#/songs');
    await tap(page, D1);
    await expect(page.locator('html')).toHaveAttribute('data-nav', 'piano');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(3);
    // Using the mouse hands the ring back to the browser.
    await page.mouse.click(5, 5);
    await expect(page.locator('html')).not.toHaveAttribute('data-nav', 'piano');
  });

  test('every main screen is reachable and operable with the five keys alone', async ({ page }) => {
    await gotoApp(page, '/#/');
    await expect(page.getByTestId('home')).toBeVisible();

    // Stats and back (A0), Settings and Home (E1).
    await press(page, '[data-testid=rail-stats]');
    await expect(page).toHaveURL(/#\/stats$/);
    await expect(page.getByTestId('stats')).toBeVisible();
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/$/);

    await press(page, '[data-testid=rail-settings]');
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByTestId('latency-card')).toBeVisible();
    // A switch is operable: select it, then press it.
    await stepTo(page, '[data-testid=pref-sound]');
    await tap(page, C1);
    await expect(page.getByTestId('pref-sound')).toHaveAttribute('aria-checked', 'false');
    await tap(page, C1);
    await expect(page.getByTestId('pref-sound')).toHaveAttribute('aria-checked', 'true');
    await tap(page, E1);
    await expect(page).toHaveURL(/#\/$/);

    // Songs, Keyboard check, Import, each left with A0.
    await press(page, '[data-testid=rail-play]');
    await expect(page).toHaveURL(/#\/songs$/);
    await press(page, '[href$="#/keyboard"]');
    await expect(page).toHaveURL(/#\/keyboard$/);
    // The keyboard check lights every key, so a quick tap on A0 only lights it; holding it goes back.
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/keyboard$/);
    await page.evaluate(() => window.__keyfall!.press(21));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__keyfall!.release(21));
    await expect(page).toHaveURL(/#\/$/);
    await press(page, '[data-testid=rail-play]');
    await press(page, '[href$="#/keyboard"]');
    await expect(page).toHaveURL(/#\/keyboard$/);
    await page.evaluate(() => window.__keyfall!.press(21));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__keyfall!.release(21));
    await expect(page).toHaveURL(/#\/$/);
    await press(page, '[data-testid=rail-play]');
    await press(page, '[data-testid=import-link]');
    await expect(page).toHaveURL(/#\/import$/);
    await expect(page.getByTestId('import-file')).toBeAttached();
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/songs$/);

    // Learn: path, unit, lesson, answer with the piano, then back out one level per A0.
    await tap(page, E1);
    await press(page, '[data-testid=rail-learn]');
    await expect(page.getByTestId('learn-screen')).toBeVisible();
    await press(page, '[data-testid=learn-unit-1]');
    await expect(page).toHaveURL(/#\/learn\/unit-1$/);
    await expect(page.getByTestId('unit-detail')).toBeVisible();
    await press(page, '[data-testid=learn-start-keys]');
    await expect(page).toHaveURL(/#\/learn\/unit-1\/keys$/);
    const prompt = page.getByTestId('learn-prompt');
    await expect(prompt).toHaveAttribute('data-state', 'asking');
    await tap(page, Number(await prompt.getAttribute('data-target-midi')));
    await expect(prompt).toHaveAttribute('data-state', 'right');
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/learn\/unit-1$/);
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/learn$/);
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/$/);

    // The profile picker: reach the avatar button, open the picker, choose the profile.
    await press(page, '[data-testid=switch-profile]');
    await expect(page.getByTestId('profile-picker')).toBeVisible();
    await press(page, 'button[aria-label^="Play as"]');
    await expect(page.getByTestId('app-ready')).toBeAttached();
    await expect(page.getByTestId('home')).toBeVisible();
  });

  test('play a whole song, then Results, with the five keys and the song notes only', async ({ page }) => {
    await gotoApp(page, '/#/songs');
    await press(page, '[href$="#/play/mary-had-a-little-lamb"]');
    await expect(page).toHaveURL(/#\/play\/mary-had-a-little-lamb$/);
    await expect(page.getByTestId('play-ready')).toBeVisible();

    // Wait mode is the Beginner default; choose it through the keys anyway, then Start.
    await press(page, '[data-testid=mode-wait]');
    await press(page, '[data-testid=play-start]');
    const status = page.getByTestId('play-status');
    await expect(status).toHaveAttribute('data-status', /waiting|playing/);

    // While it runs, only C1 does anything: it pauses and resumes; the other four are ignored.
    for (const key of [A0, B0, D1, E1]) await tap(page, key);
    await expect(page).toHaveURL(/#\/play\/mary-had-a-little-lamb$/);
    await expect(status).toHaveAttribute('data-status', /waiting|playing/);
    await expect(page.getByTestId('stat-wrong')).toHaveText('0');
    await tap(page, C1);
    await expect(status).toHaveAttribute('data-status', 'paused');
    await tap(page, C1);
    await expect(status).toHaveAttribute('data-status', /waiting|playing/);
    await expect(page.getByTestId('stat-wrong')).toHaveText('0');

    // Play the song with some wrong keys so Results has something to practise.
    await page.evaluate(() => window.__keyfall!.autoplay({ wrongKeyRate: 0.3, seed: 4 }));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 30_000 });
    await press(page, '[data-testid=see-results]');
    await expect(page.getByTestId('results')).toBeVisible();

    // Results: D1 practise my mistakes, then back to Results via the browser history, C1 retry, A0 Songs.
    await expect(page.getByTestId('practice-mistakes')).toBeVisible();
    await tap(page, D1);
    await expect(page).toHaveURL(/#\/play\/mary-had-a-little-lamb\?mode=practice&from=\d+&to=\d+&speed=\d+$/);
    await page.goBack();
    await expect(page.getByTestId('results')).toBeVisible();
    await tap(page, C1);
    await expect(page).toHaveURL(/#\/play\/mary-had-a-little-lamb\?mode=wait$/);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    // Before the song starts the keys are normal menu keys: A0 leaves to Songs.
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/songs$/);
  });

  test('command keys never start a song or count as wrong keys, but song notes still do', async ({ page }) => {
    await gotoApp(page, '/#/play/mary-had-a-little-lamb');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await tap(page, D1);
    await tap(page, B0);
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', 'ready');
    await tap(page, 64); // E4 is Mary's first note: any real key starts the song
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', /waiting|playing/);
  });

  test('a song that uses command notes switches the commands off for that song', async ({ page }) => {
    // A0, C1, C4, E4 as quarter notes: two of the five command notes are song notes.
    const note = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Low Keys</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('A', 0)}${note('C', 1)}${note('C', 4)}${note('E', 4)}</measure></part></score-partwise>`;
    await gotoApp(page, '/#/import');
    await page.getByTestId('import-file').setInputFiles({ name: 'low-keys.musicxml', mimeType: 'application/vnd.recordare.musicxml+xml', buffer: Buffer.from(xml) });
    await expect(page.getByTestId('import-form')).toBeVisible();
    await page.getByTestId('import-save').click();
    await expect(page).toHaveURL(/#\/songs$/);
    const card = page.getByTestId(/^song-imp-/);
    const id = (await card.getAttribute('data-testid'))!.replace(/^song-/, '');

    await page.goto(`/#/play/${id}`);
    await expect(page.getByTestId('play-ready')).toBeVisible();
    // The commands are off for this song, so B0 is just a key: it starts the song (any key does) and goes nowhere.
    await tap(page, B0);
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', 'waiting');
    await expect(page).toHaveURL(new RegExp(`#/play/${id}$`));
    // E1 is not a note of this song, so it is a wrong key, not "Home".
    await tap(page, E1);
    await expect(page).toHaveURL(new RegExp(`#/play/${id}$`));
    await expect(page.getByTestId('stat-wrong')).toHaveText('1');
    // A0 and C1 are the first two notes of the song: judged as notes, never "back" or "pause".
    await tap(page, A0);
    await expect(page.getByTestId('stat-correct')).toHaveText('1/4');
    await tap(page, C1);
    await expect(page.getByTestId('stat-correct')).toHaveText('2/4');
    await expect(page.getByTestId('play-status')).not.toHaveAttribute('data-status', 'paused');
    await expect(page).toHaveURL(new RegExp(`#/play/${id}$`));
    await expect(page.getByTestId('play-status')).toContainText('Waiting for C4');
    await tap(page, 60);
    await expect(page.getByTestId('play-status')).toContainText('Waiting for E4');
    await tap(page, 64);
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 15_000 });
  });

  test('the Settings switch turns the commands off, and they come back when it is on', async ({ page }) => {
    await gotoApp(page, '/#/settings');
    await page.getByTestId('pref-pianoNav').click();
    await expect(page.getByTestId('pref-pianoNav')).toHaveAttribute('aria-checked', 'false');
    await tap(page, E1);
    await tap(page, A0);
    await expect(page).toHaveURL(/#\/settings$/);
    await page.getByTestId('pref-pianoNav').click();
    await expect(page.getByTestId('pref-pianoNav')).toHaveAttribute('aria-checked', 'true');
    await tap(page, E1);
    await expect(page).toHaveURL(/#\/$/);
  });
});
