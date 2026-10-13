import { describe, expect, it } from 'vitest';
import { cleanTitle, lookupTrack, parseTrackUrl, thumbnailIfAllowed } from '../src/spotify/link';

const ID = '4uLU6hMCjMI75M1A2tKUQC';
const CANON = `https://open.spotify.com/track/${ID}`;

describe('parseTrackUrl', () => {
  const accept: [string, string][] = [
    ['plain track link', CANON],
    ['trailing slash', `${CANON}/`],
    ['query string (share link)', `${CANON}?si=abc123`],
    ['fragment', `${CANON}#x`],
    ['intl segment', `https://open.spotify.com/intl-de/track/${ID}`],
    ['intl segment with region', `https://open.spotify.com/intl-pt-br/track/${ID}?si=1`],
    ['surrounding whitespace', `  ${CANON}\n`],
    ['uppercase host (hosts are case-insensitive)', `https://OPEN.SPOTIFY.COM/track/${ID}`],
    ['explicit default port', `https://open.spotify.com:443/track/${ID}`],
  ];
  it.each(accept)('accepts %s and normalises it', (_name, input) => {
    expect(parseTrackUrl(input)).toEqual({ ok: true, id: ID, url: CANON });
  });

  const reject: [string, string][] = [
    ['empty', ''],
    ['not a url', 'hello'],
    ['album', `https://open.spotify.com/album/${ID}`],
    ['playlist', `https://open.spotify.com/playlist/${ID}`],
    ['artist', `https://open.spotify.com/artist/${ID}`],
    ['episode', `https://open.spotify.com/episode/${ID}`],
    ['show', `https://open.spotify.com/show/${ID}`],
    ['spotify: uri', `spotify:track:${ID}`],
    ['spotify.link short link', 'https://spotify.link/abcDEF123'],
    ['http', `http://open.spotify.com/track/${ID}`],
    ['other host', `https://example.com/track/${ID}`],
    ['lookalike suffix', `https://open.spotify.com.evil.com/track/${ID}`],
    ['lookalike prefix', `https://evilopen.spotify.com/track/${ID}`],
    ['lookalike in path', `https://evil.com/open.spotify.com/track/${ID}`],
    ['lookalike in query', `https://evil.com/?u=https://open.spotify.com/track/${ID}`],
    ['subdomain', `https://www.open.spotify.com/track/${ID}`],
    ['userinfo', `https://x@open.spotify.com/track/${ID}`],
    ['userinfo with password', `https://x:y@open.spotify.com/track/${ID}`],
    ['userinfo that spells the host', `https://open.spotify.com@evil.com/track/${ID}`],
    ['trailing dot host', `https://open.spotify.com./track/${ID}`],
    ['other port', `https://open.spotify.com:8443/track/${ID}`],
    ['encoded slash after track', `https://open.spotify.com/track%2F${ID}`],
    ['encoded slashes in path', `https://open.spotify.com%2Ftrack%2F${ID}`],
    ['encoded id character', `https://open.spotify.com/track/${ID.slice(0, 21)}%41`],
    ['backslash path', `https://open.spotify.com\\track\\${ID}`],
    ['id too short', `https://open.spotify.com/track/${ID.slice(1)}`],
    ['id too long', `https://open.spotify.com/track/${ID}A`],
    ['id with punctuation', `https://open.spotify.com/track/${ID.slice(0, 21)}-`],
    ['extra path segment', `https://open.spotify.com/track/${ID}/extra`],
    ['dot-dot path', `https://open.spotify.com/track/../album/${ID}`],
    ['bad intl segment', `https://open.spotify.com/intl-DEUTSCH/track/${ID}`],
    ['two intl segments', `https://open.spotify.com/intl-de/intl-fr/track/${ID}`],
    ['embed path', `https://open.spotify.com/embed/track/${ID}`],
    ['javascript url', 'javascript:alert(1)'],
  ];
  it.each(reject)('rejects %s', (_name, input) => {
    const r = parseTrackUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });
});

describe('cleanTitle', () => {
  it('trims, collapses whitespace, strips control characters and caps at 120', () => {
    expect(cleanTitle('  Never\tGonna \n Give  You Up\u0000 ')).toBe('Never Gonna Give You Up');
    expect(cleanTitle('a'.repeat(300))).toHaveLength(120);
    expect(cleanTitle(42)).toBe('');
    expect(cleanTitle(undefined)).toBe('');
  });
});

