import { Clock, beatsToMs } from './clock';
import { starsFor, type MissEntry, type ScoreSummary } from './judge';
import { loopRange, type LoopSpan } from './loop';
import type { PlaySession, PressResult, SessionStatus } from './session';
import type { Hand, Song, SongNote } from './song';

export type { PressResult, SessionStatus };

export interface WaitOptions {
  /** Which hand the player plays; the other hand auto-plays visually. */
  hands?: 'right' | 'left' | 'both';
  /** Beats of silence before beat 0, so the first notes fall in from the top. */
  leadInBeats?: number;
  /** How far ahead of a note a correct key is already accepted. */
  earlyWindowBeats?: number;
  speed?: number;
  /** Practise only these measures; the song wraps back to the start of the loop. */
  loop?: LoopSpan;
}

export interface WaitStats {
  total: number;
  correct: number;
  wrong: number;
  /** Mean time from a note reaching the hit line to the player pressing it. */
  avgTimeToPressMs: number;
  totalWaitMs: number;
}

/** Points per note played without a wrong key beforehand. Wait mode has no timing grade. */
export const WAIT_POINTS = 100;

interface Step {
  startBeat: number;
  notes: SongNote[];
  hit: Set<string>;
}

/**
 * Wait mode: the song stops at each note (or chord) until the right keys are
 * pressed. No timing grade; the score is correct keys and time to press.
 */
export class WaitSession implements PlaySession {
  readonly kind = 'wait' as const;
  status: SessionStatus = 'ready';
  /** Bumps on every observable state change (for useSyncExternalStore). */
  version = 0;
  readonly leadInBeats: number;
  readonly endBeat: number;
  readonly playStartBeat: number;
  readonly speed: number;

  private readonly loop: boolean;
  private clock: Clock;
  private steps: Step[] = [];
  private cursor = 0;
  private hitIds = new Set<string>();
  /** Notes that had a wrong key pressed while they were pending. */
  private retried = new Set<string>();
  private wrongLog: MissEntry[] = [];
  private cleanStreak = 0;
  private longestClean = 0;
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
    this.speed = opts.speed ?? 1;
    this.clock = new Clock(song.bpm, this.speed);
    this.leadInBeats = opts.leadInBeats ?? 4;
    this.earlyWindow = opts.earlyWindowBeats ?? 1;
    const hands = opts.hands ?? 'both';
    const range = opts.loop ? loopRange(song, opts.loop) : null;
    this.playStartBeat = range ? range.startBeat : 0;
    const played = song.notes.filter(
      (n) =>
        (hands === 'both' || n.hand === (hands as Hand)) &&
        (!range || (n.startBeat >= range.startBeat - 1e-6 && n.startBeat < range.endBeat - 1e-6)),
    );
    for (const n of played) {
      const last = this.steps[this.steps.length - 1];
      if (last && Math.abs(last.startBeat - n.startBeat) < 1e-6) last.notes.push(n);
      else this.steps.push({ startBeat: n.startBeat, notes: [n], hit: new Set() });
    }
    this.endBeat = range ? range.endBeat : song.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
    this.loop = range !== null;
    this.clock.seek(this.playStartBeat - this.leadInBeats, 0);
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

  isMissed(): boolean {
    return false;
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

  /**
   * Wait-mode result in the shared score shape. A note counts as a hit when it was
   * played without a wrong key pressed first; accuracy is those notes over all notes.
   */
  summary(): ScoreSummary {
    const total = this.steps.reduce((t, st) => t + st.notes.length, 0);
    const hitNoteIds = [...this.hitIds].filter((id) => !this.retried.has(id));
    const missedNoteIds = [...this.hitIds].filter((id) => this.retried.has(id));
    const hits = hitNoteIds.length;
    const accuracy = total ? hits / total : 0;
    return {
      score: hits * WAIT_POINTS,
      hits,
      total,
      accuracy,
      stars: starsFor(accuracy),
      streak: this.cleanStreak,
      longestStreak: this.longestClean,
      multiplier: 1,
      grades: { perfect: 0, great: 0, good: 0 },
      misses: [...this.wrongLog],
      hitNoteIds,
      missedNoteIds,
      hitOffsets: [],
    };
  }

  start(nowMs: number): void {
    this.clock.seek(this.playStartBeat - this.leadInBeats, nowMs);
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
    } else if (this.loop && beat >= this.endBeat) {
      for (const st of this.steps) st.hit.clear();
      this.hitIds.clear();
      this.retried.clear();
      this.correct = 0;
      this.cursor = 0;
      this.clock.seek(this.playStartBeat - this.leadInBeats, nowMs);
      this.changed();
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
      const pending = step.notes.filter((n) => !step.hit.has(n.id));
      for (const n of pending) this.retried.add(n.id);
      const target = pending[0];
      if (target) this.wrongLog.push({ noteId: target.id, midi: target.midi, pressedMidi: midi, measure: target.measure, kind: 'wrong-key', offsetMs: null });
      this.cleanStreak = 0;
      this.changed();
      return 'wrong';
    }
    step.hit.add(hit.id);
    this.hitIds.add(hit.id);
    this.correct++;
    if (!this.retried.has(hit.id)) {
      this.cleanStreak++;
      this.longestClean = Math.max(this.longestClean, this.cleanStreak);
    }
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
