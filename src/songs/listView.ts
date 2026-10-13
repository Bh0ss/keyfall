import type { Song } from '../engine/song.ts';

/** How the Songs list is ordered. */
export type SongSort = 'difficulty' | 'title' | 'recent';
/** Which songs the Songs list shows by hands. */
export type HandsFilter = 'all' | 'right' | 'left' | 'both';

export const SONG_SORTS: readonly SongSort[] = ['difficulty', 'title', 'recent'];
export const HANDS_FILTERS: readonly HandsFilter[] = ['all', 'right', 'left', 'both'];

/** The list as it was before sorting existed: easiest first. */
export const DEFAULT_SORT: SongSort = 'difficulty';
export const DEFAULT_HANDS_FILTER: HandsFilter = 'all';

/** What sorting and filtering read from a song. */
export type ListSong = Pick<Song, 'id' | 'title' | 'level' | 'hands'>;

/** Read a remembered value; anything unknown (an older or newer build wrote it) falls back to the default. */
export function parseSort(v: unknown): SongSort {
  return SONG_SORTS.find((s) => s === v) ?? DEFAULT_SORT;
}

export function parseHandsFilter(v: unknown): HandsFilter {
  return HANDS_FILTERS.find((h) => h === v) ?? DEFAULT_HANDS_FILTER;
}

const levelRank = (l: ListSong['level']) => (l === 'expert' ? 6 : l);
const byTitle = (a: ListSong, b: ListSong) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** A sorted copy. `lastPlayed` maps song id to the time it was last played; songs missing from it count as never played. */
export function sortSongs<T extends ListSong>(songs: readonly T[], sort: SongSort, lastPlayed: ReadonlyMap<string, number>): T[] {
  const out = [...songs];
  if (sort === 'title') return out.sort(byTitle);
  if (sort === 'difficulty') return out.sort((a, b) => levelRank(a.level) - levelRank(b.level) || byTitle(a, b));
  return out.sort((a, b) => {
    const ta = lastPlayed.get(a.id);
    const tb = lastPlayed.get(b.id);
    if (ta !== undefined && tb !== undefined) return tb - ta || byTitle(a, b);
    if (ta !== undefined) return -1;
    if (tb !== undefined) return 1;
    return byTitle(a, b);
  });
}

export function filterSongs<T extends ListSong>(songs: readonly T[], hands: HandsFilter): T[] {
  return hands === 'all' ? [...songs] : songs.filter((s) => s.hands === hands);
}

export function viewSongs<T extends ListSong>(songs: readonly T[], view: { sort: SongSort; hands: HandsFilter }, lastPlayed: ReadonlyMap<string, number>): T[] {
  return sortSongs(filterSongs(songs, view.hands), view.sort, lastPlayed);
}

/** Latest play time per song, from finished runs and high scores. */
export function lastPlayedBySong(attempts: readonly { songId: string; finishedAt: number }[], scores: readonly { songId: string; achievedAt: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  const note = (id: string, at: number) => {
    if (at > (out.get(id) ?? -Infinity)) out.set(id, at);
  };
  attempts.forEach((a) => note(a.songId, a.finishedAt));
  scores.forEach((s) => note(s.songId, s.achievedAt));
  return out;
}
