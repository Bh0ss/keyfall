/** Note-label fade: a pitch the player has hit correctly this many times in a row loses its label. */

export type LabelMode = 'on' | 'fade' | 'off';

export const FADE_STREAK = 10;

export interface NoteStat {
  /** Consecutive correct hits of this pitch, newest last; any miss resets it. */
  streak: number;
  hits: number;
  misses: number;
}

export const EMPTY_NOTE_STAT: NoteStat = { streak: 0, hits: 0, misses: 0 };

/** Whether the label for a pitch with this hit streak is drawn. */
export function labelVisible(mode: LabelMode, streak: number): boolean {
  if (mode === 'off') return false;
  if (mode === 'fade') return streak < FADE_STREAK;
  return true;
}

/** Fold a run of outcomes (true = hit, in play order) for one pitch into its stats. */
export function applyOutcomes(prev: NoteStat | undefined, outcomes: boolean[]): NoteStat {
  let { streak, hits, misses } = prev ?? EMPTY_NOTE_STAT;
  for (const hit of outcomes) {
    if (hit) {
      streak++;
      hits++;
    } else {
      streak = 0;
      misses++;
    }
  }
  return { streak, hits, misses };
}

export interface NoteOutcome {
  midi: number;
  hit: boolean;
}

/**
 * Per-note outcomes of one attempt in song order. Notes that were never judged
 * (the other hand, outside a loop) are left out, so they neither help nor hurt.
 */
export function noteOutcomes(
  notes: ReadonlyArray<{ id: string; midi: number; startBeat: number }>,
  result: { hitNoteIds: string[]; missedNoteIds: string[] },
): NoteOutcome[] {
  const hit = new Set(result.hitNoteIds);
  const missed = new Set(result.missedNoteIds);
  const out: NoteOutcome[] = [];
  for (const n of [...notes].sort((a, b) => a.startBeat - b.startBeat)) {
    if (hit.has(n.id)) out.push({ midi: n.midi, hit: true });
    else if (missed.has(n.id)) out.push({ midi: n.midi, hit: false });
  }
  return out;
}
