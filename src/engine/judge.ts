/** Timing judge, combo multiplier and score ledger. Pure: no clock, no DOM. */

export type Mode = 'wait' | 'practice' | 'full' | 'expert';
export type TimedMode = Exclude<Mode, 'wait'>;
export type Grade = 'perfect' | 'great' | 'good';
export type MissKind = 'early' | 'late' | 'wrong-key';

export const GRADE_POINTS: Record<Grade, number> = { perfect: 100, great: 70, good: 40 };

/** Window half-widths in ms at Full difficulty. */
export const BASE_WINDOWS_MS: Record<Grade, number> = { perfect: 50, great: 100, good: 150 };

/** Practice doubles the windows, Expert halves them. */
export const WINDOW_SCALE: Record<Mode, number> = { wait: 1, practice: 2, full: 1, expert: 0.5 };

/** A right-pitch press this far outside the Good window (x Good) still counts as an early/late miss. */
export const MISS_ZONE = 1.5;

export const STAR_THRESHOLDS = [0.7, 0.85, 0.95] as const;
export const STREAK_PER_STEP = 10;
export const MAX_MULTIPLIER = 4;

export function windowsFor(mode: Mode): Record<Grade, number> {
  const k = WINDOW_SCALE[mode];
  return { perfect: BASE_WINDOWS_MS.perfect * k, great: BASE_WINDOWS_MS.great * k, good: BASE_WINDOWS_MS.good * k };
}

/** Grade for a timing offset in ms (negative = early). Window edges are inclusive. null = outside Good. */
export function gradeFor(offsetMs: number, mode: Mode): Grade | null {
  const w = windowsFor(mode);
  const a = Math.abs(offsetMs);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.great) return 'great';
  if (a <= w.good) return 'good';
  return null;
}

/** Multiplier for a hit made after `streak` consecutive hits: x1 up to 9, x2 from 10, x3 from 20, x4 from 30. */
export function multiplierFor(streak: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / STREAK_PER_STEP));
}

export function starsFor(accuracy: number): 0 | 1 | 2 | 3 {
  let stars = 0;
  for (const t of STAR_THRESHOLDS) if (accuracy >= t) stars++;
  return stars as 0 | 1 | 2 | 3;
}

export interface MissEntry {
  noteId: string;
  /** Pitch the song asked for. */
  midi: number;
  /** Pitch actually pressed (differs from midi for wrong-key). */
  pressedMidi: number | null;
  measure: number;
  kind: MissKind;
  /** Press time minus note time in ms (negative = early). null when nothing was pressed in time. */
  offsetMs: number | null;
}

export interface ScoreSummary {
  score: number;
  hits: number;
  total: number;
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  streak: number;
  longestStreak: number;
  multiplier: number;
  grades: Record<Grade, number>;
  misses: MissEntry[];
  /** Notes whose latest result is a hit. */
  hitNoteIds: string[];
  /** Notes whose latest result is a miss (consumed early/late, or in Wait a note that needed a retry). */
  missedNoteIds: string[];
  /** Press time minus note time (ms, negative = early) for every hit. */
  hitOffsets: number[];
}

/**
 * Keeps one result per note, so a looped passage is re-judged each pass:
 * score and accuracy always come from the latest result of each note.
 */
export class ScoreBoard {
  private ledger = new Map<string, { grade: Grade; points: number; offsetMs?: number }>();
  private missedIds = new Set<string>();
  private misses: MissEntry[] = [];
  private streak = 0;
  private longest = 0;

  constructor(readonly total: number) {}

  get multiplier(): number {
    return multiplierFor(this.streak);
  }

  hit(noteId: string, grade: Grade, offsetMs?: number): number {
    const points = GRADE_POINTS[grade] * multiplierFor(this.streak);
    this.ledger.set(noteId, { grade, points, offsetMs });
    this.missedIds.delete(noteId);
    this.streak++;
    this.longest = Math.max(this.longest, this.streak);
    return points;
  }

  miss(entry: MissEntry): void {
    this.ledger.delete(entry.noteId);
    this.missedIds.add(entry.noteId);
    this.misses.push(entry);
    this.streak = 0;
  }

  /** A wrong key resets the streak and is logged; the note it was aimed at stays playable. */
  wrongKey(entry: MissEntry): void {
    this.misses.push(entry);
    this.streak = 0;
  }

  resetStreak(): void {
    this.streak = 0;
  }

  forget(noteIds: Iterable<string>): void {
    for (const id of noteIds) {
      this.ledger.delete(id);
      this.missedIds.delete(id);
    }
  }

  summary(): ScoreSummary {
    const grades: Record<Grade, number> = { perfect: 0, great: 0, good: 0 };
    let score = 0;
    const hitOffsets: number[] = [];
    for (const r of this.ledger.values()) {
      grades[r.grade]++;
      score += r.points;
      if (r.offsetMs !== undefined) hitOffsets.push(r.offsetMs);
    }
    const hits = this.ledger.size;
    const accuracy = this.total ? hits / this.total : 0;
    return {
      score,
      hits,
      total: this.total,
      accuracy,
      stars: starsFor(accuracy),
      streak: this.streak,
      longestStreak: this.longest,
      multiplier: multiplierFor(this.streak),
      grades,
      misses: [...this.misses],
      hitNoteIds: [...this.ledger.keys()],
      missedNoteIds: [...this.missedIds],
      hitOffsets,
    };
  }
}

/** Best possible score for a song of `n` notes (all Perfect). */
export function maxScore(n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += GRADE_POINTS.perfect * multiplierFor(i);
  return s;
}
