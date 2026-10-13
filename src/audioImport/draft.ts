/**
 * The Add song review, kept in memory while the player previews it in Wait mode, so Back returns to every choice.
 * Module state only: never IndexedDB, localStorage or sessionStorage. A reload loses it on purpose.
 */
import type { SavedChoices } from '../import/save';
import type { NoteEvent } from '../transcribe/types';
import { clearPreviewSong } from '../songs/library';
import type { ReviewChoices } from './review';

export interface DraftMeta {
  title: string;
  artist: string;
  thumbnail: string | undefined;
  fileName: string;
}

export interface ReviewDraft {
  events: NoteEvent[];
  seconds: number;
  meta: DraftMeta;
  choices: ReviewChoices;
  /** Title, composer, hands split and difficulty as they stood in the form. */
  form: SavedChoices;
}

let draft: ReviewDraft | null = null;
/** True from the Preview click until the Add song screen is back: the only time leaving the screen keeps the draft. */
let held = false;

/** Called just before navigating to the preview. */
export function holdDraft(d: ReviewDraft): void {
  draft = d;
  held = true;
}

/** The draft to restore, only when a preview is in flight. */
export function peekDraft(): ReviewDraft | null {
  return held ? draft : null;
}

export const isHeld = (): boolean => held;

/** The Add song screen is back and has taken the draft. */
export function release(): void {
  held = false;
}

export function clearDraft(): void {
  draft = null;
  held = false;
}

/** The Add song screen unmounts: unless it is going to the preview, drop the draft and the preview song. */
export function leaveAddAudio(): void {
  if (held) return;
  draft = null;
  clearPreviewSong();
}
