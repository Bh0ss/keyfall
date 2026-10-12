import { expect, test, type Page } from '@playwright/test';
import { gotoApp, readStore } from './helpers';
import { parseMusicXml } from '../src/songs/musicxml';
import { planAutoplay, type AccuracyProfile } from '../src/midi/autoplay';

const ORIGIN = 'http://localhost:5173';
const MARY_ID = 'mary-had-a-little-lamb';
const MARY = `/#/play/${MARY_ID}`;
const NOTES = 26;
/** Mary as the app parses it, read straight from the dev server so the oracle uses the real arrangement. */
async function loadMary(page: Page) {
  const res = await page.request.get('/keyfall/src/songs/mary-had-a-little-lamb.musicxml');
  expect(res.ok()).toBe(true);
  return parseMusicXml(await res.text(), { id: MARY_ID, level: 1 });
}
// Spec: 100 / 70 / 40 points, multiplier +1 every 10 consecutive hits capped at x4.
// Mary has 26 notes, so a clean run scores 10 x1, 10 x2, 6 x3.
const CLEAN_MULTIPLIER_SUM = 10 * 1 + 10 * 2 + 6 * 3;
const POINTS = { perfect: 100, great: 70, good: 40 };

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['midi', 'midi-sysex'], { origin: ORIGIN });
  await page.addInitScript(() => {
    const empty = { inputs: new Map(), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(empty), configurable: true });
  });
});

async function openMary(page: Page, mode: 'wait' | 'practice' | 'full' | 'expert', speedPct?: number) {
  await gotoApp(page, MARY);
  await page.getByTestId(`mode-${mode}`).click();
  if (speedPct) await page.getByTestId(`speed-${speedPct}`).click();
}

async function autoplayToEnd(page: Page, profile: AccuracyProfile) {
  const result = await page.evaluate((p) => window.__keyfall!.autoplay(p), profile);
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 15_000 });
  return result;
}

const text = (page: Page, id: string) => page.getByTestId(id).innerText();

