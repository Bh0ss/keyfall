import { Clock, beatsToMs } from './clock';
import type { Hand, Song, SongNote } from './song';

export type SessionStatus = 'ready' | 'playing' | 'waiting' | 'paused' | 'finished';
export type PressResult = 'correct' | 'wrong' | 'ignored';

export interface WaitOptions {
  /** Which hand the player plays; the other hand auto-plays visually. */
  hands?: 'right' | 'left' | 'both';
  /** Beats of silence before beat 0, so the first notes fall in from the top. */
  leadInBeats?: number;
  /** How far ahead of a note a correct key is already accepted. */
  earlyWindowBeats?: number;
  speed?: number;
}

export interface WaitStats {
  total: number;
  correct: number;
  wrong: number;
  /** Mean time from a note reaching the hit line to the player pressing it. */
  avgTimeToPressMs: number;
  totalWaitMs: number;
}

interface Step {
  startBeat: number;
  notes: SongNote[];
  hit: Set<string>;
}

/**
 * Wait mode: the song stops at each note (or chord) until the right keys are
 * pressed. No timing grade; the score is correct keys and time to press.
 */
export class WaitSession {
  status: SessionStatus = 'ready';
  /** Bumps on every observable state change (for useSyncExternalStore). */
  version = 0;
  readonly leadInBeats: number;
  readonly endBeat: number;

  private clock: Clock;
  private steps: Step[] = [];
  private cursor = 0;
  private hitIds = new Set<string>();
  private correct = 0;
  private wrong = 0;
  private pressCount = 0;
  private pressTotalMs = 0;
  private waitStart = 0;
  private pausedFrom: 'playing' | 'waiting' = 'playing';
  private pausedWaitElapsed = 0;
  private listeners = new Set<() => void>();
  private readonly earlyWindow: number;

  constructor(
    readonly song: Song,
    opts: WaitOptions = {},
  ) {
    this.clock = new Clock(song.bpm, opts.speed ?? 1);
    this.leadInBeats = opts.leadInBeats ?? 4;
    this.earlyWindow = opts.earlyWindowBeats ?? 1;
    const hands = opts.hands ?? 'both';
    const played = song.notes.filter((n) => hands === 'both' || n.hand === (hands as Hand));
    for (const n of played) {
      const last = this.steps[this.steps.length - 1];
      if (last && Math.abs(last.startBeat - n.startBeat) < 1e-6) last.notes.push(n);
      else this.steps.push({ startBeat: n.startBeat, notes: [n], hit: new Set() });
    }
    this.endBeat = song.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
    this.clock.seek(-this.leadInBeats, 0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  beatAt(nowMs: number): number {
    return this.clock.beatAt(nowMs);
  }

  isHit(noteId: string): boolean {
    return this.hitIds.has(noteId);
  }

  /** Whether the note belongs to the hand the player plays. */
  isPlayed(note: SongNote): boolean {
    return this.steps.some((s) => s.notes.includes(note));
  }

  /** Pitches still needed for the step the song is waiting on or heading to. */
  waitingFor(): number[] {
    const step = this.steps[this.cursor];
    return step ? step.notes.filter((n) => !step.hit.has(n.id)).map((n) => n.midi) : [];
  }

  /** The pending step's notes (for finger hints on the keyboard). */
  pendingNotes(): SongNote[] {
    const step = this.steps[this.cursor];
    return step ? step.notes.filter((n) => !step.hit.has(n.id)) : [];
  }

  stats(): WaitStats {
    return {
      total: this.steps.reduce((t, s) => t + s.notes.length, 0),
      correct: this.correct,
      wrong: this.wrong,
      avgTimeToPressMs: this.pressCount ? this.pressTotalMs / this.pressCount : 0,
      totalWaitMs: this.pressTotalMs,
    };
  }

  start(nowMs: number): void {
    this.clock.seek(-this.leadInBeats, nowMs);
    this.clock.resume(nowMs);
    this.status = 'playing';
    this.changed();
  }

  pause(nowMs: number): void {
    if (this.status !== 'playing' && this.status !== 'waiting') return;
    this.pausedFrom = this.status;
    this.pausedWaitElapsed = this.status === 'waiting' ? nowMs - this.waitStart : 0;
    this.clock.pause(nowMs);
    this.status = 'paused';
    this.changed();
  }

  resume(nowMs: number): void {
    if (this.status !== 'paused') return;
    if (this.pausedFrom === 'waiting') {
      this.status = 'waiting';
      this.waitStart = nowMs - this.pausedWaitElapsed;
    } else {
      this.clock.resume(nowMs);
      this.status = 'playing';
    }
    this.changed();
  }

  /** Advance the session to `nowMs` (call once per animation frame). */
  update(nowMs: number): void {
    if (this.status !== 'playing') return;
    const step = this.steps[this.cursor];
    const beat = this.clock.beatAt(nowMs);
    if (step) {
      if (beat >= step.startBeat) {
        this.clock.pause(nowMs);
        this.clock.seek(step.startBeat, nowMs);
        // Back-date the arrival to the moment the clock crossed the note.
        this.waitStart = nowMs - beatsToMs(beat - step.startBeat, this.song.bpm);
        this.status = 'waiting';
        this.changed();
      }
    } else if (beat >= this.endBeat) {
      this.clock.pause(nowMs);
      this.status = 'finished';
      this.changed();
    }
  }

  /** Feed a note-on. Returns how the engine treated it. */
  noteOn(midi: number, nowMs: number): PressResult {
    if (this.status !== 'playing' && this.status !== 'waiting') return 'ignored';
    const step = this.steps[this.cursor];
    if (!step) return 'ignored';
    const waiting = this.status === 'waiting';
    const beat = this.clock.beatAt(nowMs);
    if (!waiting && step.startBeat - beat > this.earlyWindow) return 'ignored';

    const hit = step.notes.find((n) => n.midi === midi && !step.hit.has(n.id));
    if (!hit) {
      this.wrong++;
      this.changed();
      return 'wrong';
    }
    step.hit.add(hit.id);
    this.hitIds.add(hit.id);
    this.correct++;
    if (step.hit.size === step.notes.length) {
      const waited = waiting ? Math.max(0, nowMs - this.waitStart) : 0;
      this.pressCount++;
      this.pressTotalMs += waited;
      this.cursor++;
      if (waiting) {
        this.clock.resume(nowMs);
        this.status = 'playing';
      }
    }
    this.changed();
    return 'correct';
  }
}
