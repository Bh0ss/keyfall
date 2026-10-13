import { useSyncExternalStore } from 'react';
import type { Mode } from '../engine/judge';

/** Setup carried by a link, e.g. "Practice my mistakes" (Practice, bars 12-15, 70%). */
export interface PlayPreset {
  mode?: Mode;
  from?: number;
  to?: number;
  speedPct?: number;
  /** The Add song review's Wait-mode preview: plays a transient song, forces Wait and records nothing. */
  preview?: boolean;
}

export type Route =
  | { name: 'home' }
  | { name: 'keyboard' }
  | { name: 'songs' }
  | { name: 'learn'; unitId?: string; lessonId?: string }
  | { name: 'import'; songId?: string }
  | { name: 'addAudio' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'credits' }
  | { name: 'results'; attemptId: string }
  | { name: 'play'; songId: string; preset: PlayPreset };

const MODES: Mode[] = ['wait', 'practice', 'full', 'expert'];

function int(v: string | null): number | undefined {
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function parseRoute(hash: string): Route {
  const [pathPart = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const path = pathPart;
  if (path === 'songs') return { name: 'songs' };
  const learn = /^learn(?:\/([^/]+)(?:\/([^/]+))?)?$/.exec(path);
  if (learn) return { name: 'learn', unitId: learn[1] && decodeURIComponent(learn[1]), lessonId: learn[2] && decodeURIComponent(learn[2]) };
  const imp = /^import(?:\/(.+))?$/.exec(path);
  if (imp) return { name: 'import', songId: imp[1] && decodeURIComponent(imp[1]) };
  if (path === 'add/audio') return { name: 'addAudio' };
  if (path === 'stats') return { name: 'stats' };
  if (path === 'settings') return { name: 'settings' };
  if (path === 'credits') return { name: 'credits' };
  // "#setup" is the in-page anchor to the setup steps on the keyboard screen.
  if (path === 'keyboard' || path === 'setup') return { name: 'keyboard' };
  const results = /^results\/(.+)$/.exec(path);
  if (results) return { name: 'results', attemptId: decodeURIComponent(results[1]!) };
  const play = /^play\/(.+)$/.exec(path);
  if (play) {
    const q = new URLSearchParams(query);
    const mode = q.get('mode');
    const preset: PlayPreset = {
      mode: MODES.find((m) => m === mode),
      from: int(q.get('from')),
      to: int(q.get('to')),
      speedPct: int(q.get('speed')),
      preview: q.get('preview') === '1' ? true : undefined,
    };
    return { name: 'play', songId: decodeURIComponent(play[1]!), preset };
  }
  return { name: 'home' };
}

export const hrefFor = {
  home: () => '#/',
  keyboard: () => '#/keyboard',
  songs: () => '#/songs',
  learn: (unitId?: string, lessonId?: string) =>
    `#/learn${unitId ? `/${encodeURIComponent(unitId)}` : ''}${unitId && lessonId ? `/${encodeURIComponent(lessonId)}` : ''}`,
  import: (songId?: string) => `#/import${songId ? `/${encodeURIComponent(songId)}` : ''}`,
  addAudio: () => '#/add/audio',
  stats: () => '#/stats',
  settings: () => '#/settings',
  credits: () => '#/credits',
  results: (attemptId: string) => `#/results/${encodeURIComponent(attemptId)}`,
  play: (songId: string, preset?: PlayPreset) => {
    const q = new URLSearchParams();
    if (preset?.mode) q.set('mode', preset.mode);
    if (preset?.from) q.set('from', String(preset.from));
    if (preset?.to) q.set('to', String(preset.to));
    if (preset?.speedPct) q.set('speed', String(preset.speedPct));
    if (preset?.preview) q.set('preview', '1');
    const qs = q.toString();
    return `#/play/${encodeURIComponent(songId)}${qs ? `?${qs}` : ''}`;
  },
};

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
