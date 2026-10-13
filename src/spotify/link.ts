/**
 * The Spotify link step: validate a track link, then ask Spotify's oEmbed for the title and thumbnail.
 * Nothing here is stored. The link and the thumbnail are shown and dropped; only a title the player confirms
 * (plus an artist they type, since oEmbed has none) ever reaches a song record. The reply is untrusted: only
 * `title` and `thumbnail_url` are read, `html` and `iframe_url` are never rendered, and a thumbnail on any host
 * outside the CSP image allowlist is dropped so no violation can fire. Any failure means manual title/artist entry.
 */
import { SPOTIFY_OEMBED_HOST, SPOTIFY_THUMBNAIL_HOSTS } from '../../scripts/csp';
import { clean } from '../import/limits';

export const TITLE_MAX = 120;
export const LOOKUP_TIMEOUT_MS = 8000;

const TRACK_PATH = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2,4})?\/)?track\/([A-Za-z0-9]{22})\/?$/;

export type ParsedTrackUrl = { ok: true; id: string; url: string } | { ok: false; message: string };

const NOT_A_TRACK = 'That is not a Spotify track link. Open the song in Spotify, choose Share, then Copy Song Link.';

/** Exact checks on the parsed URL, never substrings. Returns the canonical https://open.spotify.com/track/<id>. */
export function parseTrackUrl(input: string): ParsedTrackUrl {
  const text = input.trim();
  if (!text || text.includes('\\')) return { ok: false, message: NOT_A_TRACK };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, message: NOT_A_TRACK };
  }
  if (u.protocol !== 'https:' || u.hostname !== SPOTIFY_OEMBED_HOST || u.port !== '' || u.username !== '' || u.password !== '') {
    return { ok: false, message: NOT_A_TRACK };
  }
  const id = TRACK_PATH.exec(u.pathname)?.[1];
  if (!id) return { ok: false, message: NOT_A_TRACK };
  return { ok: true, id, url: `https://${SPOTIFY_OEMBED_HOST}/track/${id}` };
}

/** A title from the web, safe to show and to store as a song title. */
export function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? clean(value, TITLE_MAX) : '';
}

/** The thumbnail URL when it is https on an exact allowlisted host with no userinfo or port; otherwise undefined. */
export function thumbnailIfAllowed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const u = new URL(value);
    const hosts: readonly string[] = SPOTIFY_THUMBNAIL_HOSTS;
    if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '' || !hosts.includes(u.hostname)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export type LookupResult =
  | { ok: true; title: string; thumbnail: string | undefined }
  | { ok: false; kind: 'invalid-link' | 'lookup-failed' | 'cancelled'; message: string };

export interface LookupOptions {
  /** Test seam; defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const MANUAL = 'Could not read that song from Spotify. Type the title and artist instead.';

export async function lookupTrack(input: string, opts: LookupOptions = {}): Promise<LookupResult> {
  const parsed = parseTrackUrl(input);
  if (!parsed.ok) return { ok: false, kind: 'invalid-link', message: parsed.message };
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (opts.signal?.aborted) return { ok: false, kind: 'cancelled', message: 'Cancelled.' };
  opts.signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  try {
    const doFetch = opts.fetch ?? fetch;
    const res = await doFetch(`https://${SPOTIFY_OEMBED_HOST}/oembed?url=${encodeURIComponent(parsed.url)}`, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, kind: 'lookup-failed', message: MANUAL };
    const body: unknown = await res.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, kind: 'lookup-failed', message: MANUAL };
    const reply = body as Record<string, unknown>;
    const title = cleanTitle(reply.title);
    if (!title) return { ok: false, kind: 'lookup-failed', message: MANUAL };
    return { ok: true, title, thumbnail: thumbnailIfAllowed(reply.thumbnail_url) };
  } catch {
    if (opts.signal?.aborted) return { ok: false, kind: 'cancelled', message: 'Cancelled.' };
    return { ok: false, kind: 'lookup-failed', message: MANUAL };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
