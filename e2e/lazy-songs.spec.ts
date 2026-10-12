import { expect, test } from '@playwright/test';
import { gotoApp, isolateMidi } from './helpers';

test.use({ permissions: ['midi', 'midi-sysex'] });

test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const SONG = /(mary-had-a-little-lamb|twinkle-twinkle-little-star|clair-de-lune|joplin-the-entertainer)/;

test('song data is fetched when a song opens, not with the app', async ({ page }) => {
  const songRequests: string[] = [];
  page.on('request', (r) => {
    const m = SONG.exec(new URL(r.url()).pathname);
    if (m && !/\.(woff2?|css|png|svg)$/.test(r.url())) songRequests.push(m[1]!);
  });
  await gotoApp(page, '/#/');
  await expect(page.getByTestId('home-song-clair-de-lune')).toBeVisible();
  await page.goto('/#/songs');
  await expect(page.getByTestId('song-mary-had-a-little-lamb')).toContainText('26 notes');
  await expect(page.getByTestId('song-clair-de-lune')).toContainText('notes');
  // Home and the song list show titles, levels and note counts from the build-time index: no song file yet.
  expect(songRequests).toEqual([]);

  await page.goto('/#/play/mary-had-a-little-lamb');
  await expect(page.getByTestId('play-ready')).toBeVisible();
  expect([...new Set(songRequests)]).toEqual(['mary-had-a-little-lamb']);
});

test('a song that cannot be fetched says so and offers a retry', async ({ page }) => {
  await gotoApp(page, '/#/songs');
  await page.route(/mary-had-a-little-lamb[^/]*$/, (route) => route.abort());
  await page.goto('/#/play/mary-had-a-little-lamb');
  await expect(page.getByTestId('song-load-error')).toBeVisible();
  await page.unroute(/mary-had-a-little-lamb[^/]*$/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('play-ready')).toBeVisible();
});
