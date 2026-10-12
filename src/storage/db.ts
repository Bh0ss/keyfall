import Dexie, { type Table } from 'dexie';
import type { AttemptRecord, LatencyRecord, ImportedSongRecord, LearnProgressRecord, MetaRecord, NoteStatRecord, Profile, ReviewRecord, ScoreRecord } from './types';

export class KeyfallDb extends Dexie {
  profiles!: Table<Profile, string>;
  scores!: Table<ScoreRecord, string>;
  attempts!: Table<AttemptRecord, string>;
  noteStats!: Table<NoteStatRecord, string>;
  latency!: Table<LatencyRecord, string>;
  meta!: Table<MetaRecord, string>;
  learnProgress!: Table<LearnProgressRecord, string>;
  reviewQueue!: Table<ReviewRecord, string>;
  songs!: Table<ImportedSongRecord, string>;

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
    // Version 2 adds Learn. The version 1 tables are unchanged.
    this.version(2).stores({
      learnProgress: 'id, profileId, unitId, updatedAt',
      reviewQueue: 'id, profileId, updatedAt',
    });
    // Version 3 adds imported songs. Earlier tables are unchanged.
    this.version(3).stores({
      songs: 'id, updatedAt',
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
