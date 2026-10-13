/**
 * Where the Basic Pitch model lives, shared by the Vite plugin (which emits the files), the worker (which fetches
 * them) and the tests. No imports on purpose: vite.config.ts loads this in Node. The version is in the directory so a
 * model change busts GitHub Pages' cache.
 */
export const MODEL_VERSION = '1.0.1';
export const MODEL_DIR = `models/basic-pitch-${MODEL_VERSION}/`;
export const MODEL_JSON = 'model.json';
/** Every file the plugin copies from node_modules/@spotify/basic-pitch (the licence travels with the model). */
export const MODEL_SOURCES: readonly { from: string; to: string; type: string }[] = [
  { from: 'model/model.json', to: MODEL_JSON, type: 'application/json' },
  { from: 'model/group1-shard1of1.bin', to: 'group1-shard1of1.bin', type: 'application/octet-stream' },
  { from: 'LICENSE', to: 'LICENSE', type: 'text/plain' },
];
