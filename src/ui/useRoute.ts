import { useSyncExternalStore } from 'react';

export type Route = { name: 'connect' } | { name: 'songs' } | { name: 'settings' } | { name: 'play'; songId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path === 'songs') return { name: 'songs' };
  if (path === 'settings') return { name: 'settings' };
  const m = /^play\/(.+)$/.exec(path);
  if (m) return { name: 'play', songId: decodeURIComponent(m[1]!) };
  return { name: 'connect' };
}

export const hrefFor = {
  connect: () => '#/',
  songs: () => '#/songs',
  settings: () => '#/settings',
  play: (songId: string) => `#/play/${encodeURIComponent(songId)}`,
};

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
