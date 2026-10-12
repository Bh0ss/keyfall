import Dexie, { type Table } from 'dexie';
import type { AttemptRecord, LatencyRecord, MetaRecord, NoteStatRecord, Profile, ScoreRecord } from './types';

export class KeyfallDb extends Dexie {
  profiles!: Table<Profile, string>;
  scores!: Table<ScoreRecord, string>;
  attempts!: Table<AttemptRecord, string>;
  noteStats!: Table<NoteStatRecord, string>;
  latency!: Table<LatencyRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = 'keyfall') {
    super(name);
    this.version(1).stores({
      profiles: 'id, name, updatedAt',
      scores: 'id, profileId, songId, updatedAt',
      attempts: 'id, profileId, songId, finishedAt, updatedAt',
      noteStats: 'id, profileId, updatedAt',
      latency: 'id, updatedAt',
      meta: 'key',
    });
  }
}

let shared: KeyfallDb | null = null;

/** The app's database. Tests build their own with `new KeyfallDb(name)`. */
export function getDb(): KeyfallDb {
  shared ??= new KeyfallDb();
  return shared;
}

export function newId(): string {
  return crypto.randomUUID();
}
