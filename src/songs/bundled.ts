import type { Song } from '../engine/song';
import index from 'virtual:song-index';
import { BUNDLED_ENTRIES } from './entries';
import { parseMusicXml } from './musicxml';
import type { SongSummary } from './summary';

/** Each MusicXML file is its own chunk, fetched when its song is opened. */
const loaders = import.meta.glob<string>('./*.musicxml', { query: '?raw', import: 'default' });

/** Lightweight listing of the bundled songs, in catalog order. */
export function bundledSummaries(): SongSummary[] {
  return index;
}

export function bundledSummary(id: string): SongSummary | undefined {
  return index.find((s) => s.id === id);
}

const loaded = new Map<string, Promise<Song | undefined>>();

/** Fetch and parse one bundled song. Cached; a failed fetch is not cached so a retry can succeed. */
export function loadBundledSong(id: string): Promise<Song | undefined> {
  const entry = BUNDLED_ENTRIES.find((e) => e.meta.id === id);
  const load = entry && loaders[`./${entry.file}.musicxml`];
  if (!entry || !load) return Promise.resolve(undefined);
  let p = loaded.get(id);
  if (!p) {
    p = load().then((xml) => parseMusicXml(xml, entry.meta));
    p.catch(() => loaded.delete(id));
    loaded.set(id, p);
  }
  return p;
}
