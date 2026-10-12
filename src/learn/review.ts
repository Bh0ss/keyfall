/** Missed notes come back more often until answered right this many times in a row. */
export const REVIEW_EXIT_STREAK = 3;

export interface ReviewEntry {
  midi: number;
  /** Right answers in a row since the last miss. */
  streak: number;
  /** Total misses ever, kept after the note leaves the queue. */
  misses: number;
  /** False once the note has been answered right REVIEW_EXIT_STREAK times in a row. */
  active: boolean;
}

/** Fold one answer into a note's entry. Returns undefined when nothing changes (right answer, note not queued). */
export function recordAnswer(entry: ReviewEntry | undefined, midi: number, correct: boolean): ReviewEntry | undefined {
  if (!correct) return { midi, streak: 0, misses: (entry?.misses ?? 0) + 1, active: true };
  if (!entry || !entry.active) return undefined;
  const streak = entry.streak + 1;
  return streak >= REVIEW_EXIT_STREAK ? { ...entry, streak: 0, active: false } : { ...entry, streak };
}

/** Extra weight a note gets in the prompt pool: biggest right after a miss, fading as the streak builds. */
export function noteWeight(entry: ReviewEntry | undefined): number {
  if (!entry || !entry.active) return 0;
  return 2 * (REVIEW_EXIT_STREAK - entry.streak);
}