describe('thumbnailIfAllowed', () => {
  it('passes only https URLs on an exact allowlisted host', () => {
    expect(thumbnailIfAllowed('https://image-cdn-fa.spotifycdn.com/image/abc')).toBe('https://image-cdn-fa.spotifycdn.com/image/abc');
    expect(thumbnailIfAllowed('https://image-cdn-ak.spotifycdn.com/image/abc')).toBe('https://image-cdn-ak.spotifycdn.com/image/abc');
  });
  it.each([
    ['other spotify cdn host', 'https://i.scdn.co/image/abc'],
    ['suffix lookalike', 'https://image-cdn-fa.spotifycdn.com.evil.com/x'],
    ['prefix lookalike', 'https://evil-image-cdn-fa.spotifycdn.com/x'],
    ['subdomain', 'https://x.image-cdn-fa.spotifycdn.com/x'],
    ['http', 'http://image-cdn-fa.spotifycdn.com/x'],
    ['userinfo', 'https://u@image-cdn-fa.spotifycdn.com/x'],
    ['other port', 'https://image-cdn-fa.spotifycdn.com:444/x'],
    ['data url', 'data:image/png;base64,AAAA'],
    ['not a url', 'nope'],
    ['not a string', 7],
    ['missing', undefined],
  ])('drops %s', (_name, input) => {
    expect(thumbnailIfAllowed(input)).toBeUndefined();
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

describe('lookupTrack', () => {
  it('asks oEmbed for the normalised URL with no credentials and no referrer, and reads title and thumbnail only', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchStub = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        title: '  Some Song ',
        thumbnail_url: 'https://image-cdn-fa.spotifycdn.com/image/abc',
        html: '<iframe src="https://evil.example"></iframe>',
        iframe_url: 'https://evil.example',
        author_name: 'ignored',
      });
    }) as typeof fetch;
    const r = await lookupTrack(`https://open.spotify.com/intl-de/track/${ID}?si=zzz`, { fetch: fetchStub });
    expect(r).toEqual({ ok: true, title: 'Some Song', thumbnail: 'https://image-cdn-fa.spotifycdn.com/image/abc' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`https://open.spotify.com/oembed?url=${encodeURIComponent(CANON)}`);
    expect(calls[0].init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', method: 'GET' });
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('never calls fetch for an invalid link', async () => {
    let called = 0;
    const fetchStub = (async () => {
      called++;
      return jsonResponse({});
    }) as typeof fetch;
    const r = await lookupTrack(`https://open.spotify.com/album/${ID}`, { fetch: fetchStub });
    expect(r).toMatchObject({ ok: false, kind: 'invalid-link' });
    expect(called).toBe(0);
  });

  it('drops a thumbnail on a host outside the allowlist but keeps the title', async () => {
    const r = await lookupTrack(CANON, { fetch: (async () => jsonResponse({ title: 'T', thumbnail_url: 'https://evil.example/x.png' })) as typeof fetch });
    expect(r).toEqual({ ok: true, title: 'T', thumbnail: undefined });
  });

  it('caps the title at 120 characters', async () => {
    const r = await lookupTrack(CANON, { fetch: (async () => jsonResponse({ title: 'x'.repeat(500) })) as typeof fetch });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.title).toHaveLength(120);
  });

  const failures: [string, () => Promise<Response>][] = [
    ['404', async () => jsonResponse({}, { status: 404 })],
    ['500', async () => jsonResponse({}, { status: 500 })],
    ['network error', async () => Promise.reject(new TypeError('Failed to fetch'))],
    ['not json', async () => jsonResponse('<html>nope</html>')],
    ['json null', async () => jsonResponse('null')],
    ['json array', async () => jsonResponse('[]')],
    ['missing title', async () => jsonResponse({ thumbnail_url: 'https://image-cdn-fa.spotifycdn.com/x' })],
    ['non-string title', async () => jsonResponse({ title: 5 })],
    ['blank title', async () => jsonResponse({ title: '   ' })],
  ];
  it.each(failures)('falls back to manual entry on %s', async (_name, respond) => {
    const r = await lookupTrack(CANON, { fetch: (async () => respond()) as typeof fetch });
    expect(r).toMatchObject({ ok: false, kind: 'lookup-failed' });
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });

  it('times out and aborts the request', async () => {
    let aborted = false;
    const fetchStub = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          rej(new DOMException('aborted', 'AbortError'));
        });
      })) as typeof fetch;
    const r = await lookupTrack(CANON, { fetch: fetchStub, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, kind: 'lookup-failed' });
    expect(aborted).toBe(true);
  });

  it('reports cancelled when the caller aborts', async () => {
    const ac = new AbortController();
    const fetchStub = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const p = lookupTrack(CANON, { fetch: fetchStub, signal: ac.signal, timeoutMs: 5000 });
    ac.abort();
    expect(await p).toMatchObject({ ok: false, kind: 'cancelled' });
  });

  it('does not store the link or thumbnail anywhere it can be read back', async () => {
    const r = await lookupTrack(CANON, { fetch: (async () => jsonResponse({ title: 'T' })) as typeof fetch });
    expect(Object.keys(r).sort()).toEqual(['ok', 'thumbnail', 'title'].sort().filter((k) => k in r));
    expect(JSON.stringify(r)).not.toContain(ID);
  });
});
