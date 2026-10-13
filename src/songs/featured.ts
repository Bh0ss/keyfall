import type { Song } from '../engine/song.ts';

/** Home shows this many song tiles; the rest are one control away on the Songs list. */
export const FEATURED_LIMIT = 8;

type Featured = Pick<Song, 'id' | 'title' | 'level'>;

const levelRank = (l: Featured['level']) => (l === 'expert' ? 6 : l);
const byTitle = (a: Featured, b: Featured) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * The songs Home features, from the songs the profile can play. Deterministic: the up-next song first, then the
 * song played last (to pick it up again), then the rest by: never played, then fewer stars, then easiest level,
 * then title. Capped at FEATURED_LIMIT.
 */
export function featuredSongs<T extends Featured>(
  open: readonly T[],
  bestStars: ReadonlyMap<string, number>,
  lastSongId: string | undefined,
  nextId: string | undefined,
): T[] {
  const played = (id: string) => bestStars.get(id) ?? -1;
  const head = [nextId, lastSongId].flatMap((id) => open.find((s) => s.id === id) ?? []);
  const lead = head.filter((s, i) => head.findIndex((h) => h.id === s.id) === i);
  const rest = open
    .filter((s) => !lead.includes(s))
    .sort((a, b) => {
      return played(a.id) - played(b.id) || levelRank(a.level) - levelRank(b.level) || byTitle(a, b);
    });
  return [...lead, ...rest].slice(0, FEATURED_LIMIT);
}
