import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cspPolicy, SPOTIFY_OEMBED_HOST, SPOTIFY_THUMBNAIL_HOSTS } from '../scripts/csp';
import { MAX_CLOCK_SKEW_MS, MAX_DATA_BYTES, SONG_MIME_TYPES, UPLOAD_CONTENT_TYPE, clampStamp } from '../src/sync/rules';
import type { RemoteRow } from '../src/sync/types';
import { FakeRemote } from './sync-fake-remote';

const row = (over: Partial<RemoteRow> = {}): RemoteRow => ({ id: 'r1', updated_at: 1000, deleted_at: null, data: { a: 1 }, ...over });
const NOW = 1_800_000_000_000;

describe('server limits (mirrored by the fake remote)', () => {
  it('rejects a row body of 64 KiB or more, accepts one just under', async () => {
    const remote = new FakeRemote();
    const fits = 'x'.repeat(MAX_DATA_BYTES - 100);
    await remote.upsert('profiles', [row({ data: { blob: fits } })]);
    expect(remote.rows('profiles')).toHaveLength(1);
    await expect(remote.upsert('attempts', [row({ id: 'big', data: { blob: 'x'.repeat(MAX_DATA_BYTES) } })])).rejects.toThrow(/data_size/);
    expect(remote.rows('attempts')).toHaveLength(0);
  });

  it('clamps an updated_at more than 5 minutes ahead of the server clock', async () => {
    const remote = new FakeRemote();
    remote.now = () => NOW;
    await remote.upsert('profiles', [row({ id: 'future', updated_at: NOW + 10 * 365 * 86_400_000, deleted_at: NOW + 99_999_999_999 })]);
    await remote.upsert('profiles', [row({ id: 'near', updated_at: NOW + MAX_CLOCK_SKEW_MS - 1 })]);
    const [future, near] = remote.rows('profiles');
    expect(future!.updated_at).toBe(NOW + MAX_CLOCK_SKEW_MS);
    expect(future!.deleted_at).toBe(NOW + MAX_CLOCK_SKEW_MS);
    expect(near!.updated_at).toBe(NOW + MAX_CLOCK_SKEW_MS - 1);
  });

  it('keeps a live row live: a null deleted_at is never clamped into a stamp', async () => {
    const remote = new FakeRemote();
    remote.now = () => NOW;
    await remote.upsert('profiles', [row({ updated_at: NOW + 10 * MAX_CLOCK_SKEW_MS, deleted_at: null })]);
    expect(remote.rows('profiles')[0]!.deleted_at).toBeNull();
  });

  it('a clamped stamp does not pin the row: a later real edit still wins', async () => {
    const remote = new FakeRemote();
    remote.now = () => NOW;
    await remote.upsert('profiles', [row({ updated_at: NOW + 10 * 365 * 86_400_000, data: { v: 'wrong clock' } })]);
    remote.now = () => NOW + MAX_CLOCK_SKEW_MS + 1000;
    await remote.upsert('profiles', [row({ updated_at: NOW + MAX_CLOCK_SKEW_MS + 500, data: { v: 'real' } })]);
    expect(remote.rows('profiles')[0]!.data).toEqual({ v: 'real' });
  });

  it('clampStamp leaves past and near stamps alone', () => {
    expect(clampStamp(5, NOW)).toBe(5);
    expect(clampStamp(NOW + MAX_CLOCK_SKEW_MS, NOW)).toBe(NOW + MAX_CLOCK_SKEW_MS);
    expect(clampStamp(NOW + MAX_CLOCK_SKEW_MS + 1, NOW)).toBe(NOW + MAX_CLOCK_SKEW_MS);
  });

  it('the songs bucket takes the client upload type and refuses others', async () => {
    const remote = new FakeRemote();
    expect(SONG_MIME_TYPES).toContain(UPLOAD_CONTENT_TYPE);
    await remote.upload('u/a', new ArrayBuffer(4));
    for (const type of ['audio/midi', 'audio/x-midi', 'application/vnd.recordare.musicxml+xml', 'application/xml', 'text/xml']) {
      await remote.upload('u/b', new ArrayBuffer(4), type);
    }
    await expect(remote.upload('u/c', new ArrayBuffer(4), 'text/html')).rejects.toThrow(/not supported/);
    await expect(remote.upload('u/c', new ArrayBuffer(4), 'application/javascript')).rejects.toThrow(/not supported/);
    expect(remote.files.has('u/c')).toBe(false);
  });
});

