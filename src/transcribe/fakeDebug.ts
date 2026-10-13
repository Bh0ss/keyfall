/** `window.__keyfall.useFakeTranscriber`, behind ?debug=1 only (see midi/virtual.ts). Loaded on demand. */
import { loadPlayableSong } from '../songs/library';
import { fakeTranscriber, type FakeOptions } from './fake';
import { installFakeTranscriber } from './seam';
import type { NoteEvent } from './types';

export interface DebugFakeOptions extends FakeOptions {
  /** Lower this to make the pace check fire in a test. */
  paceLimitSec?: number;
}

/** Make the Add song screen "hear" a bundled song's own notes instead of running the model. Resolves false for an unknown song. */
export async function debugUseFakeTranscriber(songId: string, opts: DebugFakeOptions = {}): Promise<boolean> {
  const song = await loadPlayableSong(songId);
  if (!song) return false;
  const sec = 60 / song.bpm;
  const notes: NoteEvent[] = song.notes.map((n) => ({ midi: n.midi, startSec: n.startBeat * sec, durationSec: n.durationBeats * sec, amplitude: 0.8 }));
  installFakeTranscriber(fakeTranscriber(notes, opts), opts.paceLimitSec);
  return true;
}
