import type { LabelMode } from '../engine/fade';
import type { Grade, MissEntry, Mode } from '../engine/judge';

/**
 * Every row has a stable string `id` and an `updatedAt` (epoch ms), so the
 * Phase 8 sync queue can address rows and resolve last-write-wins without a
 * schema change to these tables.
 */
export interface Stamped {
  id: string;
  updatedAt: number;
}

export type PlayerLevel = 'beginner' | 'advanced';

export interface ProfileSettings {
  labels: LabelMode;
  mode: Mode;
  speedPct: number;
  metronome: boolean;
  countIn: boolean;
}

export interface Profile extends Stamped {
  name: string;
  colour: string;
  level: PlayerLevel;
  settings: ProfileSettings;
  createdAt: number;
}

/** Best score of a profile on a song in one mode. Only ever replaced by a higher score. */
export interface ScoreRecord extends Stamped {
  profileId: string;
  songId: string;
  mode: Mode;
  speedPct: number;
  score: number;
  accuracy: number;
  stars: number;
  attemptId: string;
  achievedAt: number;
}

export interface WaitFigures {
  wrong: number;
  avgTimeToPressMs: number;
}

export interface AttemptRecord extends Stamped {
  profileId: string;
  songId: string;
  mode: Mode;
  speedPct: number;
  /** Bars looped (Practice my mistakes, A-B loop); looped attempts never set a high score. */
  loop: { from: number; to: number } | null;
  score: number;
  accuracy: number;
  stars: number;
  hits: number;
  total: number;
  longestStreak: number;
  grades: Record<Grade, number>;
  misses: MissEntry[];
  hitOffsets: number[];
  wait: WaitFigures | null;
  xp: number;
  finishedAt: number;
}

/** Hit-streak stats for one pitch of one profile; drives label fade. */
export interface NoteStatRecord extends Stamped {
  profileId: string;
  midi: number;
  streak: number;
  hits: number;
  misses: number;
}

/** Calibrated keyboard latency. `id` is the device name. */
export interface LatencyRecord extends Stamped {
  offsetMs: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
