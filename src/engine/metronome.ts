/** Click scheduling for the metronome and the count-in. Pure; the sound is in ui/audio.ts. */

export interface ClickRules {
  /** Click on every beat while the song plays. */
  metronome: boolean;
  /** Click one bar before the first judged beat. */
  countIn: boolean;
  /** Quarter-note beats per bar. */
  barBeats: number;
  /** First judged beat (0, or the start of the loop). */
  playStartBeat: number;
}

/** Whether integer beat `b` makes a click. */
export function wantsClick(b: number, r: ClickRules): boolean {
  if (b >= r.playStartBeat) return r.metronome;
  return r.countIn && b >= r.playStartBeat - r.barBeats;
}

/** Downbeat clicks are higher. */
export function isAccent(b: number, barBeats: number): boolean {
  const m = b % barBeats;
  return Math.abs(m) < 1e-9 || Math.abs(m - barBeats) < 1e-9;
}

/**
 * The clicks to schedule now: integer beats after `lastScheduled`, not behind
 * the playhead and not later than `beat + aheadBeats`. A backwards jump of the
 * clock (loop wrap) starts the count again.
 */
export function clicksDue(beat: number, lastScheduled: number, aheadBeats: number): { beats: number[]; last: number } {
  const prior = beat < lastScheduled - 1 ? -Infinity : lastScheduled;
  const beats: number[] = [];
  for (let b = Math.max(Math.ceil(beat - 1e-9), prior + 1); b <= beat + aheadBeats; b++) beats.push(b);
  return { beats, last: beats.length ? beats[beats.length - 1]! : prior };
}
