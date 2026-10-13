/**
 * What the Credits screen shows. src/songs/NOTICE.md stays the source of record for the bundled songs;
 * tests/credits.test.ts fails if this data and NOTICE.md drift apart. Library and font licences were read from
 * each package's package.json and LICENSE file in node_modules.
 */

export const REPO_URL = 'https://github.com/Bh0ss/keyfall';
export const LICENCE_URL = `${REPO_URL}/blob/main/LICENSE`;

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
  { file: 'burgmuller-la-candeur.musicxml', work: 'Burgmüller, La Candeur, Op. 100 No. 1', typesetter: 'Bas Wassink' },
  { file: 'burgmuller-la-pastorale.musicxml', work: 'Burgmüller, La Pastorale, Op. 100 No. 3', typesetter: 'Bas Wassink' },
  { file: 'burgmuller-innocence.musicxml', work: 'Burgmüller, Innocence, Op. 100 No. 5', typesetter: 'Bas Wassink' },
  { file: 'burgmuller-tendre-fleur.musicxml', work: 'Burgmüller, Tendre Fleur, Op. 100 No. 10', typesetter: 'Bas Wassink' },
  { file: 'burgmuller-la-petite-reunion.musicxml', work: 'Burgmüller, La Petite Réunion, Op. 100 No. 4', typesetter: 'Bas Wassink' },
  { file: 'schumann-traumerei.musicxml', work: 'Schumann, Träumerei (Kinderszenen, Op. 15 No. 7)', typesetter: 'Ying-Chun Liu' },
  { file: 'schumann-kinderszenen-gluckes-genug.musicxml', work: 'Schumann, Glückes genug (Kinderszenen, Op. 15 No. 5)', typesetter: 'Ying-Chun Liu' },
  { file: 'tchaikovsky-morning-prayer.musicxml', work: 'Tchaikovsky, Morning Prayer (Album for the Young, Op. 39 No. 1)', typesetter: 'Rem Zolotykh' },
  { file: 'tchaikovsky-march-wooden-soldiers.musicxml', work: 'Tchaikovsky, March of the Wooden Soldiers (Album for the Young, Op. 39 No. 5)', typesetter: null },
  { file: 'kuhlau-sonatine-op20-1-andante.musicxml', work: 'Kuhlau, Sonatine in C, Op. 20 No. 1, 2nd mvt (Andante)', typesetter: 'Bas Wassink' },
  { file: 'bach-menuet-anh-116.musicxml', work: 'Bach, Menuet in G, BWV Anh. 116 (Notebook for Anna Magdalena)', typesetter: 'Allen Garvin' },
  { file: 'bach-minuet-in-bb-anh-118.musicxml', work: 'Bach, Minuet in B-flat, BWV Anh. 118', typesetter: 'Steven McDougall' },
  { file: 'bach-minuet-anh-121.musicxml', work: 'Bach, Minuet in C minor, BWV Anh. 121', typesetter: 'Steven McDougall' },
  { file: 'joplin-maple-leaf-rag.musicxml', work: 'Joplin, Maple Leaf Rag', typesetter: 'Chris Sawer' },
  { file: 'joplin-elite-syncopations.musicxml', work: 'Joplin, Elite Syncopations', typesetter: 'Benjamin Bloomfield' },
  { file: 'joplin-peacherine-rag.musicxml', work: 'Joplin, Peacherine Rag', typesetter: 'Antonio Palama' },
  { file: 'joplin-the-easy-winners.musicxml', work: 'Joplin, The Easy Winners', typesetter: 'Tom Harke' },
  { file: 'joplin-solace.musicxml', work: 'Joplin, Solace (A Mexican Serenade)', typesetter: 'Magnus Lewis-Smith' },
  { file: 'chopin-waltz-op69-2.musicxml', work: 'Chopin, Waltz in B minor, Op. 69 No. 2', typesetter: 'Roland Goretzki' },
  { file: 'schubert-moments-musicaux-3.musicxml', work: 'Schubert, Moment musical No. 3 in F minor, D. 780 (Op. 94 No. 3, "Air russe")', typesetter: 'Claude Chaudron' },
  { file: 'mozart-rondo-alla-turca.musicxml', work: 'Mozart, Rondo alla Turca (Piano Sonata K. 331, 3rd mvt)', typesetter: 'Rune Zedeler and Chris Sawer' },
  { file: 'chopin-fantaisie-impromptu.musicxml', work: 'Chopin, Fantaisie-Impromptu, Op. 66', typesetter: 'Guy D. Lederfein' },
  { file: 'chopin-minute-waltz.musicxml', work: 'Chopin, Waltz in Db major, Op. 64 No. 1 (Minute Waltz)', typesetter: 'Magnus Lewis-Smith' },
  { file: 'schubert-impromptu-op90-3.musicxml', work: 'Schubert, Impromptu in Gb major, D. 899 No. 3 (Op. 90)', typesetter: 'Ph. Raynaud' },
  { file: 'chopin-etude-op10-5.musicxml', work: 'Chopin, Etude in Gb major, Op. 10 No. 5 ("Black Keys")', typesetter: null },
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
  { file: 'hot-cross-buns.musicxml', work: 'Hot Cross Buns' },
  { file: 'au-clair-de-la-lune.musicxml', work: 'Au clair de la lune' },
  { file: 'old-macdonald.musicxml', work: 'Old MacDonald Had a Farm' },
  { file: 'alle-meine-entchen.musicxml', work: 'Alle meine Entchen' },
  { file: 'haenschen-klein.musicxml', work: 'Hänschen klein' },
  { file: 'kuckuck.musicxml', work: 'Kuckuck, Kuckuck, ruft\'s aus dem Wald' },
  { file: 'farmer-in-the-dell.musicxml', work: 'The Farmer in the Dell' },
  { file: 'hush-little-baby.musicxml', work: 'Hush, Little Baby' },
  { file: 'der-kuckuck-und-der-esel.musicxml', work: 'Der Kuckuck und der Esel' },
  { file: 'wer-hat-die-schoensten-schaefchen.musicxml', work: 'Wer hat die schönsten Schäfchen' },
  { file: 'haensel-und-gretel-verliefen-sich-im-wald.musicxml', work: 'Hänsel und Gretel verliefen sich im Wald' },
  { file: 'silent-night.musicxml', work: 'Silent Night' },
  { file: 'joy-to-the-world.musicxml', work: 'Joy to the World' },
  { file: 'away-in-a-manger.musicxml', work: 'Away in a Manger' },
  { file: 'o-christmas-tree.musicxml', work: 'O Christmas Tree (O Tannenbaum)' },
  { file: 'deck-the-halls.musicxml', work: 'Deck the Halls' },
  { file: 'we-wish-you-a-merry-christmas.musicxml', work: 'We Wish You a Merry Christmas' },
  { file: 'aloha-oe.musicxml', work: 'Aloha Oe' },
  { file: 'weisst-du-wieviel-sternlein-stehen.musicxml', work: 'Weisst du, wieviel Sternlein stehen' },
  { file: 'nicaea-holy-holy-holy.musicxml', work: 'Holy, Holy, Holy (Nicaea)' },
  { file: 'kein-schoener-land.musicxml', work: 'Kein schoener Land in dieser Zeit' },
  { file: 'nearer-my-god-to-thee.musicxml', work: 'Nearer, My God, to Thee (Bethany)' },
  { file: 'winter-ade.musicxml', work: 'Winter ade' },
  { file: 'auf-du-junger-wandersmann.musicxml', work: 'Auf, du junger Wandersmann' },
  { file: 'alle-jahre-wieder.musicxml', work: 'Alle Jahre wieder' },
  { file: 'o-du-froehliche.musicxml', work: 'O du froehliche (O sanctissima)' },
  { file: 'hark-the-herald-angels-sing.musicxml', work: 'Hark! The Herald Angels Sing' },
  { file: 'o-come-all-ye-faithful.musicxml', work: 'O Come, All Ye Faithful (Adeste Fideles)' },
  { file: 'good-king-wenceslas.musicxml', work: 'Good King Wenceslas' },
  { file: 'god-rest-ye-merry-gentlemen.musicxml', work: 'God Rest Ye Merry, Gentlemen' },
  { file: 'nun-danket-alle-gott.musicxml', work: 'Nun danket alle Gott (Now Thank We All Our God)' },
  { file: 'duke-street.musicxml', work: 'Duke Street (Jesus Shall Reign)' },
  { file: 'lasst-uns-erfreuen.musicxml', work: 'Lasst uns erfreuen (All Creatures of Our God and King)' },
  { file: 'allein-gott-in-der-hoeh.musicxml', work: 'Allein Gott in der Höh sei Ehr (All Glory Be to God on High)' },
  { file: 'o-haupt-voll-blut-und-wunden.musicxml', work: 'O Haupt voll Blut und Wunden (Passion Chorale)' },
  { file: 'sakura-sakura.musicxml', work: 'Sakura Sakura (Cherry Blossoms)' },
  { file: 'ding-dong-merrily-on-high.musicxml', work: 'Ding Dong! Merrily on High' },
  { file: 'suesser-die-glocken.musicxml', work: 'Süßer die Glocken nie klingen (Sweeter the Bells Never Ring)' },
  { file: 'die-gedanken-sind-frei.musicxml', work: 'Die Gedanken sind frei (Thoughts Are Free)' },
  { file: 'my-bonnie-lies-over-the-ocean.musicxml', work: 'My Bonnie Lies over the Ocean' },
  { file: 'loch-lomond.musicxml', work: 'Loch Lomond (The Bonnie Banks o\' Loch Lomond)' },
  { file: 'veni-veni-emmanuel.musicxml', work: 'Veni, Veni, Emmanuel (O Come, O Come, Emmanuel)' },
  { file: 'wachet-auf-ruft-uns-die-stimme.musicxml', work: 'Wachet auf, ruft uns die Stimme (Sleepers, Wake!)' },
  { file: 'ein-feste-burg.musicxml', work: 'Ein feste Burg ist unser Gott (A Mighty Fortress)' },
  { file: 'tochter-zion.musicxml', work: 'Tochter Zion (See, the Conquering Hero Comes)' },
];

