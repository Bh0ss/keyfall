import { expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { gotoApp, isolateMidi } from './helpers';

/**
 * The Spotify link lookup with oEmbed stubbed (page.route; no real Spotify call). Dark: there is no screen yet, so
 * the debug hook performs the lookup and renders the thumbnail. On the preview build (KEYFALL_PREVIEW=1) the CSP is
 * live, so the `test` from ./fixtures fails this spec on any violation from the oEmbed fetch or the image.
 */
test.beforeEach(async ({ page }) => {
  await isolateMidi(page);
});

const LINK = 'https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=abc';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

async function stub(page: Page, reply: { status?: number; body?: unknown }) {
  const seen: string[] = [];
  await page.route('https://open.spotify.com/oembed*', async (route) => {
    seen.push(route.request().url());
    await route.fulfill({ status: reply.status ?? 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) });
  });
  for (const host of ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']) {
    await page.route(`https://${host}/**`, (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: PNG }));
  }
  return seen;
}

const lookup = (page: Page, link: string) => page.evaluate((l) => window.__keyfall!.spotifyLookup(l), link);

test.describe('spotify link lookup (debug path)', () => {
  test('reads the title, normalises the link and loads the thumbnail with no CSP violation', async ({ page }) => {
    const seen = await stub(page, {
      body: { title: '  A Test Song ', thumbnail_url: 'https://image-cdn-fa.spotifycdn.com/image/test', html: '<iframe></iframe>' },
    });
    await gotoApp(page, './?debug=1#/');
    const r = await lookup(page, LINK);
    expect(r).toMatchObject({ ok: true, title: 'A Test Song', thumbnail: 'https://image-cdn-fa.spotifycdn.com/image/test', thumbnailLoaded: true });
    expect(seen).toEqual([`https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')}`]);
  });

  test('the -ak thumbnail host loads too', async ({ page }) => {
    await stub(page, { body: { title: 'Akamai', thumbnail_url: 'https://image-cdn-ak.spotifycdn.com/image/test' } });
    await gotoApp(page, './?debug=1#/');
    expect(await lookup(page, LINK)).toMatchObject({ ok: true, thumbnailLoaded: true });
  });

  test('a thumbnail on an unlisted host is never requested', async ({ page }) => {
    await stub(page, { body: { title: 'Elsewhere', thumbnail_url: 'https://i.scdn.co/image/test' } });
    const requested: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('scdn.co')) requested.push(req.url());
    });
    await gotoApp(page, './?debug=1#/');
    expect(await lookup(page, LINK)).toMatchObject({ ok: true, title: 'Elsewhere', thumbnail: undefined, thumbnailLoaded: undefined });
    expect(requested).toEqual([]);
  });

  test('a failed lookup falls back to manual entry', async ({ page }) => {
    await stub(page, { status: 404 });
    await gotoApp(page, './?debug=1#/');
    expect(await lookup(page, LINK)).toMatchObject({ ok: false, kind: 'lookup-failed' });
  });

  test('an invalid link makes no request at all', async ({ page }) => {
    const seen = await stub(page, { body: { title: 'x' } });
    await gotoApp(page, './?debug=1#/');
    expect(await lookup(page, 'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC')).toMatchObject({ ok: false, kind: 'invalid-link' });
    expect(seen).toEqual([]);
  });
});
