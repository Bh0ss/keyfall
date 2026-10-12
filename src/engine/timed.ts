import { Clock, beatsToMs } from './clock';
import { MISS_ZONE, ScoreBoard, gradeFor, windowsFor, type Grade, type MissEntry, type ScoreSummary, type TimedMode } from './judge';
import { loopRange, type MeasureLoop } from './loop';
import type { PlaySession, PressResult, SessionStatus } from './session';
import type { Hand, Song, SongNote } from './song';

export interface TimedOptions {
  mode: TimedMode;
  /** Practice only (0.5 to 0.9); Full and Expert always run at 1. */
  speed?: number;
  hands?: 'right' | 'left' | 'both';
  leadInBeats?: number;
  /** Measured device latency; subtracted from every hit time. */
  latencyMs?: number;
  loop?: MeasureLoop;
}

export function speedFor(mode: TimedMode, requested = 1): number {
  if (mode !== 'practice') return 1;
  return Math.min(0.9, Math.max(0.5, Math.round(requested * 100) / 100));
}

export interface LastJudgement {
  /** Bumps each time a note is judged, so the UI can retrigger an animation. */
  seq: number;
  label: Grade | 'miss';
  offsetMs: number | null;
}

/**
 * Timed play (Practice, Full, Expert): the clock never waits. Each key press
 * is judged against the nearest note of that pitch; notes nobody played expire.
 */
export class TimedSession implements PlaySession {
  readonly kind = 'timed' as const;
  status: SessionStatus = 'ready';
  version = 0;
  readonly mode: TimedMode;
  readonly speed: number;
  readonly leadInBeats: number;
  readonly endBeat: number;
  readonly playStartBeat: number;
  readonly board: ScoreBoard;
  last: LastJudgement = { seq: 0, label: 'miss', offsetMs: null };

  private readonly clock: Clock;
  private readonly notes: SongNote[];
  private readonly resolved = new Set<string>();
  private readonly hit = new Set<string>();
  private readonly missed = new Set<string>();
  private readonly loop: boolean;
  private readonly windows: ReturnType<typeof windowsFor>;
  private latencyMs: number;
  private lastBeat: number;
  private listeners = new Set<() => void>();

