/**
 * Server rules the Supabase side enforces (supabase/migrations/20261012130000_server_limits.sql).
 * They live here so the client uploads a type the bucket accepts and the unit-test fake can mirror the database.
 */

/** Content types the `songs` bucket accepts. */
export const SONG_MIME_TYPES = [
  'audio/midi',
  'audio/x-midi',
  'application/vnd.recordare.musicxml+xml',
  'application/vnd.recordare.musicxml',
  'application/xml',
  'text/xml',
  'application/octet-stream',
] as const;

/** What the client sends: the original file is stored verbatim and its kind is known from the row, so the neutral type. */
export const UPLOAD_CONTENT_TYPE = 'application/octet-stream';

/** A synced row's JSON body must stay under this many bytes (check constraint on every sync table). */
export const MAX_DATA_BYTES = 65536;

/** A client stamp more than this far past the server clock is clamped to it (trigger keyfall_touch). */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function clampStamp(stamp: number, nowMs: number): number {
  return Math.min(stamp, nowMs + MAX_CLOCK_SKEW_MS);
}
