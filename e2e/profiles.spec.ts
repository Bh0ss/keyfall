import { expect, test, type Page } from '@playwright/test';
import { createProfile, readStore, switchTo } from './helpers';
import type { AccuracyProfile } from '../src/midi/autoplay';
import { parseMusicXml } from '../src/songs/musicxml';

const ORIGIN = 'http://localhost:5173';
const MARY = '/#/play/mary-had-a-little-lamb';

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['midi', 'midi-sysex'], { origin: ORIGIN });
  await page.addInitScript(() => {
    const empty = { inputs: new Map(), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { value: () => Promise.resolve(empty), configurable: true });
  });
});

/** Play Mary in Full with the given autoplay profile, then open the saved Results. */
async function playFullAndOpenResults(page: Page, profile: AccuracyProfile) {
  await page.goto(MARY);
  await page.getByTestId('mode-full').click();
  await page.evaluate((p) => window.__keyfall!.autoplay(p), profile);
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('see-results').click();
  await expect(page.getByTestId('results')).toBeVisible();
}

const boardRows = (page: Page) => page.getByTestId('board-row');

test.describe('profiles and high scores', () => {
  test.setTimeout(150_000);

  test('two profiles play, and both stay on the high-score board after a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('profile-picker')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Keyfall' })).toBeVisible();
    await createProfile(page, 'Alex');
    await expect(page.getByTestId('home-title')).toHaveText('Ready to play, Alex?');

    // Alex: every note Perfect, 4800.
    await playFullAndOpenResults(page, { offsetMs: 0 });
    await expect(page.getByTestId('results-score')).toHaveText('4,800');
    await expect(page.getByTestId('results-stars')).toHaveAttribute('data-stars', '3');
    await expect(page.getByTestId('results-score').locator('xpath=..')).toContainText('new personal best');
    await expect(boardRows(page)).toHaveCount(1);

    // Sam: every note Great (+75 ms), 3360.
    await switchTo(page, 'Sam', 'advanced');
    await expect(page.getByTestId('home-title')).toHaveText('Ready to play, Sam?');
    await playFullAndOpenResults(page, { offsetMs: 75 });
    await expect(page.getByTestId('results-score')).toHaveText('3,360');
    await expect(boardRows(page)).toHaveCount(2);

    // Reload: IndexedDB is the source of truth, so the board is rebuilt from storage.
    await page.reload();
    await expect(page.getByTestId('results')).toBeVisible();
    await expect(boardRows(page)).toHaveCount(2);
    await expect(boardRows(page).nth(0)).toHaveAttribute('data-profile', 'Alex');
    await expect(boardRows(page).nth(0)).toHaveAttribute('data-score', '4800');
    await expect(boardRows(page).nth(1)).toHaveAttribute('data-profile', 'Sam');
    await expect(boardRows(page).nth(1)).toHaveAttribute('data-score', '3360');
    await expect(boardRows(page).nth(1)).toHaveAttribute('data-me', 'true');

    // The stores really hold both profiles' rows.
    const scores = await readStore<{ profileId: string; score: number }>(page, 'scores');
    expect(scores.map((s) => s.score).sort()).toEqual([3360, 4800]);
    expect(new Set(scores.map((s) => s.profileId)).size).toBe(2);
    expect((await readStore(page, 'attempts')).length).toBe(2);

    // Stats for the profile in this session (Sam).
    await page.goto('/#/stats');
    await expect(page.getByTestId('stats-songs')).toHaveText('1');
    await expect(page.getByTestId('stats-attempts')).toHaveText('1');
    await expect(page.getByTestId('stats-best-row')).toHaveCount(1);
    await expect(page.getByTestId('stats-best-row')).toContainText('3,360');

    // Home: Mary has 3 stars for Sam, so the suggestion moves on to the next song. Alex has his own stars.
    await page.goto('/#/');
    await expect(page.getByTestId('home-stars-mary-had-a-little-lamb')).toHaveText('★★★');
    await expect(page.getByTestId('home-stars-twinkle-twinkle-little-star')).toHaveText('☆☆☆');
    await expect(page.getByTestId('up-next-title')).toHaveText('Twinkle Twinkle Little Star');
    await expect(page.getByTestId('songs-summary')).toContainText('3 stars earned');
    await switchTo(page, 'Alex');
    await expect(page.getByTestId('home-stars-mary-had-a-little-lamb')).toHaveText('★★★');
  });

  test('a lower score does not replace the best; the board keeps the max', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await playFullAndOpenResults(page, { offsetMs: 0 });
    await expect(page.getByTestId('results-score')).toHaveText('4,800');
    await playFullAndOpenResults(page, { offsetMs: 75 });
    await expect(page.getByTestId('results-score')).toHaveText('3,360');
    await expect(page.getByTestId('results-score').locator('xpath=..')).not.toContainText('personal best');
    await expect(boardRows(page)).toHaveCount(1);
    await expect(boardRows(page).first()).toHaveAttribute('data-score', '4800');
    expect((await readStore(page, 'attempts')).length).toBe(2);
  });

  test('results: timing, most-missed notes, bars, and Practice my mistakes loops the worst bars', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await playFullAndOpenResults(page, { offsetMs: -40, missRate: 0.35, seed: 5 });

    const hits = Number((await page.getByTestId('results-notes').innerText()).match(/(\d+) of 26/)![1]);
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(26);
    const missCount = 26 - hits;

    // Every note was hit about 40 ms early (real timers add a millisecond or two): all Perfect.
    await expect(page.getByTestId('bar-perfect')).toHaveText(String(hits));
    await expect(page.getByTestId('bar-miss')).toHaveText(String(missCount));
    const avg = Number(await page.getByTestId('avg-offset').getAttribute('data-value'));
    expect(avg).toBeGreaterThanOrEqual(-45);
    expect(avg).toBeLessThanOrEqual(-35);
    await expect(page.getByTestId('timing-note')).toHaveText(/^You tend to play a little early: about (3[5-9]|4[0-5]) ms ahead of the beat\.$/);
    await expect(page.getByTestId('histogram')).toBeVisible();
    await expect(page.getByTestId('results-xp')).toHaveText(`+${hits * 4 + 25 * Number(await page.getByTestId('results-stars').getAttribute('data-stars'))} XP`);

    // Most-missed notes and bars add up to the number of skipped notes.
    const chipCounts = await page.locator('[data-testid="missed-notes"] .miss-count').allInnerTexts();
    expect(chipCounts.reduce((n, t) => n + Number(t.split(' ')[0]), 0)).toBe(missCount);
    const barMisses = await page.locator('[data-testid="bars"] [data-misses]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-misses'))));
    expect(barMisses).toHaveLength(8);
    expect(barMisses.reduce((a, b) => a + b, 0)).toBe(missCount);
    await expect(page.getByTestId('miss-summary')).toContainText(`of your ${missCount} miss`);

    // Practice my mistakes: Practice mode, loop on, the worst bars, 70%.
    const practice = page.getByTestId('practice-mistakes');
    const from = await practice.getAttribute('data-from');
    const to = await practice.getAttribute('data-to');
    // The loop is a window of at most 4 bars holding as many misses as any other such window.
    const windowSum = (a: number, b: number) => barMisses.slice(a - 1, b).reduce((x, y) => x + y, 0);
    const bestWindow = Math.max(...barMisses.map((_, i) => windowSum(i + 1, Math.min(8, i + 4))));
    expect(Number(to) - Number(from)).toBeLessThan(4);
    expect(windowSum(Number(from), Number(to))).toBe(bestWindow);
    expect(barMisses[Number(from) - 1]).toBeGreaterThan(0);
    expect(barMisses[Number(to) - 1]).toBeGreaterThan(0);
    await practice.click();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await expect(page.getByTestId('mode-practice')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('speed-70')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('toggle-loop')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('loop-from')).toHaveValue(from!);
    await expect(page.getByTestId('loop-to')).toHaveValue(to!);
    await page.getByTestId('play-start').click();
    await expect(page.getByTestId('play-status')).toHaveAttribute('data-status', 'playing');
  });

  test('a clean run has nothing to practise, and Retry returns to the same mode', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await playFullAndOpenResults(page, { offsetMs: 0 });
    await expect(page.getByTestId('practice-mistakes-off')).toBeVisible();
    await expect(page.getByTestId('miss-summary')).toHaveText('A clean run. Nothing to fix.');
    await expect(page.getByTestId('missed-notes')).toContainText('None');
    await page.getByTestId('results-retry').click();
    await expect(page.getByTestId('mode-full')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Wait mode results show first-try notes instead of timing grades', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await page.goto(MARY);
    await page.evaluate(() => window.__keyfall!.autoplay({ wrongKeyRate: 0.4, seed: 3, hesitationMs: 0, offsetMs: 0 }));
    await expect(page.getByTestId('play-finished')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('see-results').click();
    await expect(page.getByTestId('timing-note')).toContainText('Wait mode has no timing grade');
    const firstTry = Number(await page.getByTestId('bar-first-try').innerText());
    const retried = Number(await page.getByTestId('bar-retried').innerText());
    expect(firstTry + retried).toBe(26);
    expect(retried).toBeGreaterThan(0);
    await expect(page.getByTestId('results-score')).toHaveText((firstTry * 100).toLocaleString('en-US'));
  });
});

