import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { createProfile, gotoApp, isolateMidi, readStore } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

// Frere Jacques (4/4): the right hand plays C D E C ... and moves twice: to the D4 position at bar 5 (ring finger on G4,
// the thumb's C4 below it is a stretch), then down to the G3 position at bar 7 (ring finger on C4, then the thumb on G3).
// Bars 4 to 7 hold 18 right-hand notes.
const FRERE = './?debug=1#/play/frere-jacques?mode=wait&from=4&to=7';
const NAMES: Record<number, string> = { 55: 'G3', 60: 'C4', 62: 'D4', 64: 'E4', 65: 'F4', 67: 'G4', 69: 'A4' };
const BAR4 = [64, 65, 67];
const BAR5_REST = [69, 67, 65, 64, 60];
const BAR6 = [67, 69, 67, 65, 64, 60];

const status = (page: Page) => page.getByTestId('play-status');
const canvas = (page: Page) => page.getByTestId('highway');

/** Play notes in Wait mode: wait for the song to ask for each one, press it, and see it counted. */
async function play(page: Page, notes: number[], alreadyCorrect: number, total: number) {
  for (const [i, midi] of notes.entries()) {
    await expect(status(page)).toHaveText(`Waiting for ${NAMES[midi]}`, { timeout: 10_000 });
    await page.evaluate((m) => {
      window.__keyfall!.press(m);
      window.__keyfall!.release(m);
    }, midi);
    await expect(page.getByTestId('stat-correct')).toHaveText(`${alreadyCorrect + i + 1}/${total}`);
  }
}