export interface ReferenceCredit {
  file: string;
  work: string;
  /** The Wikimedia Commons recording used for checking pitches. */
  reference: string;
  licence: string;
  licenceUrl: string;
}

/**
 * Reference recordings under an attribution licence. They were used to check pitches and rhythm only (nothing copied),
 * and are credited here anyway. The CC0 and public-domain references need no credit and are not listed.
 */
export const REFERENCE_CREDITS: readonly ReferenceCredit[] = [
  {
    file: 'nearer-my-god-to-thee.musicxml',
    work: 'Nearer, My God, to Thee',
    reference: 'Wikimedia Commons "Naeher, mein Gott, zu dir.mid" by Rabanus Flavus',
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  {
    file: 'sakura-sakura.musicxml',
    work: 'Sakura Sakura',
    reference: 'Wikimedia Commons "Sakura.MID" by Rainer Lewalter',
    licence: 'CC BY-SA 2.0 de',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/de/',
  },
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
  { name: 'Basic Pitch', licence: 'Apache-2.0', by: 'Spotify AB', what: 'the model and note detection that turn a recording into notes' },
  { name: 'TensorFlow.js', licence: 'Apache-2.0', by: 'Google LLC', what: 'runs that model on this device' },
  { name: 'Dexie', licence: 'Apache-2.0', by: 'the Dexie authors', what: 'stores your data on this device' },
  { name: 'supabase-js', licence: 'MIT', by: 'Supabase', what: 'sign-in and sync' },
  { name: 'React', licence: 'MIT', by: 'Meta Platforms, Inc. and affiliates', what: 'the interface' },
];

export const FONTS: readonly Credit[] = [
  { name: 'Bricolage Grotesque', licence: 'OFL-1.1', by: 'The Bricolage Grotesque Project Authors', what: 'headings' },
  { name: 'DM Sans', licence: 'OFL-1.1', by: 'The DM Sans Project Authors', what: 'body text' },
  { name: 'JetBrains Mono', licence: 'OFL-1.1', by: 'The JetBrains Mono Project Authors', what: 'numbers and keys' },
];
