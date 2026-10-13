/**
 * `window.__keyfall.spotifyLookup`, behind ?debug=1 only (see midi/virtual.ts). Runs the real lookup and, if a
 * thumbnail came back, renders it in an <img> so the browser applies the page CSP to it, then reports whether it
 * loaded. Loaded on demand. Nothing is stored; the element is removed again after the check.
 */
import { lookupTrack } from './link';

export type DebugSpotifyResult =
  | { ok: true; title: string; thumbnail: string | undefined; thumbnailLoaded: boolean | undefined }
  | { ok: false; kind: string; message: string };

export async function debugSpotifyLookup(link: string): Promise<DebugSpotifyResult> {
  const r = await lookupTrack(link);
  if (!r.ok) return { ok: false, kind: r.kind, message: r.message };
  let thumbnailLoaded: boolean | undefined;
  if (r.thumbnail) {
    thumbnailLoaded = await new Promise<boolean>((resolve) => {
      const img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.dataset.testid = 'debug-spotify-thumb';
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = r.thumbnail as string;
      document.body.appendChild(img);
    });
    document.querySelector('[data-testid="debug-spotify-thumb"]')?.remove();
  }
  return { ok: true, title: r.title, thumbnail: r.thumbnail, thumbnailLoaded };
}
