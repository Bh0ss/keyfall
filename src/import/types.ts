import type { Hand, Song } from '../engine/song';
import type { ImportFormat } from './limits';

/** One note read from a file, before hands are decided. */
export interface DraftNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  /** Index of the track (MIDI) or hand-staff (MusicXML) the note came from. */
  group: number;
  finger?: 1 | 2 | 3 | 4 | 5;
}

export interface DraftGroup {
  label: string;
  noteCount: number;
}

/** What a file holds, before the player's choices (split, title, level) are applied. */
export interface ImportAnalysis {
  format: ImportFormat;
  title: string;
  composer: string;
  bpm: number;
  timeSignature: [number, number];
  notes: DraftNote[];
  groups: DraftGroup[];
  /** Set when the file has exactly two tracks or staves: the hand of each group. */
  groupHands?: [Hand, Hand];
  /** The file's own MusicXML (MusicXML imports); MIDI imports get one generated. */
  musicXml?: string;
  /** Notes outside the 88 keys that were left out. */
  skipped: number;
  /** How the groups are called: "track" or "staff". */
  groupNoun: 'track' | 'staff';
}

export type SplitMode = 'groups' | 'pitch';

export interface ImportChoices {
  title: string;
  composer: string;
  splitMode: SplitMode;
  /** Notes at or above this MIDI number go to the right hand (pitch split). */
  splitMidi: number;
  level: Song['level'];
}

export interface BuiltSong {
  song: Song;
  /** True when the sheet was generated from MIDI and is only an approximation. */
  approximate: boolean;
}

/** Middle C. */
export const MIDDLE_C = 60;