  constructor(
    readonly song: Song,
    opts: TimedOptions,
  ) {
    this.mode = opts.mode;
    this.speed = speedFor(opts.mode, opts.speed);
    this.windows = windowsFor(opts.mode);
    this.latencyMs = opts.latencyMs ?? 0;
    this.leadInBeats = opts.leadInBeats ?? 4;
    this.clock = new Clock(song.bpm, this.speed);
    const hands = opts.hands ?? 'both';
    const range = opts.loop ? loopRange(song, opts.loop) : null;
    this.loop = range !== null;
    this.playStartBeat = range ? range.startBeat : 0;
    this.notes = song.notes.filter(
      (n) =>
        (hands === 'both' || n.hand === (hands as Hand)) &&
        (!range || (n.startBeat >= range.startBeat - 1e-6 && n.startBeat < range.endBeat - 1e-6)),
    );
    this.endBeat = range ? range.endBeat : song.notes.reduce((m, n) => Math.max(m, n.startBeat + n.durationBeats), 0);
    this.board = new ScoreBoard(this.notes.length);
    this.lastBeat = this.playStartBeat - this.leadInBeats;
    this.clock.seek(this.lastBeat, 0);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  summary(): ScoreSummary {
    return this.board.summary();
  }

  beatAt(nowMs: number): number {
    return this.clock.beatAt(nowMs);
  }

  isHit(noteId: string): boolean {
    return this.hit.has(noteId);
  }

  isMissed(noteId: string): boolean {
    return this.missed.has(noteId);
  }

  isPlayed(note: SongNote): boolean {
    return this.notes.includes(note);
  }

  /** Notes still to be played that are close enough to show a key hint. */
  pendingNotes(): SongNote[] {
    const ahead = this.lastBeat + 1;
    return this.notes.filter((n) => !this.resolved.has(n.id) && n.startBeat <= ahead && n.startBeat >= this.lastBeat - 0.5);
  }

  /** Milliseconds (real time) from the note to a moment `beat`; negative = before the note. */
  private offsetMs(beat: number, note: SongNote): number {
    // Rounded so a press exactly on a window edge is not pushed out by float error.
    return Math.round((beatsToMs(beat - note.startBeat, this.song.bpm) / this.speed) * 1e6) / 1e6;
  }

  start(nowMs: number): void {
    this.lastBeat = this.playStartBeat - this.leadInBeats;
    this.clock.seek(this.lastBeat, nowMs);
    this.clock.resume(nowMs);
    this.status = 'playing';
    this.changed();
  }

  pause(nowMs: number): void {
    if (this.status !== 'playing') return;
    this.clock.pause(nowMs);
    this.status = 'paused';
    this.changed();
  }

  resume(nowMs: number): void {
    if (this.status !== 'paused') return;
    this.clock.resume(nowMs);
    this.status = 'playing';
    this.changed();
  }

  private judged(label: Grade | 'miss', offsetMs: number | null): void {
    this.last = { seq: this.last.seq + 1, label, offsetMs };
  }

  private entry(note: SongNote, kind: MissEntry['kind'], offsetMs: number | null, pressedMidi: number | null): MissEntry {
    return { noteId: note.id, midi: note.midi, pressedMidi, measure: note.measure, kind, offsetMs };
  }

  /** Advance to `nowMs`: expire notes nobody played, wrap the loop, finish. */
  update(nowMs: number): void {
    if (this.status !== 'playing') return;
    const raw = this.clock.beatAt(nowMs);
    this.lastBeat = raw;
    const eff = this.clock.beatAt(nowMs - this.latencyMs);
    let dirty = false;
    for (const n of this.notes) {
      if (this.resolved.has(n.id)) continue;
      if (this.offsetMs(eff, n) > this.windows.good * MISS_ZONE) {
        this.resolved.add(n.id);
        this.missed.add(n.id);
        this.board.miss(this.entry(n, 'late', null, null));
        this.judged('miss', null);
        dirty = true;
      }
    }
    const doneBeat = this.endBeat + (this.windows.good * MISS_ZONE * this.speed * this.song.bpm) / 60000;
    if (raw >= doneBeat && this.notes.every((n) => this.resolved.has(n.id))) {
      if (this.loop) {
        this.board.forget(this.notes.map((n) => n.id));
        this.resolved.clear();
        this.hit.clear();
        this.missed.clear();
        this.lastBeat = this.playStartBeat - this.leadInBeats;
        this.clock.seek(this.lastBeat, nowMs);
      } else {
        this.clock.pause(nowMs);
        this.status = 'finished';
      }
      dirty = true;
    }
    if (dirty) this.changed();
  }

  /** Judge a key press at `nowMs` (performance.now() in the app). */
  noteOn(midi: number, nowMs: number): PressResult {
    if (this.status !== 'playing') return 'ignored';
    const beat = this.clock.beatAt(nowMs - this.latencyMs);
    const zone = this.windows.good * MISS_ZONE;
    let best: SongNote | null = null;
    let bestOff = Infinity;
    let nearest: SongNote | null = null;
    let nearestAbs = Infinity;
    for (const n of this.notes) {
      if (this.resolved.has(n.id)) continue;
      const off = this.offsetMs(beat, n);
      const abs = Math.abs(off);
      if (abs < nearestAbs) {
        nearest = n;
        nearestAbs = abs;
      }
      if (n.midi === midi && abs <= zone && abs < Math.abs(bestOff)) {
        best = n;
        bestOff = off;
      }
    }
    if (!best) {
      if (nearest) this.board.wrongKey(this.entry(nearest, 'wrong-key', null, midi));
      else this.board.resetStreak();
      this.judged('miss', null);
      this.changed();
      return 'wrong';
    }
    this.resolved.add(best.id);
    const grade = gradeFor(bestOff, this.mode);
    if (grade) {
      this.hit.add(best.id);
      this.board.hit(best.id, grade, bestOff);
      this.judged(grade, bestOff);
      this.changed();
      return 'correct';
    }
    this.missed.add(best.id);
    this.board.miss(this.entry(best, bestOff < 0 ? 'early' : 'late', bestOff, midi));
    this.judged('miss', bestOff);
    this.changed();
    return 'wrong';
  }
}
