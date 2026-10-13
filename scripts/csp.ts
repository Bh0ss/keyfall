/**
 * The production Content-Security-Policy (delivered as a <meta> tag by the keyfall-csp plugin in vite.config.ts).
 * frame-ancestors is ignored in a meta tag and GitHub Pages cannot send headers, so clickjacking protection is not
 * available. style-src is 'self' only; style-src-attr allows inline style attributes because OSMD and VexFlow write them
 * (checked: the sheet view renders for every song under this policy, with no violations).
 */
/** The one host the Spotify link step may call (oEmbed: title and thumbnail). Shared by the policy and src/spotify/link.ts. */
export const SPOTIFY_OEMBED_HOST = 'open.spotify.com';
/**
 * Exact hosts the Spotify thumbnail may load from. -fa is what oEmbed returned in every call; -ak is included because
 * it resolves in DNS (Akamai), not because it was seen. No wildcard: an unknown host just shows no thumbnail.
 */
export const SPOTIFY_THUMBNAIL_HOSTS = ['image-cdn-fa.spotifycdn.com', 'image-cdn-ak.spotifycdn.com'] as const;

export function cspPolicy(supabaseUrl?: string): string {
  const host = supabaseUrl ? new URL(supabaseUrl).host : 'ubheylmkufyuamrgaqev.supabase.co';
  return [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self' https://${host} wss://${host} https://${SPOTIFY_OEMBED_HOST}`,
    `img-src 'self' data: blob: ${SPOTIFY_THUMBNAIL_HOSTS.map((h) => `https://${h}`).join(' ')}`,
    "font-src 'self' data:",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "worker-src 'self' blob:",
    "media-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
