import type { SongMeta } from './musicxml.ts';

/** One bundled song: the MusicXML file (without extension) and the catalog fields that are not in the file. */
export interface BundledEntry {
  file: string;
  meta: SongMeta;
}

/** Bundled songs. Public domain only, arranged as MusicXML. */
export const BUNDLED_ENTRIES: readonly BundledEntry[] = [
  { file: 'mary-had-a-little-lamb', meta: { id: 'mary-had-a-little-lamb', level: 1 } },
  { file: 'twinkle-twinkle-little-star', meta: { id: 'twinkle-twinkle-little-star', level: 1 } },
  { file: 'ode-to-joy', meta: { id: 'ode-to-joy', level: 2, unlockedBy: 'unit-2' } },
  { file: 'jingle-bells', meta: { id: 'jingle-bells', level: 2, unlockedBy: 'unit-3' } },
  { file: 'when-the-saints', meta: { id: 'when-the-saints-go-marching-in', level: 3, unlockedBy: 'unit-4' } },
  { file: 'minuet-in-g', meta: { id: 'minuet-in-g', level: 4, unlockedBy: 'unit-6' } },
  { file: 'greensleeves', meta: { id: 'greensleeves', level: 4, unlockedBy: 'unit-7' } },
  { file: 'fur-elise', meta: { id: 'fur-elise-opening', level: 5, unlockedBy: 'unit-8' } },
  { file: 'canon-in-d', meta: { id: 'canon-in-d', level: 5, unlockedBy: 'unit-9' } },
  { file: 'clair-de-lune', meta: { id: 'clair-de-lune', level: 'expert', unlockedBy: 'advanced' } },
  // Requested addition beyond the spec's list of ten (see PROGRESS.md Decisions).
  { file: 'chopin-nocturne-op72-1', meta: { id: 'chopin-nocturne-op72-1', level: 'expert', unlockedBy: 'advanced' } },
  // Requested addition: 18 more songs (see PROGRESS.md Decisions).
  { file: 'row-row-row-your-boat', meta: { id: 'row-row-row-your-boat', level: 1 } },
  { file: 'london-bridge', meta: { id: 'london-bridge', level: 1 } },
  { file: 'frere-jacques', meta: { id: 'frere-jacques', level: 1 } },
  { file: 'yankee-doodle', meta: { id: 'yankee-doodle', level: 1 } },
  { file: 'oh-susanna', meta: { id: 'oh-susanna', level: 1 } },
  { file: 'happy-birthday', meta: { id: 'happy-birthday', level: 1 } },
  { file: 'amazing-grace', meta: { id: 'amazing-grace', level: 2 } },
  { file: 'brahms-lullaby', meta: { id: 'brahms-lullaby', level: 2 } },
  { file: 'auld-lang-syne', meta: { id: 'auld-lang-syne', level: 2 } },
  { file: 'scarborough-fair', meta: { id: 'scarborough-fair', level: 2 } },
  { file: 'bach-musette-in-d', meta: { id: 'bach-musette-in-d', level: 4, unlockedBy: 'unit-5' } },
  { file: 'tchaikovsky-old-french-song', meta: { id: 'tchaikovsky-old-french-song', level: 4, unlockedBy: 'unit-5' } },
  { file: 'schumann-melody-op68-1', meta: { id: 'schumann-melody-op68-1', level: 4, unlockedBy: 'unit-5' } },
  { file: 'schumann-happy-farmer', meta: { id: 'schumann-happy-farmer', level: 4, unlockedBy: 'unit-5' } },
  { file: 'burgmuller-arabesque', meta: { id: 'burgmuller-arabesque', level: 5, unlockedBy: 'unit-9' } },
  { file: 'bach-prelude-in-c', meta: { id: 'bach-prelude-in-c', level: 4, unlockedBy: 'unit-5' } },
  { file: 'clementi-sonatina-op36-1-mvt1', meta: { id: 'clementi-sonatina-op36-1-mvt1', level: 4, unlockedBy: 'unit-5' } },
  { file: 'joplin-the-entertainer', meta: { id: 'joplin-the-entertainer', level: 5, unlockedBy: 'unit-9' } },
];
