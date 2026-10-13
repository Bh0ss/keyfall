/**
 * One "listening" run for the Add song screen: decode the file, run the transcriber, and report where it is. A plain
 * class (no React) so the rules are testable: the card for a device that cannot do this, the pace check, and
 * cancellation. Cancelling bumps a run token and aborts the transcriber (which terminates the worker); anything the
 * old run reports afterwards is dropped, so no progress or result can arrive after a cancel.
 */
import { ImportError, MAX_AUDIO_SECONDS_PHONE } from '../import/limits';
import { TranscribeUnsupportedError, type Transcriber } from '../transcribe/client';
import type { NoteEvent, TranscribeStage } from '../transcribe/types';
import { windowCount } from '../transcribe/windows';

export type FallbackReason = 'no-webgl' | 'too-long-phone' | 'worker-error' | 'too-slow';
export interface Fallback {
  reason: FallbackReason;
  message: string;
  /** Only the pace check offers it: the run is still going and the player may let it finish. */
  canTryAnyway: boolean;
}

export type ListenState =
  | { phase: 'idle' }
  | { phase: 'decoding' }
  | { phase: 'running'; stage: TranscribeStage; fraction: number; fallback: Fallback | null }
  | { phase: 'done'; notes: NoteEvent[]; seconds: number }
  | { phase: 'failed'; message: string }
  | { phase: 'fallback'; fallback: Fallback };

export interface ListenDeps {
  decode(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<{ pcm: Float32Array; seconds: number }>;
  transcribe: Transcriber;
  isPhone: boolean;
  /** Milliseconds, any clock. */
  now(): number;
  /** A projected total over this many seconds offers the card with Try anyway. */
  paceLimitSec(): number;
}

/** Windows judged before the pace check, so the model load and shader compile do not count. */
const PACE_WINDOWS = 3;
/** Post-processing took about 4 times as long as inference on the measured 3 minute file (about 8 s against 2 s). */
const FINISHING_FACTOR = 4;

/** Seconds for the whole run, from `listenSec` spent to reach `fraction` of the listening stage. */
export const projectedTotalSec = (listenSec: number, fraction: number): number => (listenSec / fraction) * (1 + FINISHING_FACTOR);

const MESSAGES: Record<FallbackReason, string> = {
  'no-webgl': 'This browser cannot use the graphics chip that listening needs.',
  'too-long-phone': 'That recording is too long for a phone.',
  'worker-error': 'Something went wrong while listening to that recording.',
  'too-slow': 'This is going to take a long time on this device.',
};
const fallbackOf = (reason: FallbackReason): Fallback => ({ reason, message: MESSAGES[reason], canTryAnyway: reason === 'too-slow' });

export class Listener {
  private state: ListenState = { phase: 'idle' };
  private listeners = new Set<() => void>();
  private run = 0;
  private abort: AbortController | null = null;

  constructor(private readonly deps: ListenDeps) {}

  getState = (): ListenState => this.state;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private set(s: ListenState) {
    this.state = s;
    for (const cb of [...this.listeners]) cb();
  }

  start(file: Parameters<ListenDeps['decode']>[0]): void {
    this.cancel();
    const id = ++this.run;
    const live = () => id === this.run;
    this.set({ phase: 'decoding' });
    void (async () => {
      let decoded: Awaited<ReturnType<ListenDeps['decode']>>;
      try {
        decoded = await this.deps.decode(file);
      } catch (e) {
        if (live()) this.set({ phase: 'failed', message: e instanceof ImportError ? e.message : 'Keyfall could not read that recording.' });
        return;
      }
      if (!live()) return;
      if (this.deps.isPhone && decoded.seconds > MAX_AUDIO_SECONDS_PHONE) {
        this.set({ phase: 'fallback', fallback: fallbackOf('too-long-phone') });
        return;
      }
      const ac = new AbortController();
      this.abort = ac;
      const windows = windowCount(decoded.pcm.length);
      let listenStart = this.deps.now();
      let judged = false;
      this.set({ phase: 'running', stage: 'loading-model', fraction: 0, fallback: null });
      try {
        const notes = await this.deps.transcribe(decoded.pcm, {
          signal: ac.signal,
          onProgress: (p) => {
            if (!live() || this.state.phase !== 'running') return;
            if (p.stage !== 'listening') listenStart = this.deps.now();
            let fallback = this.state.fallback;
            if (p.stage === 'listening' && !judged && p.fraction * windows >= PACE_WINDOWS - 1e-9) {
              judged = true;
              const total = projectedTotalSec((this.deps.now() - listenStart) / 1000, p.fraction);
              if (total > this.deps.paceLimitSec()) fallback = fallbackOf('too-slow');
            }
            this.set({ phase: 'running', stage: p.stage, fraction: p.fraction, fallback });
          },
        });
        if (live()) this.set({ phase: 'done', notes, seconds: decoded.seconds });
      } catch (e) {
        if (!live()) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        this.set({ phase: 'fallback', fallback: fallbackOf(e instanceof TranscribeUnsupportedError ? 'no-webgl' : 'worker-error') });
      } finally {
        if (this.abort === ac) this.abort = null;
      }
    })();
  }

  /** Let a slow run finish: hides the card and never judges the pace again. */
  tryAnyway(): void {
    if (this.state.phase === 'running' && this.state.fallback?.canTryAnyway) this.set({ ...this.state, fallback: null });
  }

  /** Works in every stage. Terminates the worker, forgets the run, and ignores whatever it still reports. */
  cancel(): void {
    this.run++;
    this.abort?.abort();
    this.abort = null;
    if (this.state.phase !== 'idle') this.set({ phase: 'idle' });
  }
}
