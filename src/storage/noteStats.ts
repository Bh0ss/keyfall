import { applyOutcomes, type NoteOutcome } from '../engine/fade';
import type { KeyfallDb } from './db';
import type { NoteStatRecord } from './types';

const statId = (profileId: string, midi: number) => `${profileId}:${midi}`;

/** Fold an attempt's per-note outcomes (in play order) into the profile's per-pitch stats. */
export async function recordNoteOutcomes(db: KeyfallDb, profileId: string, outcomes: NoteOutcome[], now = Date.now()): Promise<void> {
  if (!outcomes.length) return;
  const byMidi = new Map<number, boolean[]>();
  for (const o of outcomes) byMidi.set(o.midi, [...(byMidi.get(o.midi) ?? []), o.hit]);
  await db.transaction('rw', db.noteStats, async () => {
    const existing = await db.noteStats.bulkGet([...byMidi.keys()].map((m) => statId(profileId, m)));
    const rows: NoteStatRecord[] = [...byMidi].map(([midi, list], i) => {
      const next = applyOutcomes(existing[i], list);
      return { id: statId(profileId, midi), profileId, midi, ...next, updatedAt: now };
    });
    await db.noteStats.bulkPut(rows);
  });
}

/** Current hit streak per pitch for a profile (pitches never played are absent). */
export async function noteStreaks(db: KeyfallDb, profileId: string): Promise<Map<number, number>> {
  const rows = await db.noteStats.where('profileId').equals(profileId).toArray();
  return new Map(rows.map((r) => [r.midi, r.streak]));
}