test.describe('profile picker, Home and settings per profile', () => {
  test('the picker shows on every launch, profiles can be edited, names are unique', async ({ page, context }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await expect(page.getByTestId('connection-chip')).toHaveText('No keyboard found');

    // A new tab is a new launch: the picker, with Alex on it.
    const second = await context.newPage();
    await second.goto('/');
    await expect(second.getByTestId('profile-picker')).toBeVisible();
    await expect(second.getByRole('heading', { name: "Who's playing?" })).toBeVisible();
    await second.getByRole('button', { name: 'Edit Alex' }).click();
    await second.getByTestId('profile-name').fill('Alexa');
    await second.getByLabel('Advanced').check();
    await second.getByLabel('Colour #4DA8FF').check();
    await second.getByTestId('profile-save').click();
    await expect(second.getByRole('button', { name: 'Play as Alexa' })).toBeVisible();

    await second.getByTestId('profile-new').click();
    await second.getByTestId('profile-name').fill('alexa');
    await second.getByTestId('profile-save').click();
    await expect(second.getByTestId('profile-error')).toHaveText('Someone already has that name.');
    await second.getByTestId('profile-name').fill('');
    await second.getByTestId('profile-save').click();
    await expect(second.getByTestId('profile-error')).toHaveText('Enter a name.');
    await second.getByRole('button', { name: 'Cancel' }).click();

    await second.getByRole('button', { name: 'Play as Alexa' }).click();
    await expect(second.getByTestId('home-title')).toHaveText('Ready to play, Alexa?');
    const rows = await readStore<{ name: string; level: string; colour: string }>(second, 'profiles');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Alexa', level: 'advanced', colour: '#4DA8FF' });
    await second.close();
  });

  test('Home: connection chip, up-next, Learn tile, avatar switches profile', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await expect(page.getByTestId('connection-chip')).toBeVisible();
    await expect(page.getByTestId('up-next-title')).toHaveText('Mary Had a Little Lamb');
    await expect(page.getByTestId('up-next-best')).toHaveText('Not played yet');
    await expect(page.getByTestId('learn-tile')).toContainText('Unit 1');
    await expect(page.getByTestId('songs-summary')).toContainText('2 of 4 unlocked');
    await expect(page.getByTestId('play-next')).toHaveText(/Play · Wait/);
    await page.getByTestId('play-next').click();
    await expect(page.getByTestId('play-ready')).toBeVisible();
    await page.goBack();
    await page.getByTestId('switch-profile').click();
    await expect(page.getByTestId('profile-picker')).toBeVisible();
  });

  test('play settings and note-label mode are remembered per profile', async ({ page }) => {
    await page.goto('/');
    await createProfile(page, 'Alex');
    await page.goto(MARY);
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: On');
    await page.getByTestId('toggle-labels').click();
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: Fade');
    await page.getByTestId('mode-practice').click();
    await page.getByTestId('speed-60').click();
    await page.getByTestId('toggle-labels').click();
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: Off');
    await page.getByTestId('toggle-labels').click();
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: On');
    await page.getByTestId('toggle-labels').click();
    // Settings are written to IndexedDB asynchronously; wait for the write before reloading.
    await expect
      .poll(async () => (await readStore<{ settings: { labels: string; mode: string; speedPct: number } }>(page, 'profiles'))[0]!.settings)
      .toMatchObject({ labels: 'fade', mode: 'practice', speedPct: 60 });

    await page.reload();
    await expect(page.getByTestId('mode-practice')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('speed-60')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: Fade');
    await expect(page.getByTestId('play-grade')).toHaveCount(0);

    // Sam is Advanced: starts on Full with fading labels, untouched by Alex's choices.
    await switchTo(page, 'Sam', 'advanced');
    await page.goto(MARY);
    await expect(page.getByTestId('mode-full')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('toggle-labels')).toHaveText('Note names: Fade');
  });

  test('finishing a run updates the per-pitch hit streaks that drive label fade', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await createProfile(page, 'Alex');
    const profileId = (await readStore<{ id: string }>(page, 'profiles'))[0]!.id;
    const res = await page.request.get('/keyfall/src/songs/mary-had-a-little-lamb.musicxml');
    const mary = parseMusicXml(await res.text(), { id: 'mary-had-a-little-lamb', level: 1 });
    const count = (midi: number) => mary.notes.filter((n) => n.midi === midi).length;
    // E4 is one hit short of fading; D4 has a long streak that one slip will reset.
    await page.evaluate(
      ([pid]) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('keyfall');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('noteStats', 'readwrite');
            for (const [midi, streak] of [[64, 9], [62, 25]] as const) {
              tx.objectStore('noteStats').put({ id: `${pid}:${midi}`, profileId: pid, midi, streak, hits: streak, misses: 0, updatedAt: 1 });
            }
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
          };
        }),
      [profileId],
    );
    await page.goto(MARY);
    await page.getByTestId('mode-full').click();
    // Skip the third note of the song (a D4 in bar 1: E D C D): it expires as a miss.
    await page.evaluate(() => window.__keyfall!.autoplay({ offsetMs: 0, missRate: 0.2, seed: 9 }));
    await expect(page.getByTestId('summary')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('see-results')).toBeVisible();
    const stats = Object.fromEntries((await readStore<{ midi: number; streak: number }>(page, 'noteStats')).map((r) => [r.midi, r]));
    expect(Object.keys(stats).length).toBeGreaterThan(0);
    for (const row of Object.values(stats)) expect(row.streak).toBeGreaterThanOrEqual(0);
    // Every pitch in the song now has stats; none can exceed its starting streak plus this run's notes.
    expect(stats[64]!.streak).toBeLessThanOrEqual(9 + count(64));
    expect(stats[62]!.streak).toBeLessThanOrEqual(25 + count(62));
    const attempt = (await readStore<{ misses: { midi: number }[] }>(page, 'attempts'))[0]!;
    const missedPitches = new Set(attempt.misses.map((m) => m.midi));
    expect(missedPitches.size).toBeGreaterThan(0);
    // A pitch that was missed anywhere in the run has a streak shorter than its note count in the song.
    for (const midi of missedPitches) expect(stats[midi]!.streak).toBeLessThan(count(midi));
  });
});
