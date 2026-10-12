import { makePrompt, type Prompt } from './generate';
import { passes } from './pass';
import { recordAnswer, type ReviewEntry } from './review';
import type { LessonDef, MiniSong, Unit } from './units';

export type RunState = 'asking' | 'right' | 'wrong' | 'done';

export interface RunResult {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  /** Only the unit test can pass a unit. */
  passed: boolean;
  missed: number[];
}

export interface LearnRunOptions {
  unit: Unit;
  lesson: LessonDef;
  queue: ReadonlyMap<number, ReviewEntry>;
  rng?: () => number;
}

/** One run of a prompt lesson (key finder or note flash). Pure: time and input are passed in. */
export class LearnRun {
  readonly unit: Unit;
  readonly lesson: LessonDef;
  readonly total: number;
  state: RunState = 'asking';
  current: Prompt | null;
  answered = 0;
  correct = 0;
  streak = 0;
  /** Milliseconds the last answer took. */
  lastMs = 0;
  /** True when the last miss was "Show the answer" rather than a wrong key. */
  revealed = false;
  /** The wrong key pressed on the last miss. */
  lastWrong: number | null = null;
  private readonly queue: Map<number, ReviewEntry>;
  private readonly rng: () => number;
  private readonly missed: number[] = [];
  private updates: ReviewEntry[] = [];
  private shownAt = 0;

  constructor(opts: LearnRunOptions) {
    this.unit = opts.unit;
    this.lesson = opts.lesson;
    this.total = opts.lesson.prompts ?? 10;
    this.queue = new Map(opts.queue);
    this.rng = opts.rng ?? Math.random;
    this.current = makePrompt(this.unit, this.lesson, this.queue, this.rng);
  }

  /** Start the clock on the first prompt. */
  start(nowMs: number): void {
    this.shownAt = nowMs;
  }

  get accuracy(): number {
    return this.answered ? this.correct / this.answered : 0;
  }

  /** Active review notes, for the "Needs review" card. */
  get reviewNotes(): number[] {
    return [...this.queue.values()].filter((e) => e.active).map((e) => e.midi);
  }

  private settle(correct: boolean, nowMs: number): void {
    const prompt = this.current!;
    this.answered++;
    this.lastMs = Math.max(0, nowMs - this.shownAt);
    if (correct) {
      this.correct++;
      this.streak++;
    } else {
      this.streak = 0;
      this.missed.push(prompt.midi);
    }
    const next = recordAnswer(this.queue.get(prompt.midi), prompt.midi, correct);
    if (next) {
      this.queue.set(prompt.midi, next);
      this.updates.push(next);
    }
    this.state = correct ? 'right' : 'wrong';
  }

  answer(midi: number, nowMs = 0): 'correct' | 'wrong' | 'ignored' {
    if (this.state !== 'asking' || !this.current) return 'ignored';
    const correct = midi === this.current.midi;
    this.revealed = false;
    this.lastWrong = correct ? null : midi;
    this.settle(correct, nowMs);
    return correct ? 'correct' : 'wrong';
  }

  /** "Show the answer": counts as a miss. */
  reveal(nowMs = 0): void {
    if (this.state !== 'asking' || !this.current) return;
    this.revealed = true;
    this.lastWrong = null;
    this.settle(false, nowMs);
  }

  next(nowMs = 0): void {
    if (this.state === 'asking' || this.state === 'done') return;
    if (this.answered >= this.total) {
      this.state = 'done';
      this.current = null;
      return;
    }
    this.current = makePrompt(this.unit, this.lesson, this.queue, this.rng, this.current?.midi);
    this.shownAt = nowMs;
    this.state = 'asking';
  }

  /** Queue changes since the last call, for saving. */
  drainUpdates(): ReviewEntry[] {
    const out = this.updates;
    this.updates = [];
    return out;
  }

  result(): RunResult {
    return {
      total: this.total,
      answered: this.answered,
      correct: this.correct,
      accuracy: this.accuracy,
      passed: !!this.lesson.test && passes(this.correct, this.total),
      missed: [...this.missed],
    };
  }
}

/** A mini song: press each note in order. Wrong keys are counted and never advance. */
export class MiniSongRun {
  index = 0;
  wrong = 0;

  constructor(readonly song: MiniSong) {}

  get done(): boolean {
    return this.index >= this.song.notes.length;
  }

  press(midi: number): 'correct' | 'wrong' | 'ignored' {
    if (this.done) return 'ignored';
    if (midi === this.song.notes[this.index]!.midi) {
      this.index++;
      return 'correct';
    }
    this.wrong++;
    return 'wrong';
  }
}
