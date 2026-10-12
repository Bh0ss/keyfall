import type { Song } from '../engine/song.ts';

/**
 * What song lists, Home, unlock checks and Results need without loading the notes.
 * Bundled songs keep their MusicXML out of the main chunk, so the lists run on these.
 */
export interface SongSummary extends Omit<Song, 'notes' | 'musicXml'> {
  noteCount: number;
  /** Highest bar number in the song (1 for an empty song). */
  measureCount: number;
}

export function summarize(song: Song): SongSummary {
  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    source: song.source,
    level: song.level,
    hands: song.hands,
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    ...(song.unlockedBy === undefined ? {} : { unlockedBy: song.unlockedBy }),
    noteCount: song.notes.length,
    measureCount: song.notes.reduce((m, n) => Math.max(m, n.measure), 1),
  };
}