test.describe('hand-position help', () => {
  test('a cue appears about a bar before each shift, with direction and target, and Wait mode holds at it', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, FRERE);
    await page.getByTestId('play-start').click();
    await expect(status(page)).toHaveText('Waiting for E4', { timeout: 10_000 });

    // The first shift (bar 5, ring finger on G4) is already a bar away: the hand's zone (C4 to G4) is shaded and D4 to A4 is next.
    const cue = page.getByTestId('shift-cue');
    await expect(cue).toBeVisible();
    await expect(cue).toHaveAttribute('data-direction', 'right');
    await expect(cue).toHaveAttribute('data-hand', 'right');
    await expect(cue).toHaveAttribute('data-measure', '5');
    await expect(page.getByTestId('shift-cue-label')).toHaveText('ring → G');
    await expect(cue).toContainText('Shift right');
    await expect(cue).toContainText('bar 5');
    await expect(canvas(page)).toHaveAttribute('data-zone-right', '60-67');
    await expect(canvas(page)).toHaveAttribute('data-zone-next-right', '62-69');
    await expect(canvas(page)).not.toHaveAttribute('data-zone-left', /.+/);

    // Bar 4 is played; the song then holds at the shift note (G4 with the ring finger) until the right key is played.
    await play(page, BAR4, 0, 18);
    await expect(status(page)).toHaveText('Waiting for G4', { timeout: 10_000 });
    await expect(cue).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(status(page)).toHaveAttribute('data-status', 'waiting');
    await expect(cue).toBeVisible();
    await page.evaluate(() => {
      window.__keyfall!.press(61);
      window.__keyfall!.release(61);
    });
    await expect(page.getByTestId('stat-wrong')).toHaveText('1');
    await expect(status(page)).toHaveText('Waiting for G4');
    await expect(cue).toBeVisible();

    // The right key moves on: the cue goes and the new position (D4 to A4) becomes the current zone while A4 is played.
    await page.evaluate(() => {
      window.__keyfall!.press(67);
      window.__keyfall!.release(67);
    });
    await expect(cue).toHaveCount(0);
    await expect(canvas(page)).toHaveAttribute('data-zone-right', '62-69');
    await expect(canvas(page)).not.toHaveAttribute('data-zone-next-right', /.+/);
    await play(page, BAR5_REST.slice(0, 1), 4, 18);
    await expect(canvas(page)).toHaveAttribute('data-zone-right', '62-69');

    // The thumb's C4 at the end of bar 5 is a one-key stretch below the zone, not a move. Bar 6 brings the second cue.
    await play(page, BAR5_REST.slice(1), 5, 18);
    await expect(cue).toBeVisible();
    await expect(cue).toHaveAttribute('data-direction', 'left');
    await expect(cue).toHaveAttribute('data-measure', '7');
    await expect(page.getByTestId('shift-cue-label')).toHaveText('ring → C');
    await expect(cue).toContainText('Shift left');
    await expect(cue).toContainText('bar 7');
    await expect(canvas(page)).toHaveAttribute('data-zone-right', '62-69');
    await expect(canvas(page)).toHaveAttribute('data-zone-next-right', '55-62');

    // The cue stays up through bar 6, then the song holds at the shift note until the right key is played.
    await play(page, BAR6, 9, 18);
    await expect(status(page)).toHaveText('Waiting for C4', { timeout: 10_000 });
    await expect(cue).toBeVisible();
    await page.evaluate(() => {
      window.__keyfall!.press(60);
      window.__keyfall!.release(60);
    });
    await expect(cue).toHaveCount(0);
    await expect(canvas(page)).toHaveAttribute('data-zone-right', '55-62');
    await expect(canvas(page)).not.toHaveAttribute('data-zone-next-right', /.+/);
  });

  test('the shift drill loops the transition, two notes before to two after', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoApp(page, './?debug=1#/play/frere-jacques');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('drill-info')).toHaveCount(0);
    await page.getByTestId('toggle-drill').click();
    await expect(page.getByTestId('toggle-drill')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('drill-info')).toHaveText('Shift 1 of 2 · bar 5 · ring → G');
    // Next steps to the second shift; this drill loops that one.
    await page.getByTestId('drill-next').click();
    await expect(page.getByTestId('drill-info')).toHaveText('Shift 2 of 2 · bar 7 · ring → C');
    await page.getByTestId('play-start').click();

    // E4 C4 | C4 G3 C4: two notes before the shift note (C4 in bar 7), the note itself and two after.
    const loop = [64, 60, 60, 55, 60];
    await expect(page.getByTestId('stat-correct')).toHaveText('0/5', { timeout: 10_000 });
    await expect(page.getByTestId('shift-cue')).toBeVisible();
    await play(page, loop, 0, 5);
    // The song wraps: the count resets and it asks for the first note again.
    await expect(page.getByTestId('stat-correct')).toHaveText('0/5', { timeout: 10_000 });
    await expect(status(page)).toHaveText('Waiting for E4', { timeout: 10_000 });
    await play(page, loop, 0, 5);
    await expect(page.getByTestId('stat-correct')).toHaveText('0/5', { timeout: 10_000 });
  });

  test('the drill is reachable with the piano navigation keys', async ({ page }) => {
    await gotoApp(page, './?debug=1#/play/frere-jacques');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    const tap = (midi: number) =>
      page.evaluate((m) => {
        window.__keyfall!.press(m);
        window.__keyfall!.release(m);
      }, midi);
    const onDrill = () => page.evaluate(() => document.activeElement?.matches('[data-testid=toggle-drill]') ?? false);
    for (let i = 0; i < 30 && !(await onDrill()); i++) await tap(26); // D1: next
    expect(await onDrill()).toBe(true);
    await tap(24); // C1: select
    await expect(page.getByTestId('toggle-drill')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('drill-info')).toBeVisible();
  });

  test('a song with no shifts stays quiet', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await gotoApp(page, './?debug=1#/play/mary-had-a-little-lamb');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('toggle-drill')).toHaveCount(0);
    await page.getByTestId('play-start').click();
    await expect(status(page)).toHaveText('Waiting for E4', { timeout: 10_000 });
    await expect(page.getByTestId('shift-cue')).toHaveCount(0);
    await expect(canvas(page)).not.toHaveAttribute('data-zone-right', /.+/);
    expect(errors).toEqual([]);
  });

  test('a song with no finger numbers stays quiet', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    // Clair de Lune is open to Advanced profiles and carries no fingering.
    await page.goto('./?debug=1#/');
    await createProfile(page, 'Pro', 'advanced');
    await page.goto('./?debug=1#/play/clair-de-lune');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('toggle-drill')).toHaveCount(0);
    await expect(page.getByTestId('toggle-posnames')).toHaveCount(0);
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('shift-cue')).toHaveCount(0);
    await expect(canvas(page)).not.toHaveAttribute('data-zone-right', /.+/);
    expect(errors).toEqual([]);
  });

  test('the Settings switch turns the help off and back on, per profile, and position names are a switch too', async ({ page }) => {
    await gotoApp(page, './?debug=1#/settings');
    const help = page.getByTestId('pref-handHelp');
    await expect(help).toHaveAttribute('aria-checked', 'true');
    await help.click();
    await expect(help).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await readStore<{ settings: { handHelp?: boolean } }>(page, 'profiles'))[0]!.settings.handHelp).toBe(false);

    await page.goto('./?debug=1#/play/frere-jacques');
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('toggle-drill')).toHaveCount(0);
    await page.getByTestId('play-start').click();
    await expect(status(page)).toHaveText('Waiting for C4', { timeout: 15_000 });
    await expect(canvas(page)).not.toHaveAttribute('data-zone-right', /.+/);

    await page.goto('./?debug=1#/settings');
    await help.click();
    await expect(help).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await readStore<{ settings: { handHelp?: boolean } }>(page, 'profiles'))[0]!.settings.handHelp).toBe(true);

    const names = page.getByTestId('pref-positionLabels');
    await expect(names).toHaveAttribute('aria-checked', 'false');
    await page.goto('./?debug=1#/play/frere-jacques');
    await expect(page.getByTestId('toggle-posnames')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('toggle-posnames').click();
    await expect(page.getByTestId('toggle-posnames')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await readStore<{ settings: { positionLabels?: boolean } }>(page, 'profiles'))[0]!.settings.positionLabels).toBe(true);
  });
});
