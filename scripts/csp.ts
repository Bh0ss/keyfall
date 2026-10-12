/**
 * The production Content-Security-Policy (delivered as a <meta> tag by the keyfall-csp plugin in vite.config.ts).
 * frame-ancestors is ignored in a meta tag and GitHub Pages cannot send headers, so clickjacking protection is not
 * available. style-src is 'self' only; style-src-attr allows inline style attributes because OSMD and VexFlow write them
 * (checked: the sheet view renders for every song under this policy, with no violations).
 */
export function cspPolicy(supabaseUrl?: string): string {
  const host = supabaseUrl ? new URL(supabaseUrl).host : 'ubheylmkufyuamrgaqev.supabase.co';
  return [
    "default-src 'self'",
    "script-src 'self'",
    `connect-src 'self' https://${host} wss://${host}`,
    "img-src 'self' data: blob:",
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