test.describe('timed scoring through autoplay', () => {
  test.setTimeout(120_000);

  test('Full, offset 0: every note Perfect, exact maximum score, 3 stars', async ({ page }) => {
    await openMary(page, 'full');
    const result = await autoplayToEnd(page, { offsetMs: 0 });
    expect(result).toEqual({ presses: NOTES, wrongPresses: 0 });
    expect(await text(page, 'summary-score')).toBe(String(POINTS.perfect * CLEAN_MULTIPLIER_SUM));
    expect(POINTS.perfect * CLEAN_MULTIPLIER_SUM).toBe(4800);
    expect(await text(page, 'summary-accuracy')).toBe('100.0%');
    expect(await text(page, 'summary-hits')).toBe('26 of 26');
    expect(await text(page, 'summary-streak')).toBe('26');
    await expect(page.getByTestId('summary-stars')).toHaveAttribute('data-stars', '3');
    expect(await text(page, 'summary-grades')).toBe('Perfect 26 · Great 0 · Good 0 · Missed 0');
    await expect(page.getByTestId('stat-score')).toHaveText('4800');
  });

  test('Full, +75 ms (Great band): every note Great, exact computed score', async ({ page }) => {
    await openMary(page, 'full');
    await autoplayToEnd(page, { offsetMs: 75 });
    expect(await text(page, 'summary-score')).toBe(String(POINTS.great * CLEAN_MULTIPLIER_SUM));
    expect(await text(page, 'summary-grades')).toBe('Perfect 0 · Great 26 · Good 0 · Missed 0');
    expect(await text(page, 'summary-accuracy')).toBe('100.0%');
  });

  test('Full, -125 ms (early, Good band): every note Good', async ({ page }) => {
    await openMary(page, 'full');
    await autoplayToEnd(page, { offsetMs: -125 });
    expect(await text(page, 'summary-score')).toBe(String(POINTS.good * CLEAN_MULTIPLIER_SUM));
    expect(await text(page, 'summary-grades')).toBe('Perfect 0 · Great 0 · Good 26 · Missed 0');
  });

  test('Full, +200 ms is outside the Good window: every note a late miss, score 0', async ({ page }) => {
    await openMary(page, 'full');
    await autoplayToEnd(page, { offsetMs: 200 });
    expect(await text(page, 'summary-score')).toBe('0');
    expect(await text(page, 'summary-accuracy')).toBe('0.0%');
    expect(await text(page, 'summary-streak')).toBe('0');
    await expect(page.getByTestId('summary-stars')).toHaveAttribute('data-stars', '0');
    expect(await text(page, 'summary-grades')).toContain('Missed 26');
  });

  test('Expert halves the windows: +40 ms is Great, not Perfect (and note names start off)', async ({ page }) => {
    await openMary(page, 'expert');
    await expect(page.getByRole('button', { name: 'Note names: Off' })).toBeVisible();
    await autoplayToEnd(page, { offsetMs: 40 });
    expect(await text(page, 'summary-grades')).toBe('Perfect 0 · Great 26 · Good 0 · Missed 0');
    expect(await text(page, 'summary-score')).toBe(String(POINTS.great * CLEAN_MULTIPLIER_SUM));
  });

  test('Practice at 70% doubles the windows: +90 ms is Perfect, and the song runs slower', async ({ page }) => {
    await openMary(page, 'practice', 70);
    await expect(page.getByTestId('speed-70')).toHaveAttribute('aria-pressed', 'true');
    const t0 = Date.now();
    await autoplayToEnd(page, { offsetMs: 90 });
    const seconds = (Date.now() - t0) / 1000;
    // 28 beats at 96 bpm / 0.7 = 24 s of song, plus the last note's tail.
    expect(seconds).toBeGreaterThan(22);
    expect(await text(page, 'summary-grades')).toBe('Perfect 26 · Great 0 · Good 0 · Missed 0');
    expect(await text(page, 'summary-score')).toBe('4800');
  });

  test('a seeded profile with wrong keys and skipped notes gives the exact score, accuracy and stars', async ({ page }) => {
    const profile: AccuracyProfile = { offsetMs: 0, wrongKeyRate: 0.35, missRate: 0.25, seed: 42 };
    // Oracle: which notes the virtual player skips and which get a wrong key first.
    const mary = await loadMary(page);
    const plan = planAutoplay(mary, profile, { timed: true });
    const beatMs = 625;
    const played = new Set(plan.filter((e) => e.kind === 'press' && e.intent === 'correct').map((e) => Math.round(e.atMs / beatMs * 1000) / 1000));
    const wrongBefore = new Set(
      plan.filter((e) => e.kind === 'press' && e.intent === 'wrong').map((e) => Math.round((e.atMs + 100) / beatMs * 1000) / 1000),
    );
    // Expected values come from the spec rules, applied note by note.
    let streak = 0;
    let longest = 0;
    let score = 0;
    let hits = 0;
    for (const n of mary.notes) {
      if (wrongBefore.has(n.startBeat)) streak = 0;
      if (!played.has(n.startBeat)) {
        streak = 0;
        continue;
      }
      score += POINTS.perfect * Math.min(4, 1 + Math.floor(streak / 10));
      streak++;
      hits++;
      longest = Math.max(longest, streak);
    }
    const accuracy = hits / NOTES;
    const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.85 ? 2 : accuracy >= 0.7 ? 1 : 0;
    expect(hits).toBeLessThan(NOTES);
    expect(wrongBefore.size).toBeGreaterThan(0);

    await openMary(page, 'full');
    const result = await autoplayToEnd(page, profile);
    expect(result.wrongPresses).toBe(wrongBefore.size);
    expect(await text(page, 'summary-score')).toBe(String(score));
    expect(await text(page, 'summary-hits')).toBe(`${hits} of ${NOTES}`);
    expect(await text(page, 'summary-accuracy')).toBe(`${(accuracy * 100).toFixed(1)}%`);
    expect(await text(page, 'summary-streak')).toBe(String(longest));
    await expect(page.getByTestId('summary-stars')).toHaveAttribute('data-stars', String(stars));
  });

  test('wrong keys alone reset the combo but never cost accuracy', async ({ page }) => {
    const profile: AccuracyProfile = { wrongKeyRate: 0.3, seed: 9 };
    const mary = await loadMary(page);
    const plan = planAutoplay(mary, profile, { timed: true });
    const wrongBefore = new Set(
      plan.filter((e) => e.kind === 'press' && e.intent === 'wrong').map((e) => Math.round((e.atMs + 100) / 625 * 1000) / 1000),
    );
    let streak = 0;
    let score = 0;
    for (const n of mary.notes) {
      if (wrongBefore.has(n.startBeat)) streak = 0;
      score += POINTS.perfect * Math.min(4, 1 + Math.floor(streak / 10));
      streak++;
    }
    expect(wrongBefore.size).toBeGreaterThan(0);
    await openMary(page, 'full');
    await autoplayToEnd(page, profile);
    expect(await text(page, 'summary-score')).toBe(String(score));
    expect(score).toBeLessThan(4800);
    expect(await text(page, 'summary-accuracy')).toBe('100.0%');
    await expect(page.getByTestId('summary-stars')).toHaveAttribute('data-stars', '3');
  });

  test('a calibrated latency is subtracted from every hit', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('keyfall.latency.v1', JSON.stringify({ default: 80 })));
    await openMary(page, 'full');
    await expect(page.getByTestId('setup-latency')).toContainText('+80 ms');
    // The Phase 2 localStorage value was migrated into Dexie and the old key removed.
    expect(await page.evaluate(() => localStorage.getItem('keyfall.latency.v1'))).toBeNull();
    // The player's keyboard is 80 ms late; with the offset removed that is Perfect, without it Great.
    await autoplayToEnd(page, { offsetMs: 80 });
    expect(await text(page, 'summary-grades')).toBe('Perfect 26 · Great 0 · Good 0 · Missed 0');
    expect(await text(page, 'summary-score')).toBe('4800');
  });
});

