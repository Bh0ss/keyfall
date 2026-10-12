import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, ORIGIN } from './helpers';

const MARY = './?debug=1#/play/mary-had-a-little-lamb';

const status = (page: Page) => page.getByTestId('play-status');

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['midi', 'midi-sysex'], { origin: ORIGIN });
  // Hide any real MIDI hardware attached to this machine so results are deterministic.
  await page.addInitScript(() => {
    const empty = { inputs: new Map(), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
      value: () => Promise.resolve(empty),
      configurable: true,
    });
  });
});

test('song list opens a song and Start begins Wait mode', async ({ page }) => {
  await gotoApp(page, './?debug=1#/songs');
  await expect(page.getByTestId('song-mary-had-a-little-lamb')).toContainText('Mary Had a Little Lamb');
  await expect(page.getByTestId('song-twinkle-twinkle-little-star')).toContainText('Twinkle Twinkle Little Star');
  await page.getByTestId('song-mary-had-a-little-lamb').getByRole('link', { name: 'Play' }).click();
  await expect(page.getByTestId('play-ready')).toBeVisible();
  await page.getByTestId('play-start').click();
  await expect(status(page)).toHaveAttribute('data-status', 'playing');
});

test('the song stops at the first note and only the right key releases it', async ({ page }) => {
  await gotoApp(page, MARY);
  await page.getByTestId('play-start').click();
  await expect(status(page)).toHaveAttribute('data-status', 'waiting', { timeout: 10_000 });
  await expect(status(page)).toHaveText('Waiting for E4');
  await page.waitForTimeout(1200);
  await expect(status(page)).toHaveAttribute('data-status', 'waiting');

  await page.evaluate(() => {
    window.__keyfall!.press(61);
    window.__keyfall!.release(61);
  });
  await expect(page.getByTestId('stat-wrong')).toHaveText('1');
  await expect(status(page)).toHaveAttribute('data-status', 'waiting');

  await page.evaluate(() => window.__keyfall!.press(64));
  await expect(page.getByTestId('stat-correct')).toHaveText('1/26');
  await expect(status(page)).toHaveAttribute('data-status', 'playing');
  await expect(status(page)).toHaveText('Waiting for D4', { timeout: 5_000 });
});

test('the canvas paints the hit line and keeps a steady frame rate', async ({ page }) => {
  await gotoApp(page, MARY);
  await page.getByTestId('play-start').click();
  const probe = await page.evaluate(async () => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="highway"]')!;
    const dpr = window.devicePixelRatio || 1;
    const h = c.clientHeight;
    const kh = Math.min(196, Math.round(h * 0.28));
    const y = Math.round((h - kh - 14 + 1) * dpr);
    const px = c.getContext('2d')!.getImageData(Math.round(5 * dpr), y, 1, 1).data;
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        frames++;
        if (performance.now() - t0 >= 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { rgba: Array.from(px), fps: frames, width: c.clientWidth, height: h };
  });
  expect(probe.width).toBeGreaterThan(600);
  const [r, g, b] = probe.rgba as [number, number, number];
  expect(r).toBeGreaterThan(180);
  expect(g).toBeGreaterThan(110);
  expect(b).toBeLessThan(90);
  expect(probe.fps).toBeGreaterThanOrEqual(45);
});

test('autoplay completes Mary in Wait mode with every note correct', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoApp(page, MARY);
  const result = await page.evaluate(() => window.__keyfall!.autoplay({}));
  expect(result).toEqual({ presses: 26, wrongPresses: 0 });
  await expect(page.getByTestId('play-finished')).toBeVisible();
  await expect(status(page)).toHaveAttribute('data-status', 'finished');
  await expect(page.getByTestId('stat-correct')).toHaveText('26/26');
  await expect(page.getByTestId('stat-wrong')).toHaveText('0');
  await expect(page.getByTestId('play-finished')).toContainText('26 of 26 notes');

  // Retry gives a fresh run.
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('play-ready')).toBeVisible();
  await expect(page.getByTestId('stat-correct')).toHaveText('0/26');
});

test('autoplay with late timing, wrong keys and hesitations still finishes; wrong keys are counted', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoApp(page, MARY);
  const result = await page.evaluate(() =>
    window.__keyfall!.autoplay({ offsetMs: 120, jitterMs: 40, wrongKeyRate: 0.4, missRate: 0.2, hesitationMs: 300, seed: 11 }),
  );
  expect(result.presses).toBe(26);
  expect(result.wrongPresses).toBeGreaterThan(0);
  await expect(page.getByTestId('play-finished')).toBeVisible();
  await expect(page.getByTestId('stat-correct')).toHaveText('26/26');
  await expect(page.getByTestId('stat-wrong')).toHaveText(String(result.wrongPresses));
});

test('autoplay without an open song rejects', async ({ page }) => {
  await gotoApp(page, './?debug=1#/songs');
  const msg = await page.evaluate(() => window.__keyfall!.autoplay({}).then(() => 'ok', (e: Error) => e.message));
  expect(msg).toMatch(/no song is open/);
});
