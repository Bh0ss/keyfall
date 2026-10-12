import { expect, test, type Page } from '@playwright/test';
import { gotoApp } from './helpers';

const ORIGIN = 'http://localhost:5173';

const key = (page: Page, midi: number) => page.locator(`[data-midi="${midi}"]`);
const lit = (page: Page) => page.locator('[data-pressed="true"]');

test.describe('with MIDI permission', () => {
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
    await gotoApp(page, '/#/keyboard');
    await expect(page.getByTestId('state-no-device')).toBeVisible();
  });

  test('renders all 88 keys, none lit', async ({ page }) => {
    await expect(page.locator('[data-midi]')).toHaveCount(88);
    await expect(lit(page)).toHaveCount(0);
  });

  test('__keyfall.press lights the right key and release un-lights it', async ({ page }) => {
    await page.evaluate(() => window.__keyfall!.press(60));
    await expect(key(page, 60)).toHaveAttribute('data-pressed', 'true');
    await expect(lit(page)).toHaveCount(1);
    await page.evaluate(() => window.__keyfall!.release(60));
    await expect(lit(page)).toHaveCount(0);
  });

  test('black keys, chords and the extreme ends of the range light independently', async ({ page }) => {
    await page.evaluate(() => {
      for (const m of [21, 61, 64, 108]) window.__keyfall!.press(m, 100);
    });
    await expect(lit(page)).toHaveCount(4);
    for (const m of [21, 61, 64, 108]) await expect(key(page, m)).toHaveAttribute('data-pressed', 'true');
    await expect(key(page, 60)).toHaveAttribute('data-pressed', 'false');
    await page.evaluate(() => window.__keyfall!.release(61));
    await expect(key(page, 61)).toHaveAttribute('data-pressed', 'false');
    await expect(lit(page)).toHaveCount(3);
  });

  test('computer keyboard A lights C4, W lights C#4, and releasing un-lights them', async ({ page }) => {
    await page.keyboard.down('a');
    await expect(key(page, 60)).toHaveAttribute('data-pressed', 'true');
    await page.keyboard.down('w');
    await expect(key(page, 61)).toHaveAttribute('data-pressed', 'true');
    await page.keyboard.up('a');
    await expect(key(page, 60)).toHaveAttribute('data-pressed', 'false');
    await page.keyboard.up('w');
    await expect(lit(page)).toHaveCount(0);
    await page.keyboard.down('k');
    await expect(key(page, 72)).toHaveAttribute('data-pressed', 'true');
    await page.keyboard.up('k');
  });

  test('shows the no-keyboard chip with a help link to setup steps', async ({ page }) => {
    await expect(page.getByTestId('connection-chip')).toHaveText('No keyboard found');
    await page.getByRole('link', { name: 'Setup help' }).click();
    await expect(page).toHaveURL(/#setup$/);
    await expect(page.getByRole('heading', { name: 'Connect your FP-30X' })).toBeVisible();
  });
});

test('shows a connected device name and transport, and updates on disconnect without reload', async ({ page }) => {
  await page.addInitScript(() => {
    const piano = { id: 'p', name: 'FP-30X MIDI Bluetooth', manufacturer: 'Roland', state: 'connected', onmidimessage: null as unknown };
    const access = { inputs: new Map([['p', piano]]), outputs: new Map(), onstatechange: null as null | (() => void) };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
    (window as unknown as Record<string, unknown>).__fakeDisconnect = () => {
      piano.state = 'disconnected';
      access.onstatechange?.();
    };
  });
  await gotoApp(page, '/#/keyboard');
  await expect(page.getByTestId('connection-chip')).toHaveText('FP-30X connected · Bluetooth');
  await page.evaluate(() => (window as unknown as { __fakeDisconnect: () => void }).__fakeDisconnect());
  await expect(page.getByTestId('connection-chip')).toHaveText('No keyboard found');
});

test('shows a recoverable message when MIDI permission is denied', async ({ page }) => {
  await gotoApp(page, '/#/keyboard');
  await expect(page.getByTestId('state-denied')).toBeVisible();
  await expect(page.getByTestId('connection-chip')).toHaveText('No keyboard found');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  // The keyboard and virtual input still work without MIDI access.
  await page.evaluate(() => window.__keyfall!.press(60));
  await expect(page.locator('[data-midi="60"]')).toHaveAttribute('data-pressed', 'true');
});

test('shows an unsupported message when Web MIDI is missing (Safari)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: undefined, configurable: true });
  });
  await gotoApp(page, '/#/keyboard');
  await expect(page.getByTestId('state-unsupported')).toContainText("can't use MIDI");
});
