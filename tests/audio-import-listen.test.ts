import { describe, expect, it } from 'vitest';
import { Listener, projectedTotalSec, type ListenDeps, type ListenState } from '../src/audioImport/listen';
import { ImportError, MAX_AUDIO_SECONDS_PHONE } from '../src/import/limits';
import { TranscribeUnsupportedError, workerTranscriber, type Transcriber, type WorkerLike } from '../src/transcribe/client';
import type { WorkerMessage } from '../src/transcribe/protocol';
import { SAMPLE_RATE, type NoteEvent, type TranscribeProgress } from '../src/transcribe/types';

const NOTES: NoteEvent[] = [{ midi: 60, startSec: 0, durationSec: 1, amplitude: 0.9 }];
const file = { name: 'a.wav', size: 10, arrayBuffer: async () => new ArrayBuffer(1) };
const decoded = (seconds: number) => async () => ({ pcm: new Float32Array(Math.round(seconds * SAMPLE_RATE)), seconds });

/** A transcriber the test steps by hand, and which keeps talking after an abort the way a careless worker could. */
function manual() {
  let onProgress: ((p: TranscribeProgress) => void) | undefined;
  let finish: ((n: NoteEvent[]) => void) | undefined;
  let fail: ((e: Error) => void) | undefined;
  let calls = 0;
  const transcribe: Transcriber = (_pcm, o) =>
    new Promise((resolve, reject) => {
      calls++;
      onProgress = o?.onProgress;
      finish = resolve;
      fail = reject;
    });
  return { transcribe, progress: (p: TranscribeProgress) => onProgress?.(p), finish: (n: NoteEvent[]) => finish?.(n), fail: (e: Error) => fail?.(e), calls: () => calls };
}

