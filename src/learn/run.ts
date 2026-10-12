import { SetJudge } from './chord';
import { makePrompt, reviewIds, type Prompt } from './generate';
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
  /** Review ids missed (pitches, rhythm symbols, key signatures). */
  missed: number[];
}

export type AnswerResult = 'correct' | 'wrong' | 'ignored' | 'pending';

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
  /** The wrong button chosen on the last miss (choice prompts). */
  lastChoice: string | null = null;
  private readonly queue: Map<number, ReviewEntry>;
  private readonly rng: () => number;
  private readonly missed: number[] = [];
  private updates: ReviewEntry[] = [];
  private shownAt = 0;
  private judge: SetJudge | null = null;

  constructor(opts: LearnRunOptions) {
    this.unit = opts.unit;
    this.lesson = opts.lesson;
    this.total = opts.lesson.prompts ?? 10;
    this.queue = new Map(opts.queue);
    this.rng = opts.rng ?? Math.random;
    this.current = makePrompt(this.unit, this.lesson, this.queue, this.rng);
    this.arm();
  }

  /** Two-hand prompts are judged as a set. */
  private arm(): void {
    this.judge = this.current?.set ? new SetJudge(this.current.set) : null;
  }

  /** Keys of the current set that are held down right now. */
  get heldKeys(): number[] {
    return this.judge?.heldKeys ?? [];
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
    const ids = reviewIds(prompt);
    this.answered++;
    this.lastMs = Math.max(0, nowMs - this.shownAt);
    if (correct) {
      this.correct++;
      this.streak++;
    } else {
      this.streak = 0;
      this.missed.push(...ids);
    }
    for (const id of ids) {
      const next = recordAnswer(this.queue.get(id), id, correct);
      if (next) {
        this.queue.set(id, next);
        this.updates.push(next);
      }
    }
    this.state = correct ? 'right' : 'wrong';
  }

  /** A key went down. Single-note prompts are decided by it; two-hand prompts wait for the whole set. */
  answer(midi: number, nowMs = 0): AnswerResult {
    const prompt = this.current;
    if (this.state !== 'asking' || !prompt || prompt.choices) return 'ignored';
    let correct: boolean;
    if (this.judge) {
      const r = this.judge.down(midi, nowMs);
      if (r === 'partial') return 'pending';
      correct = r === 'correct';
    } else {
      correct = midi === prompt.midi;
    }
    this.revealed = false;
    this.lastWrong = correct ? null : midi;
    this.lastChoice = null;
    this.settle(correct, nowMs);
    return correct ? 'correct' : 'wrong';
  }

  /** A key came up (two-hand prompts count only keys held at the same time). */
  release(midi: number): void {
    this.judge?.up(midi);
  }

  /** A button was chosen on a choice prompt (rhythm and key-signature reading). */
  choose(id: string, nowMs = 0): AnswerResult {
    const prompt = this.current;
    if (this.state !== 'asking' || !prompt?.choices) return 'ignored';
    const correct = id === prompt.answer;
    this.revealed = false;
    this.lastWrong = null;
    this.lastChoice = correct ? null : id;
    this.settle(correct, nowMs);
    return correct ? 'correct' : 'wrong';
  }

  /** "Show the answer": counts as a miss. */
  reveal(nowMs = 0): void {
    if (this.state !== 'asking' || !this.current) return;
    this.revealed = true;
    this.lastWrong = null;
    this.lastChoice = null;
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
    this.arm();
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

/** A mini song: press each note in order. Wrong keys are counted and never advance. Rests are skipped. */
export class MiniSongRun {
  index = 0;
  wrong = 0;
  /** Notes played so far (rests do not count). */
  played = 0;
  private judge: SetJudge | null = null;

  constructor(readonly song: MiniSong) {
    this.settleIndex();
  }

  private settleIndex(): void {
    while (this.song.notes[this.index]?.rest) this.index++;
    const step = this.song.notes[this.index];
    this.judge = step?.left ? new SetJudge([step.midi, step.left.midi]) : null;
  }

  get done(): boolean {
    return this.index >= this.song.notes.length;
  }

  /** Notes to play in all (rests left out). */
  get playable(): number {
    return this.song.notes.filter((n) => !n.rest).length;
  }

  /** The keys the current step needs: one, or two when the left hand joins in. */
  get targets(): number[] {
    const step = this.song.notes[this.index];
    return step ? (step.left ? [step.left.midi, step.midi] : [step.midi]) : [];
  }

  private advance(): 'correct' {
    this.index++;
    this.played++;
    this.settleIndex();
    return 'correct';
  }

  press(midi: number, nowMs = 0): 'correct' | 'wrong' | 'ignored' | 'pending' {
    if (this.done) return 'ignored';
    const step = this.song.notes[this.index]!;
    if (this.judge) {
      const r = this.judge.down(midi, nowMs);
      if (r === 'partial') return 'pending';
      if (r === 'correct') return this.advance();
      this.wrong++;
      return 'wrong';
    }
    if (midi === step.midi) return this.advance();
    this.wrong++;
    return 'wrong';
  }

  release(midi: number): void {
    this.judge?.up(midi);
  }
}
