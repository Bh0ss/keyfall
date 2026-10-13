/** Note events straight from a bundled song's reference notes: a perfect "transcription" to test the arranger without the model. */
import type { NoteEvent } from '../../src/transcribe/types.ts';
import type { Song } from '../../src/engine/song.ts';
import { referenceNotes } from './audio.ts';

export function eventsOf(song: Song, seconds = Infinity, offsetSec = 0): NoteEvent[] {
  return referenceNotes(song, seconds).map((n) => ({ midi: n.midi, startSec: n.startSec + offsetSec, durationSec: n.durationSec, amplitude: 0.8 }));
}