test.describe('play tools', () => {
  test('mode picker: speed only for Practice, Full and Expert have none', async ({ page }) => {
    await gotoApp(page, MARY);
    await expect(page.getByTestId('mode-wait')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('speed-70')).toHaveCount(0);
    await page.getByTestId('mode-practice').click();
    for (const v of [50, 60, 70, 80, 90]) await expect(page.getByTestId(`speed-${v}`)).toBeVisible();
    await expect(page.getByTestId('speed-100')).toHaveCount(0);
    await page.getByTestId('mode-full').click();
    await expect(page.getByTestId('speed-70')).toHaveCount(0);
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', 'playing');
    await expect(page.getByTestId('stat-score')).toHaveText('0');
  });

  test('a late wrong key shows a Miss and resets the streak display', async ({ page }) => {
    await openMary(page, 'full');
    await page.getByTestId('play-start').click();
    await page.evaluate(() => window.__keyfall!.press(61));
    await expect(page.getByTestId('play-grade')).toHaveAttribute('data-grade', 'miss');
    await expect(page.getByTestId('stat-streak')).toHaveText('0 · x1');
  });

  test('A-B loop in Wait mode: finishing the loop bar starts it again', async ({ page }) => {
    await gotoApp(page, MARY);
    await page.getByTestId('toggle-loop').click();
    await page.getByTestId('loop-to').selectOption('1');
    await page.getByTestId('play-start').click();
    const status = page.getByTestId('play-status');
    // Bar 1 is E D C D.
    for (const [midi, label] of [
      [64, 'Waiting for E4'],
      [62, 'Waiting for D4'],
      [60, 'Waiting for C4'],
      [62, 'Waiting for D4'],
    ] as const) {
      await expect(status).toHaveText(label, { timeout: 10_000 });
      await page.evaluate((m) => window.__keyfall!.press(m), midi);
      await page.evaluate((m) => window.__keyfall!.release(m), midi);
    }
    await expect(page.getByTestId('stat-correct')).toHaveText('4/4');
    await expect(status).toHaveText('Waiting for E4', { timeout: 10_000 });
    await expect(page.getByTestId('stat-correct')).toHaveText('0/4');
    await expect(page.getByTestId('play-finished')).toHaveCount(0);
  });

  test('count-in clicks one bar before the song, and the metronome clicks on every beat', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __clicks: number };
      w.__clicks = 0;
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        const osc = create.call(this);
        const start = osc.start.bind(osc);
        osc.start = (when?: number) => {
          w.__clicks++;
          start(when);
        };
        return osc;
      };
    });
    const clicks = () => page.evaluate(() => (window as unknown as { __clicks: number }).__clicks);

    // Count-in only (default): lead-in is 6 beats at 96 bpm; clicks fall on the last 4 beats.
    await openMary(page, 'full');
    await page.getByTestId('play-start').click();
    await page.waitForTimeout(4_300);
    expect(await clicks()).toBe(4);
    await page.waitForTimeout(2_600);
    expect(await clicks()).toBe(4);

    // Count-in off, metronome off: silent.
    await page.goto('about:blank');
    await gotoApp(page, MARY);
    await page.getByTestId('mode-full').click();
    await page.getByTestId('toggle-countin').click();
    const before = await clicks();
    await page.getByTestId('play-start').click();
    await page.waitForTimeout(5_000);
    expect(await clicks()).toBe(before);

    // Metronome on, count-in on: 4 count-in clicks, then one per beat.
    await page.goto('about:blank');
    await gotoApp(page, MARY);
    await page.getByTestId('mode-full').click();
    // Phase 3: play settings persist per profile, so count-in is still off from above. Turn it back on.
    await expect(page.getByTestId('toggle-countin')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('toggle-countin').click();
    await page.getByTestId('toggle-metronome').click();
    const base = await clicks();
    await page.getByTestId('play-start').click();
    await page.waitForTimeout(3_750 + 625 * 3 + 300);
    // 4 count-in + beats 0, 1, 2, 3
    expect((await clicks()) - base).toBe(8);
  });
});