function setup(over: Partial<ListenDeps> = {}) {
  const m = manual();
  let t = 0;
  const deps: ListenDeps = { decode: decoded(10), transcribe: m.transcribe, isPhone: false, now: () => t, paceLimitSec: () => 120, ...over };
  const l = new Listener(deps);
  const seen: ListenState[] = [];
  l.subscribe(() => seen.push(l.getState()));
  return { l, m, seen, tick: (ms: number) => (t += ms) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Listener', () => {
  it('decodes, relays progress through the three stages and finishes with the notes', async () => {
    const { l, m } = setup();
    l.start(file);
    expect(l.getState().phase).toBe('decoding');
    await flush();
    m.progress({ stage: 'loading-model', fraction: 0.5 });
    expect(l.getState()).toMatchObject({ phase: 'running', stage: 'loading-model', fraction: 0.5 });
    m.progress({ stage: 'listening', fraction: 0.4 });
    m.progress({ stage: 'finishing', fraction: 0 });
    expect(l.getState()).toMatchObject({ phase: 'running', stage: 'finishing' });
    m.finish(NOTES);
    await flush();
    expect(l.getState()).toEqual({ phase: 'done', notes: NOTES, seconds: 10 });
  });

  it('a bad file is a failure with the importer message and no model run', async () => {
    const { l, m } = setup({ decode: async () => Promise.reject(new ImportError('That recording is silent.')) });
    l.start(file);
    await flush();
    expect(l.getState()).toEqual({ phase: 'failed', message: 'That recording is silent.' });
    expect(m.calls()).toBe(0);
  });

  it.each([
    ['WebGL is missing', new TranscribeUnsupportedError('no webgl'), 'no-webgl'],
    ['the worker fails', new Error('boom'), 'worker-error'],
  ])('when %s the "works best on the Mac" card shows, with no Try anyway', async (_n, err, reason) => {
    const { l, m } = setup();
    l.start(file);
    await flush();
    m.fail(err);
    await flush();
    expect(l.getState()).toMatchObject({ phase: 'fallback', fallback: { reason, canTryAnyway: false } });
  });

  it('on an iPhone a recording over the phone cap shows the card without starting the model', async () => {
    const { l, m } = setup({ isPhone: true, decode: decoded(MAX_AUDIO_SECONDS_PHONE + 1) });
    l.start(file);
    await flush();
    expect(l.getState()).toMatchObject({ phase: 'fallback', fallback: { reason: 'too-long-phone', canTryAnyway: false } });
    expect(m.calls()).toBe(0);
  });

  it('the same length on a computer runs normally', async () => {
    const { l, m } = setup({ decode: decoded(MAX_AUDIO_SECONDS_PHONE + 1) });
    l.start(file);
    await flush();
    expect(m.calls()).toBe(1);
    expect(l.getState().phase).toBe('running');
  });

  describe('pace check', () => {
    // 60 s of audio is 31 windows, so 3 windows is a fraction of 3/31.
    it('after 3 windows a projected total over the limit offers Try anyway, and the run keeps going', async () => {
      const { l, m, tick } = setup({ decode: decoded(60), paceLimitSec: () => 10 });
      l.start(file);
      await flush();
      m.progress({ stage: 'loading-model', fraction: 1 });
      tick(4000);
      m.progress({ stage: 'listening', fraction: 3 / 31 });
      const s = l.getState();
      expect(s).toMatchObject({ phase: 'running', fallback: { reason: 'too-slow', canTryAnyway: true } });
      l.tryAnyway();
      expect(l.getState()).toMatchObject({ phase: 'running', fallback: null });
      m.progress({ stage: 'listening', fraction: 6 / 31 });
      expect(l.getState()).toMatchObject({ fallback: null });
    });

    it('does not judge before 3 windows, and a fast run is never flagged', async () => {
      const { l, m, tick } = setup({ decode: decoded(60), paceLimitSec: () => 10 });
      l.start(file);
      await flush();
      m.progress({ stage: 'loading-model', fraction: 1 });
      tick(9000);
      m.progress({ stage: 'listening', fraction: 2 / 31 });
      expect(l.getState()).toMatchObject({ fallback: null });
      const fast = setup({ decode: decoded(60), paceLimitSec: () => 120 });
      fast.l.start(file);
      await flush();
      fast.m.progress({ stage: 'loading-model', fraction: 1 });
      fast.tick(300);
      fast.m.progress({ stage: 'listening', fraction: 3 / 31 });
      expect(fast.l.getState()).toMatchObject({ fallback: null });
    });

    it('projectedTotalSec scales the listening time up by what is left and adds the finishing share', () => {
      expect(projectedTotalSec(2, 0.1)).toBe(100);
      expect(projectedTotalSec(2, 0.5)).toBe(20);
    });
  });

  describe('cancel', () => {
    it.each(['decoding', 'loading-model', 'listening', 'finishing'] as const)('during %s: back to idle, and nothing that arrives later changes the state', async (stage) => {
      const { l, m, seen } = setup();
      l.start(file);
      if (stage !== 'decoding') {
        await flush();
        m.progress({ stage, fraction: 0.2 });
      }
      l.cancel();
      expect(l.getState()).toEqual({ phase: 'idle' });
      const count = seen.length;
      m.progress({ stage: 'listening', fraction: 0.9 });
      m.finish(NOTES);
      m.fail(new Error('late'));
      await flush();
      expect(l.getState()).toEqual({ phase: 'idle' });
      expect(seen).toHaveLength(count);
    });

    it('a fresh run after a cancel works and is not disturbed by the old one', async () => {
      const first = setup();
      first.l.start(file);
      await flush();
      first.l.cancel();
      first.l.start(file);
      await flush();
      expect(first.m.calls()).toBe(2);
      first.m.progress({ stage: 'listening', fraction: 0.5 });
      first.m.finish(NOTES);
      await flush();
      expect(first.l.getState()).toMatchObject({ phase: 'done' });
    });

    it('cancelling aborts the transcriber signal', async () => {
      let signal: AbortSignal | undefined;
      const { l } = setup({ transcribe: (_p, o) => ((signal = o?.signal), new Promise(() => undefined)) });
      l.start(file);
      await flush();
      l.cancel();
      expect(signal?.aborted).toBe(true);
    });
  });

  it('with the real worker client: cancel terminates the worker, later worker messages are dropped, and a new run works', async () => {
    class W implements WorkerLike {
      onmessage: WorkerLike['onmessage'] = null;
      onerror: WorkerLike['onerror'] = null;
      onmessageerror: WorkerLike['onmessageerror'] = null;
      terminated = 0;
      postMessage() {}
      terminate() {
        this.terminated++;
      }
      emit(m: WorkerMessage) {
        this.onmessage?.({ data: m } as MessageEvent<WorkerMessage>);
      }
    }
    const workers: W[] = [];
    const transcribe = workerTranscriber(() => {
      const w = new W();
      workers.push(w);
      return w;
    });
    const { l, seen } = setup({ transcribe });
    l.start(file);
    await flush();
    workers[0]!.emit({ type: 'progress', stage: 'finishing', fraction: 0 });
    expect(l.getState()).toMatchObject({ stage: 'finishing' });
    const old = workers[0]!;
    l.cancel();
    expect(old.terminated).toBe(1);
    const count = seen.length;
    old.emit({ type: 'done', notes: NOTES, info: { backend: 'webgl', loadMs: 0, inferMs: 0, postMs: 0 } });
    await flush();
    expect(seen).toHaveLength(count);
    l.start(file);
    await flush();
    workers[1]!.emit({ type: 'done', notes: NOTES, info: { backend: 'webgl', loadMs: 0, inferMs: 0, postMs: 0 } });
    await flush();
    expect(l.getState()).toMatchObject({ phase: 'done' });
  });
});
