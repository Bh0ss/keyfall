export type Hand = 'right' | 'left';

export interface SongNote {
  id: string;
  /** 21-108 */
  midi: number;
  /** From song start, in quarter-note beats. */
  startBeat: number;
  durationBeats: number;
  hand: Hand;
  finger?: 1 | 2 | 3 | 4 | 5;
  /** 1-based bar number, used for error reports and loops. */
  measure: number;
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  source: 'bundled' | 'imported';
  level: 1 | 2 | 3 | 4 | 5 | 'expert';
  hands: 'right' | 'left' | 'both';
  bpm: number;
  timeSignature: [number, number];
  notes: SongNote[];
  /** Present for MusicXML songs; generated best-effort for MIDI imports. */
  musicXml?: string;
  /** Learn unit id, or undefined if open from the start. */
  unlockedBy?: string;
}