describe('the migration and the client agree', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261012130000_server_limits.sql', import.meta.url), 'utf8');

  it('lists exactly the allowed mime types', () => {
    for (const type of SONG_MIME_TYPES) expect(sql).toContain(`'${type}'`);
    const listed = [...sql.matchAll(/^\s+'([a-z.+/-]+)',?$/gm)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...SONG_MIME_TYPES].sort());
  });

  it('clamps deleted_at only when it is set (least() ignores null and would soft-delete every live row)', () => {
    const fix = readFileSync(new URL('../supabase/migrations/20261012130100_server_limits_null_fix.sql', import.meta.url), 'utf8');
    expect(fix).toMatch(/if new\.deleted_at is not null then\s+new\.deleted_at := least\(new\.deleted_at, ceiling\);/);
  });

  it('caps the body at the same size and clamps by the same margin on every sync table', () => {
    expect(sql).toContain(`pg_column_size(data) < ${MAX_DATA_BYTES}`);
    expect(sql).toContain(`+ ${MAX_CLOCK_SKEW_MS}`);
    for (const t of ['profiles', 'scores', 'attempts', 'learn_progress', 'note_stats', 'review_queue', 'imported_songs']) expect(sql).toContain(`'${t}'`);
  });
});

describe('Content-Security-Policy', () => {
  const policy = cspPolicy('https://abc.supabase.co');
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('allows only own scripts, and the Supabase and Spotify oEmbed hosts for connections', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('connect-src')).toBe("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co https://open.spotify.com");
    expect(directive('default-src')).toBe("default-src 'self'");
  });

  it('shuts off plugins, base-uri hijacking and foreign form posts, and never allows eval or inline scripts', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('form-action')).toBe("form-action 'self'");
    expect(directive('script-src')).not.toMatch(/unsafe/);
  });

  it('limits styles to own files plus inline style attributes', () => {
    expect(directive('style-src')).toBe("style-src 'self'");
    expect(directive('style-src-attr')).toBe("style-src-attr 'unsafe-inline'");
  });

  it('falls back to the project host without a configured URL', () => {
    expect(cspPolicy()).toContain('https://ubheylmkufyuamrgaqev.supabase.co');
  });
});

describe('Content-Security-Policy: Spotify link lookup', () => {
  const policy = cspPolicy('https://abc.supabase.co');
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('is exactly the agreed policy', () => {
    expect(policy).toBe(
      [
        "default-src 'self'",
        "script-src 'self'",
        'connect-src \'self\' https://abc.supabase.co wss://abc.supabase.co https://open.spotify.com',
        "img-src 'self' data: blob: https://image-cdn-fa.spotifycdn.com https://image-cdn-ak.spotifycdn.com",
        "font-src 'self' data:",
        "style-src 'self'",
        "style-src-attr 'unsafe-inline'",
        "worker-src 'self' blob:",
        "media-src 'self' blob: data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  });

  it('leaves script-src and worker-src alone and has no eval, wasm or wildcard hosts', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('worker-src')).toBe("worker-src 'self' blob:");
    expect(policy).not.toMatch(/unsafe-eval|wasm-unsafe-eval/);
    expect(policy).not.toMatch(/\*/);
  });

  it('is built from the shared host constants the UI allowlist uses', () => {
    expect(directive('connect-src')).toContain(`https://${SPOTIFY_OEMBED_HOST}`);
    for (const h of SPOTIFY_THUMBNAIL_HOSTS) expect(directive('img-src')).toContain(`https://${h}`);
    expect([...SPOTIFY_THUMBNAIL_HOSTS]).toEqual(['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com']);
  });
});
