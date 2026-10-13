import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cspPolicy } from './scripts/csp.ts';
import { BUNDLED_ENTRIES } from './src/songs/entries.ts';
import { parseMusicXml } from './src/songs/musicxml.ts';
import { summarize } from './src/songs/summary.ts';
import { MODEL_DIR, MODEL_SOURCES } from './src/transcribe/modelFiles.ts';

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
 * The Basic Pitch model files, served from node_modules rather than committed (742 KB of binary stays out of git).
 * The build emits them under the base at `models/basic-pitch-<version>/`, with the package's Apache-2.0 LICENSE
 * beside them; the dev server serves the same paths. The transcription worker fetches them same-origin.
 */
function basicPitchModel(): Plugin {
  const pkgDir = fileURLToPath(new URL('./node_modules/@spotify/basic-pitch/', import.meta.url));
  let base = '/';
  return {
    name: 'keyfall-basic-pitch-model',
    configResolved(config) {
      base = config.base;
    },
    generateBundle() {
      for (const f of MODEL_SOURCES) {
        this.emitFile({ type: 'asset', fileName: `${MODEL_DIR}${f.to}`, source: readFileSync(join(pkgDir, f.from)) });
      }
    },
    configureServer(server) {
      const prefix = `${base}${MODEL_DIR}`;
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!;
        const name = path.startsWith(prefix) ? path.slice(prefix.length) : path.startsWith(`/${MODEL_DIR}`) ? path.slice(MODEL_DIR.length + 1) : null;
        const file = MODEL_SOURCES.find((f) => f.to === name);
        if (!file) return next();
        res.setHeader('Content-Type', file.type);
        res.end(readFileSync(join(pkgDir, file.from)));
      });
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
  plugins: [react(), songIndex(), basicPitchModel(), contentSecurityPolicy()],
  // The transcription worker is an ES module (it imports TF.js), so it can be code-split like the app.
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  test: { include: ['tests/**/*.test.ts'] },
});
