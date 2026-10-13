import { describe, expect, it } from 'vitest';
import { liveWorkers, TranscribeUnsupportedError, workerTranscriber, type WorkerLike } from '../src/transcribe/client';
import type { WorkerMessage } from '../src/transcribe/protocol';
import type { TranscribeProgress } from '../src/transcribe/types';

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  onmessageerror: WorkerLike['onmessageerror'] = null;
  terminated = 0;
  posted: unknown[] = [];
  transferred: Transferable[] = [];
  postMessage(m: unknown, t?: Transferable[] | StructuredSerializeOptions) {
    this.posted.push(m);
    this.transferred = Array.isArray(t) ? t : [];
  }
  terminate() {
    this.terminated++;
  }
  emit(m: WorkerMessage) {
    this.onmessage?.({ data: m } as MessageEvent<WorkerMessage>);
  }
}

const setup = () => {
  const w = new FakeWorker();
  let made = 0;
  const transcribe = workerTranscriber(() => (made++, w));
  return { w, transcribe, made: () => made };
};
const info = { backend: 'webgl', loadMs: 1, inferMs: 2, postMs: 3 };
const note = { midi: 60, startSec: 0, durationSec: 1, amplitude: 0.9 };

describe('workerTranscriber', () => {
  it('sends the samples as a transfer, relays progress, resolves with notes and terminates the worker', async () => {
    const { w, transcribe } = setup();
    const pcm = new Float32Array(100);
    const seen: TranscribeProgress[] = [];
    let got: unknown;
    const p = transcribe(pcm, { onProgress: (x) => seen.push(x), onInfo: (i) => (got = i) });
    expect(liveWorkers()).toBe(1);
    expect(w.posted).toEqual([{ type: 'start', pcm }]);
    expect(w.transferred).toEqual([pcm.buffer]);
    w.emit({ type: 'progress', stage: 'listening', fraction: 0.5 });
    w.emit({ type: 'done', notes: [note], info });
    await expect(p).resolves.toEqual([note]);
    expect(seen).toEqual([{ stage: 'listening', fraction: 0.5 }]);
    expect(got).toEqual(info);
    expect(w.terminated).toBe(1);
    expect(liveWorkers()).toBe(0);
  });

  it('copies samples that are a view into a larger buffer instead of transferring the whole buffer', async () => {
    const { w, transcribe } = setup();
    const big = new Float32Array(100);
    const view = big.subarray(10, 20);
    void transcribe(view);
    expect(w.transferred).toHaveLength(1);
    expect(w.transferred[0]).not.toBe(big.buffer);
    expect((w.posted[0] as { pcm: Float32Array }).pcm.length).toBe(10);
    w.emit({ type: 'done', notes: [], info });
  });

  it('abort terminates the worker once, rejects with AbortError and ignores late messages', async () => {
    const { w, transcribe } = setup();
    const ac = new AbortController();
    const p = transcribe(new Float32Array(10), { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.terminated).toBe(1);
    expect(liveWorkers()).toBe(0);
    w.emit({ type: 'done', notes: [note], info });
    expect(w.terminated).toBe(1);
  });

  it('an already-aborted signal never creates a worker', async () => {
    const { transcribe, made } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(transcribe(new Float32Array(10), { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(made()).toBe(0);
    expect(liveWorkers()).toBe(0);
  });

  it('unsupported, error and script-error messages reject and terminate', async () => {
    for (const [send, check] of [
      [(w: FakeWorker) => w.emit({ type: 'unsupported', reason: 'no webgl' }), (e: unknown) => e instanceof TranscribeUnsupportedError],
      [(w: FakeWorker) => w.emit({ type: 'error', message: 'boom' }), (e: unknown) => (e as Error).message === 'boom'],
      [(w: FakeWorker) => w.onerror?.({ message: 'script died' } as ErrorEvent), (e: unknown) => (e as Error).message === 'script died'],
    ] as const) {
      const { w, transcribe } = setup();
      const p = transcribe(new Float32Array(10));
      send(w);
      const e = await p.catch((x: unknown) => x);
      expect(check(e)).toBe(true);
      expect(w.terminated).toBe(1);
      expect(liveWorkers()).toBe(0);
    }
  });

  it('a worker that cannot be constructed is unsupported', async () => {
    const t = workerTranscriber(() => {
      throw new Error('no Worker');
    });
    await expect(t(new Float32Array(1))).rejects.toBeInstanceOf(TranscribeUnsupportedError);
    expect(liveWorkers()).toBe(0);
  });
});
