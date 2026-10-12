import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cspPolicy } from './scripts/csp.ts';
import { BUNDLED_ENTRIES } from './src/songs/entries.ts';
import { parseMusicXml } from './src/songs/musicxml.ts';
import { summarize } from './src/songs/summary.ts';

const VIRTUAL = 'virtual:song-index';

/**
 * `virtual:song-index`: a summary (title, composer, level, hands, tempo, note and bar counts) of every
 * bundled song, computed from the MusicXML at build time. The app lists songs from this and loads the
 * MusicXML itself (one small chunk per song) only when a song is opened, so the main chunk stays small.
 */
function songIndex(): Plugin {
  return {
    name: 'keyfall-song-index',
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return undefined;
      const index = BUNDLED_ENTRIES.map((e) => {
        const file = fileURLToPath(new URL(`./src/songs/${e.file}.musicxml`, import.meta.url));
        this.addWatchFile(file);
        return summarize(parseMusicXml(readFileSync(file, 'utf8'), e.meta));
      });
      return `export default ${JSON.stringify(index)};`;
    },
  };
}

/**
 * Content-Security-Policy as a <meta> tag, in the production build only: the dev server's HMR client needs an
 * inline script and a websocket back to Vite, so a strict policy there would break `npm run dev`.
 */
function contentSecurityPolicy(): Plugin {
  let policy = cspPolicy();
  return {
    name: 'keyfall-csp',
    apply: 'build',
    configResolved(config) {
      policy = cspPolicy(loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_').VITE_SUPABASE_URL);
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: '/keyfall/',
  plugins: [react(), songIndex(), contentSecurityPolicy()],
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
