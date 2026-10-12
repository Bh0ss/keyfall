import type { LabelMode } from '../engine/fade';
import type { Grade, MissEntry, Mode } from '../engine/judge';
import type { Song } from '../engine/song';
import type { ImportFormat } from '../import/limits';
import type { SplitMode } from '../import/types';

/**
 * Every row has a stable string `id` and an `updatedAt` (epoch ms), so the
 * Phase 8 sync queue can address rows and resolve last-write-wins without a
 * schema change to these tables.
 */
export interface Stamped {
  id: string;
  updatedAt: number;
}

export type PlayView = 'falling' | 'sheet' | 'split';

export type PlayerLevel = 'beginner' | 'advanced';

export interface ProfileSettings {
  labels: LabelMode;
  mode: Mode;
  speedPct: number;
  metronome: boolean;
  countIn: boolean;
  /** Play view: falling notes (default), sheet music, or both. */
  view?: PlayView;
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

/** A profile's progress through one Learn unit. `id` is `${profileId}:${unitId}`. */
export interface LearnProgressRecord extends Stamped {
  profileId: string;
  unitId: string;
  passed: boolean;
  passedAt: number | null;
  /** Best unit-test result so far. */
  bestCorrect: number;
  bestTotal: number;
  /** Unit-test runs taken. */
  attempts: number;
  /** Ids of finished practice lessons. */
  lessonsDone: string[];
}

/** A missed note in a profile's review queue. `id` is `${profileId}:${midi}`; kept after it clears so sync can see the change. */
export interface ReviewRecord extends Stamped {
  profileId: string;
  midi: number;
  streak: number;
  misses: number;
  active: boolean;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * An imported song. `id` is the song id (`imp-` + uuid). `source` keeps the original file so the
 * split can be changed later and Phase 8 can upload it to the private `songs` bucket as is.
 * Deleted songs stay as rows with `deletedAt` so a later sync can carry the deletion.
 */
export interface ImportedSongRecord extends Stamped {
  song: Song;
  format: ImportFormat;
  fileName: string;
  /** True when the sheet was generated from MIDI. */
  approximate: boolean;
  splitMode: SplitMode;
  splitMidi: number;
  /** True when the player set the level instead of taking the estimate. */
  levelOverridden: boolean;
  source: ArrayBuffer;
  createdAt: number;
  deletedAt?: number;
}