test.describe('latency check', () => {
  test('eight clicks, one tap each, stores the median offset for the device', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoApp(page, '/#/settings');
    await expect(page.getByTestId('latency-saved')).toHaveText('none');
    // Tap a key the moment each click's counter appears (the way a player taps on the beat).
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="latency-card"]')!;
      new MutationObserver(() => {
        const beat = document.querySelector('[data-testid="latency-beat"]');
        if (!beat) return;
        const n = Number(beat.textContent!.split('/')[0]);
        const w = window as unknown as { __lastBeat?: number };
        if (n > 0 && n !== w.__lastBeat) {
          w.__lastBeat = n;
          window.__keyfall!.press(60);
          window.__keyfall!.release(60);
        }
      }).observe(card, { subtree: true, childList: true, characterData: true });
    });
    await page.getByTestId('latency-start').click();
    await expect(page.getByTestId('latency-beat')).toBeVisible();
    const result = page.getByTestId('latency-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    const offset = Number(await result.getAttribute('data-offset'));
    // Taps land within a frame or two of the clicks; far from the ~375 ms half-interval.
    expect(Math.abs(offset)).toBeLessThan(150);
    // Phase 3: offsets live in IndexedDB (Dexie), not localStorage.
    const stored = await readStore<{ id: string; offsetMs: number }>(page, 'latency');
    expect(stored.map((r) => [r.id, r.offsetMs])).toEqual([['default', offset]]);
    expect(await page.evaluate(() => localStorage.getItem('keyfall.latency.v1'))).toBeNull();
    await expect(page.getByTestId('latency-saved')).toContainText('ms');
    await page.getByTestId('latency-reset').click();
    await expect(page.getByTestId('latency-saved')).toHaveText('none');
    expect(await readStore(page, 'latency')).toEqual([]);
  });

  test('too few taps is reported, nothing is saved', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoApp(page, '/#/settings');
    await page.getByTestId('latency-start').click();
    await expect(page.getByRole('alert')).toContainText('Not enough taps', { timeout: 15_000 });
    expect(await readStore(page, 'latency')).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('keyfall.latency.v1'))).toBeNull();
  });
});
