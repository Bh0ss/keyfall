import type { Hand } from '../engine/song';
import { MIDDLE_C, type DraftNote, type ImportAnalysis, type SplitMode } from './types';

/** Notes at or above the split point are right hand, below it left hand. */
export function handByPitch(midi: number, splitMidi: number): Hand {
  return midi >= splitMidi ? 'right' : 'left';
}

/** Whether the file offers a track/staff split (exactly two groups). */
export function canSplitByGroups(a: Pick<ImportAnalysis, 'groupHands'>): boolean {
  return !!a.groupHands;
}

/** The mode to start with: the file's own two tracks or staves when it has them, else the pitch split. */
export function defaultSplit(a: Pick<ImportAnalysis, 'groupHands'>): { mode: SplitMode; splitMidi: number } {
  return { mode: canSplitByGroups(a) ? 'groups' : 'pitch', splitMidi: MIDDLE_C };
}

export function assignHands(a: Pick<ImportAnalysis, 'groupHands'>, notes: DraftNote[], mode: SplitMode, splitMidi: number): Hand[] {
  if (mode === 'groups' && a.groupHands) return notes.map((n) => a.groupHands![n.group] ?? 'right');
  return notes.map((n) => handByPitch(n.midi, splitMidi));
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "C4" for 60. */
export function noteName(midi: number): string {
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
