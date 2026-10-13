/** The review step's pure core: the player's choices plus the transcribed notes become a MusicXML score and its analysis. */
import { arrange } from '../arrange/arrange';
import { arrangementToFile } from '../arrange/toImport';
import type { Arrangement, Mode, Version } from '../arrange/types';
import { analyseFile } from '../import/analyse';
import type { ImportAnalysis } from '../import/types';
import type { NoteEvent } from '../transcribe/types';

export interface ReviewChoices {
  version: Version;
  /** Null means the estimate. */
  bpm: number | null;
  /** Null means the detected key. */
  key: { tonic: number; mode: Mode } | null;
  /** Seconds on the recording; null means the whole song. */
  trimSec: [number, number] | null;
}

export interface Review {
  arrangement: Arrangement;
  analysis: ImportAnalysis;
  fileName: string;
  bytes: Uint8Array;
}

/** Throws ImportError when nothing can be made out (for example a trim with no notes in it). Does not re-transcribe. */
export async function buildReview(events: NoteEvent[], choices: ReviewChoices, meta: { title: string; composer: string }): Promise<Review> {
  const arrangement = arrange(events, {
    version: choices.version,
    timeSignature: [4, 4],
    ...(choices.bpm !== null ? { bpm: choices.bpm } : {}),
    ...(choices.key ? { key: choices.key } : {}),
    ...(choices.trimSec ? { trimSec: choices.trimSec } : {}),
  });
  const file = arrangementToFile(arrangement, meta);
  const analysis = await analyseFile(file.fileName, file.bytes.slice().buffer);
  return { arrangement, analysis, fileName: file.fileName, bytes: file.bytes };
}

const TONICS = ['C', 'C sharp', 'D', 'E flat', 'E', 'F', 'F sharp', 'G', 'A flat', 'A', 'B flat', 'B'];

export const keyLabel = (k: { tonic: number; mode: Mode }): string => `${TONICS[k.tonic]} ${k.mode}`;

export const KEY_CHOICES: readonly { tonic: number; mode: Mode }[] = (['major', 'minor'] as const).flatMap((mode) =>
  TONICS.map((_, tonic) => ({ tonic, mode })),
);
