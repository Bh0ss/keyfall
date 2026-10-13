/**
 * Runs the model off the main thread. WebGL only: with no WebGL it reports `unsupported` and the UI sends the player
 * elsewhere (there is no CPU path in the browser). This worker is not governed by the page's Content-Security-Policy
 * on Chrome, so it stays minimal: one message type in, no importScripts, and the only network access is the model
 * files, whose URL is built here from BASE_URL and a constant. No message can name a URL.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import { MODEL_DIR, MODEL_JSON } from './modelFiles';
import type { StartMessage, WorkerMessage } from './protocol';
import { runBasicPitch } from './runner';

const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m);
const MODEL_URL = `${import.meta.env.BASE_URL}${MODEL_DIR}${MODEL_JSON}`;
let started = false;

async function run(pcm: Float32Array): Promise<void> {
  let ok: boolean;
  try {
    ok = await tf.setBackend('webgl');
    await tf.ready();
  } catch {
    ok = false;
  }
  if (!ok || tf.getBackend() !== 'webgl') {
    post({ type: 'unsupported', reason: 'WebGL is not available in this browser.' });
    return;
  }
  post({ type: 'backend', backend: 'webgl' });
  post({ type: 'progress', stage: 'loading-model', fraction: 0 });
  const t0 = performance.now();
  const model = await loadGraphModel(MODEL_URL);
  const loadMs = performance.now() - t0;
  post({ type: 'progress', stage: 'loading-model', fraction: 1 });
  try {
    const r = await runBasicPitch(model, pcm, { onProgress: (p) => post({ type: 'progress', ...p }) });
    post({ type: 'done', notes: r.notes, info: { backend: 'webgl', loadMs, inferMs: r.inferMs, postMs: r.postMs } });
  } finally {
    model.dispose();
  }
}

self.onmessage = (e: MessageEvent<unknown>) => {
  const m = e.data as Partial<StartMessage> | null;
  if (started || m?.type !== 'start' || !(m.pcm instanceof Float32Array)) return;
  started = true;
  run(m.pcm).catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
};
