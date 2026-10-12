/**
 * What the Credits screen shows. src/songs/NOTICE.md stays the source of record for the bundled songs;
 * tests/credits.test.ts fails if this data and NOTICE.md drift apart. Library and font licences were read from
 * each package's package.json and LICENSE file in node_modules.
 */

export const REPO_URL = 'https://github.com/Bh0ss/keyfall';

export interface LicensedSong {
  /** MusicXML file names in src/songs. */
  files: string[];
  work: string;
  composer: string;
  /** Who typeset the Mutopia source this file was adapted from. */
  typesetter: string;
  licence: string;
  licenceUrl: string;
  /** Mutopia piece pages. */
  sources: { label: string; url: string }[];
}

const MUTOPIA = 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=';

/** The CC BY-SA files. The licence covers these files only, never the app code. */
export const LICENSED_SONGS: readonly LicensedSong[] = [
  {
    files: ['chopin-nocturne-op72-1.musicxml'],
    work: 'Nocturne in E minor, Op. 72 No. 1',
    composer: 'Chopin',
    typesetter: 'Benjamin Esham',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sources: [{ label: 'Mutopia Project id 509', url: `${MUTOPIA}509` }],
  },
  {
    files: ['schumann-melody-op68-1.musicxml', 'schumann-happy-farmer.musicxml'],
    work: 'Melody (Op. 68 No. 1) and The Happy Farmer (Op. 68 No. 10)',
    composer: 'Schumann',
    typesetter: 'Philippe Hezaine',
    licence: 'CC BY-SA 2.5',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
    sources: [
      { label: 'Mutopia Project id 647', url: `${MUTOPIA}647` },
      { label: 'Mutopia Project id 659', url: `${MUTOPIA}659` },
    ],
  },
];

export interface MutopiaPd {
  file: string;
  work: string;
  /** Null where NOTICE.md names the Mutopia piece but not the typesetter. */
  typesetter: string | null;
}

/** Converted from the Mutopia MIDI exports of public-domain typesettings. */
export const MUTOPIA_PUBLIC_DOMAIN: readonly MutopiaPd[] = [
  { file: 'clair-de-lune.musicxml', work: 'Debussy, Clair de Lune', typesetter: 'Keith OHara' },
  { file: 'minuet-in-g.musicxml', work: 'Petzold, Minuet in G', typesetter: null },
  { file: 'fur-elise.musicxml', work: 'Beethoven, Für Elise', typesetter: null },
  { file: 'greensleeves.musicxml', work: 'Traditional, Greensleeves', typesetter: null },
  { file: 'bach-musette-in-d.musicxml', work: 'Bach, Musette in D', typesetter: 'Allen Garvin' },
  { file: 'tchaikovsky-old-french-song.musicxml', work: 'Tchaikovsky, Old French Song', typesetter: 'David McNamara' },
  { file: 'burgmuller-arabesque.musicxml', work: 'Burgmüller, Arabesque Op. 100 No. 2', typesetter: 'Bas Wassink' },
  { file: 'bach-prelude-in-c.musicxml', work: 'Bach, Prelude in C', typesetter: 'Tobias Erbsland' },
  { file: 'clementi-sonatina-op36-1-mvt1.musicxml', work: 'Clementi, Sonatina Op. 36 No. 1', typesetter: 'Brian D. Rude' },
  { file: 'joplin-the-entertainer.musicxml', work: 'Joplin, The Entertainer', typesetter: 'Chris Sawer' },
];

/** Original Keyfall arrangements of public-domain tunes. Reference recordings were used to check pitches only. */
export const FOLK_ARRANGEMENTS: readonly { file: string; work: string }[] = [
  { file: 'row-row-row-your-boat.musicxml', work: 'Row, Row, Row Your Boat' },
  { file: 'london-bridge.musicxml', work: 'London Bridge' },
  { file: 'frere-jacques.musicxml', work: 'Frère Jacques' },
  { file: 'yankee-doodle.musicxml', work: 'Yankee Doodle' },
  { file: 'oh-susanna.musicxml', work: 'Oh! Susanna (Stephen Foster, 1848)' },
  { file: 'happy-birthday.musicxml', work: 'Happy Birthday (Hill sisters, 1893)' },
  { file: 'amazing-grace.musicxml', work: 'Amazing Grace' },
  { file: 'brahms-lullaby.musicxml', work: 'Brahms, Lullaby (transposed to C)' },
  { file: 'auld-lang-syne.musicxml', work: 'Auld Lang Syne (transposed to C)' },
  { file: 'scarborough-fair.musicxml', work: 'Scarborough Fair' },
];

export interface Credit {
  name: string;
  licence: string;
  /** The package's own copyright holder line. */
  by: string;
  what: string;
}

export const LIBRARIES: readonly Credit[] = [
  { name: 'OpenSheetMusicDisplay', licence: 'BSD-3-Clause', by: 'PhonicScore', what: 'draws the sheet music view' },
  { name: 'VexFlow', licence: 'MIT', by: 'VexFlow contributors', what: 'draws the staff in Learn' },
  { name: '@tonejs/midi', licence: 'MIT', by: 'Yotam Mann', what: 'reads imported MIDI files' },
  { name: 'Dexie', licence: 'Apache-2.0', by: 'the Dexie authors', what: 'stores your data on this device' },
  { name: 'supabase-js', licence: 'MIT', by: 'Supabase', what: 'sign-in and sync' },
  { name: 'React', licence: 'MIT', by: 'Meta Platforms, Inc. and affiliates', what: 'the interface' },
];

export const FONTS: readonly Credit[] = [
  { name: 'Bricolage Grotesque', licence: 'OFL-1.1', by: 'The Bricolage Grotesque Project Authors', what: 'headings' },
  { name: 'DM Sans', licence: 'OFL-1.1', by: 'The DM Sans Project Authors', what: 'body text' },
  { name: 'JetBrains Mono', licence: 'OFL-1.1', by: 'The JetBrains Mono Project Authors', what: 'numbers and keys' },
];
