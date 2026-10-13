import type { PromptKind } from './generate';
import { layOut, Q, H, W, QR, HR, WR, E, DQ, DH, ER } from './rhythm';
import type { Spell } from './staff';

type Finger = 1 | 2 | 3 | 4 | 5;

export interface MiniSongNote {
  midi: number;
  /** Length in quarter-note beats (0.5, 1, 1.5, 2, 3, 4). */
  beats: number;
  finger?: Finger;
  /** A rest: nothing to play, the song skips it. */
  rest?: boolean;
  /** Black keys: written as a sharp or a flat (default: sharp, or flat in a flat key signature). */
  spell?: Spell;
  /** A left-hand key struck together with this one (two-hand songs). */
  left?: { midi: number; finger?: Finger };
}

/** 4 to 8 bars using only the notes the unit has taught. Traditional tunes, public domain. */
export interface MiniSong {
  title: string;
  beatsPerBar: number;
  /** Key signature id (see keysig.ts) drawn on the staff. */
  keySig?: string;
  notes: MiniSongNote[];
}

export interface RhythmPattern {
  bpm: number;
  /** Onsets in beats from the first click: where to tap. Rests have none. */
  beats: number[];
  /** The key to tap. */
  midi: number;
  /** The written pattern, as rhythm symbol ids; drawn on a staff. */
  steps?: number[];
  /** Total length in beats; the metronome clicks every beat. Defaults to the last onset plus one. */
  length?: number;
}

export type LessonKind = 'key-finder' | 'note-flash' | 'rhythm-tap' | 'mini-song' | 'rhythm-read' | 'both-hands' | 'key-sig';

export interface LessonDef {
  id: string;
  kind: LessonKind;
  title: string;
  blurb: string;
  /** Prompt lessons: how many prompts. */
  prompts?: number;
  /** Prompt kinds drawn in this lesson (the unit test may mix them). */
  kinds?: PromptKind[];
  /** The unit test: 20 prompts, 90% passes the unit, keyboard labels hidden. */
  test?: boolean;
  /** Not needed for the unit to pass. */
  optional?: boolean;
  song?: MiniSong;
  pattern?: RhythmPattern;
  /** Note flash drawn on a grand staff (both clefs). */
  grand?: boolean;
  /** Prompt lessons: draw only from these keys instead of every key the unit teaches. */
  notes?: number[];
  /** Prompt lessons: the on-screen keyboard stays hidden until the answer is in, so the player finds the key by feel. */
  eyesOff?: boolean;
}

export interface Unit {
  id: string;
  number: number;
  name: string;
  blurb: string;
  comingSoon: boolean;
  /** MIDI notes this unit teaches (empty for units that are only defined). */
  notes: number[];
  /** Rhythm symbols (ids from rhythm.ts) this unit teaches. */
  symbols?: number[];
  /** Lowest and highest key drawn on the lesson keyboard. */
  keyboard: [number, number];
  /** Finger number per note, where the unit teaches a hand position. */
  fingers?: Record<number, 1 | 2 | 3 | 4 | 5>;
  /** Sets of letters to memorise, shown on the "Memory trick" card. */
  mnemonics?: { label: string; letters: string; phrase?: string }[];
  /** Key-finder hints name the black-key groups beside each letter (the landmark trick from Unit 1). */
  landmarkHints?: boolean;
  /** Song title shown under the unit as the thing it unlocks. */
  unlocks?: string;
  lessons: LessonDef[];
}

const kf = (id: string, title: string, blurb: string, test = false, prompts = 10): LessonDef => ({
  id, kind: 'key-finder', title, blurb, prompts: test ? 20 : prompts, kinds: ['key-finder'], test,
});
const nf = (id: string, title: string, blurb: string, test = false, prompts = 10): LessonDef => ({
  id, kind: 'note-flash', title, blurb, prompts: test ? 20 : prompts, kinds: ['note-flash'], test,
});
const LESSON_KIND: Record<PromptKind, LessonKind> = {
  'key-finder': 'key-finder',
  'note-flash': 'note-flash',
  'both-hands': 'both-hands',
  'rhythm-name': 'rhythm-read',
  'rhythm-beats': 'rhythm-read',
  'keysig-name': 'key-sig',
  'in-key': 'key-sig',
};
const unitTest = (kinds: PromptKind[]): LessonDef => ({
  id: 'test',
  kind: kinds.includes('note-flash') ? 'note-flash' : LESSON_KIND[kinds[0]!],
  title: 'Unit test',
  blurb: '20 prompts. Get 18 right to pass.',
  prompts: 20,
  kinds,
  test: true,
});

const rest = (beats: number): MiniSongNote => ({ midi: 0, beats, rest: true });
const flat = (midi: number, beats: number, finger: Finger): MiniSongNote => ({ midi, beats, finger, spell: 'flat' });
const both = (midi: number, beats: number, finger: Finger, left: number, leftFinger: Finger): MiniSongNote => ({ midi, beats, finger, left: { midi: left, finger: leftFinger } });
const read = (id: string, title: string, blurb: string, kinds: PromptKind[]): LessonDef => ({
  id, kind: 'rhythm-read', title, blurb, prompts: 10, kinds,
});
const tap = (id: string, title: string, blurb: string, bpm: number, steps: number[]): LessonDef => {
  const { onsets, length } = layOut(steps);
  return { id, kind: 'rhythm-tap', title, blurb, optional: true, pattern: { bpm, beats: onsets, midi: 60, steps, length } };
};

const RIGHT_C: Record<number, 1 | 2 | 3 | 4 | 5> = { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 };
const LEFT_C: Record<number, 1 | 2 | 3 | 4 | 5> = { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1 };

export const UNITS: Unit[] = [
  {
    id: 'unit-1',
    number: 1,
    name: 'Keyboard map',
    blurb: 'Find any white key by the groups of black keys. Two black keys point to C, D and E. Three point to F, G, A and B.',
    comingSoon: false,
    notes: [60, 62, 64, 65, 67, 69, 71, 72],
    keyboard: [60, 72],
    lessons: [
      kf('keys', 'Find the key', 'A letter is shown. Press that white key.'),
      { ...unitTest(['key-finder']) },
    ],
  },
  {
    id: 'unit-2',
    number: 2,
    name: 'Middle C position',
    blurb: 'Rest your right thumb on middle C. Your five fingers cover C D E F G.',
    comingSoon: false,
    notes: [60, 62, 64, 65, 67],
    keyboard: [60, 72],
    fingers: RIGHT_C,
    unlocks: 'Ode to Joy',
    lessons: [
      kf('keys', 'Find the key', 'A letter is shown. Press that key with the matching finger.'),
      nf('flash', 'Note flash', 'A note on the staff is shown. Press it.'),
      {
        id: 'rhythm',
        kind: 'rhythm-tap',
        title: 'Rhythm tap',
        blurb: 'Tap middle C with the clicks. Warm-up, not needed to pass.',
        optional: true,
        pattern: { bpm: 80, beats: [0, 1, 2, 3, 4, 5, 6, 7], midi: 60 },
      },
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Hot Cross Buns',
        blurb: 'Four bars with three notes. Play them in order.',
        optional: true,
        song: {
          title: 'Hot Cross Buns',
          beatsPerBar: 4,
          notes: [
            { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 60, beats: 2, finger: 1 },
            { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 60, beats: 2, finger: 1 },
            { midi: 60, beats: 0.5, finger: 1 }, { midi: 60, beats: 0.5, finger: 1 }, { midi: 60, beats: 0.5, finger: 1 }, { midi: 60, beats: 0.5, finger: 1 },
            { midi: 62, beats: 0.5, finger: 2 }, { midi: 62, beats: 0.5, finger: 2 }, { midi: 62, beats: 0.5, finger: 2 }, { midi: 62, beats: 0.5, finger: 2 },
            { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 60, beats: 2, finger: 1 },
          ],
        },
      },
      unitTest(['key-finder', 'note-flash']),
    ],
  },
  {
    id: 'unit-3',
    number: 3,
    name: 'Treble staff',
    blurb: 'Read the lines and spaces of the treble staff, from E4 up to F5.',
    comingSoon: false,
    notes: [64, 65, 67, 69, 71, 72, 74, 76, 77],
    keyboard: [60, 77],
    unlocks: 'Jingle Bells',
    mnemonics: [
      { label: 'Lines, bottom to top', letters: 'E G B D F', phrase: 'Every Good Boy Does Fine' },
      { label: 'Spaces', letters: 'F A C E', phrase: 'FACE' },
    ],
    lessons: [
      nf('flash', 'Note flash', 'A note on the treble staff is shown. Press it.', false, 15),
      unitTest(['note-flash']),
    ],
  },
  {
    id: 'unit-4',
    number: 4,
    name: 'Bass clef position',
    blurb: 'Put your left little finger on the C below middle C. Your five fingers cover C D E F G.',
    comingSoon: false,
    notes: [48, 50, 52, 53, 55],
    keyboard: [48, 60],
    fingers: LEFT_C,
    unlocks: 'When the Saints Go Marching In',
    lessons: [
      kf('keys', 'Find the key', 'A letter is shown. Press that key with the matching left-hand finger.'),
      nf('flash', 'Note flash', 'A note on the bass staff is shown. Press it.'),
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Au Clair de la Lune',
        blurb: 'Four bars with three notes, left hand.',
        optional: true,
        song: {
          title: 'Au Clair de la Lune',
          beatsPerBar: 4,
          notes: [
            { midi: 48, beats: 1, finger: 5 }, { midi: 48, beats: 1, finger: 5 }, { midi: 48, beats: 1, finger: 5 }, { midi: 50, beats: 1, finger: 4 },
            { midi: 52, beats: 2, finger: 3 }, { midi: 50, beats: 2, finger: 4 },
            { midi: 48, beats: 1, finger: 5 }, { midi: 52, beats: 1, finger: 3 }, { midi: 50, beats: 1, finger: 4 }, { midi: 50, beats: 1, finger: 4 },
            { midi: 48, beats: 4, finger: 5 },
          ],
        },
      },
      unitTest(['key-finder', 'note-flash']),
    ],
  },
  {
    id: 'unit-5',
    number: 5,
    name: 'Bass staff',
    blurb: 'Read the lines and spaces of the bass staff, from G2 up to A3.',
    comingSoon: false,
    notes: [43, 45, 47, 48, 50, 52, 53, 55, 57],
    keyboard: [43, 60],
    mnemonics: [
      { label: 'Lines, bottom to top', letters: 'G B D F A', phrase: 'Good Boys Do Fine Always' },
      { label: 'Spaces', letters: 'A C E G', phrase: 'All Cows Eat Grass' },
    ],
    lessons: [
      nf('flash', 'Note flash', 'A note on the bass staff is shown. Press it.', false, 15),
      unitTest(['note-flash']),
    ],
  },
  {
    id: 'unit-6',
    number: 6,
    name: 'Rhythm basics',
    blurb: 'Quarter, half and whole notes and their rests say how long to wait. Read them, then tap them in time.',
    comingSoon: false,
    notes: [60, 62, 64, 65, 67],
    symbols: [Q, H, W, QR, HR, WR],
    keyboard: [60, 72],
    fingers: RIGHT_C,
    unlocks: 'Minuet in G',
    mnemonics: [
      { label: 'Notes', letters: 'quarter 1 beat · half 2 beats · whole 4 beats' },
      { label: 'Rests are silent', letters: 'the same lengths, with nothing played' },
    ],
    lessons: [
      read('read', 'Read the rhythm', 'A note or rest is shown. Name it or say how many beats it lasts.', ['rhythm-name', 'rhythm-beats']),
      tap('tap-1', 'Rhythm tap: quarters and halves', 'Tap middle C on each note. A half note lasts two clicks.', 70, [Q, Q, H, Q, Q, H]),
      tap('tap-2', 'Rhythm tap: rests and a whole note', 'Stay silent on a rest. Tap once on a whole note.', 70, [Q, Q, QR, Q, H, HR, W]),
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Rest Stop',
        blurb: 'Five bars with rests. Play the notes in order; the rests are skipped.',
        optional: true,
        song: {
          title: 'Rest Stop',
          beatsPerBar: 4,
          notes: [
            { midi: 60, beats: 1, finger: 1 }, { midi: 62, beats: 1, finger: 2 }, { midi: 64, beats: 2, finger: 3 },
            { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 60, beats: 2, finger: 1 },
            { midi: 67, beats: 1, finger: 5 }, rest(1), { midi: 67, beats: 1, finger: 5 }, rest(1),
            { midi: 65, beats: 1, finger: 4 }, { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 2, finger: 2 },
            { midi: 60, beats: 4, finger: 1 },
          ],
        },
      },
      unitTest(['rhythm-name', 'rhythm-beats']),
    ],
  },
  {
    id: 'unit-7',
    number: 7,
    name: 'Sharps and flats',
    blurb: 'A sharp raises a note one key; a flat lowers it one key. The black keys carry both names.',
    comingSoon: false,
    notes: [61, 63, 66, 68, 70],
    keyboard: [60, 72],
    unlocks: 'Greensleeves',
    mnemonics: [
      { label: 'Sharp ♯', letters: 'the next key up', phrase: 'F♯ is the black key right of F' },
      { label: 'Flat ♭', letters: 'the next key down', phrase: 'G♭ is the black key left of G' },
      { label: 'Same key, two names', letters: 'F♯ = G♭ · C♯ = D♭ · D♯ = E♭ · G♯ = A♭ · A♯ = B♭' },
    ],
    lessons: [
      kf('keys', 'Find the black key', 'A sharp or flat name is shown. Press that black key.'),
      nf('flash', 'Note flash', 'A note with a sharp or flat sign is shown. Press it.'),
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Black Key Lullaby',
        blurb: 'Six bars on the black keys only, written with flats.',
        optional: true,
        song: {
          title: 'Black Key Lullaby',
          beatsPerBar: 4,
          notes: [
            flat(61, 1, 2), flat(63, 1, 3), flat(61, 1, 2), flat(63, 1, 3),
            flat(66, 2, 2), flat(63, 2, 3),
            flat(68, 1, 3), flat(66, 1, 2), flat(68, 1, 3), flat(70, 1, 4),
            flat(70, 2, 4), flat(68, 2, 3),
            flat(66, 1, 2), flat(63, 1, 3), flat(61, 1, 2), flat(63, 1, 3),
            flat(61, 4, 2),
          ],
        },
      },
      unitTest(['key-finder', 'note-flash']),
    ],
  },
  {
    id: 'unit-8',
    number: 8,
    name: 'Both hands',
    blurb: 'The grand staff joins treble and bass. Read both, and press keys from both hands at the same time.',
    comingSoon: false,
    notes: [48, 50, 52, 53, 55, 60, 62, 64, 65, 67],
    keyboard: [48, 72],
    unlocks: 'Für Elise (opening)',
    mnemonics: [{ label: 'Grand staff', letters: 'treble on top (right hand) · bass below (left hand)', phrase: 'Middle C sits between them' }],
    lessons: [
      { id: 'flash', kind: 'note-flash', title: 'Grand staff note flash', blurb: 'A note on the grand staff is shown. Press it.', prompts: 15, kinds: ['note-flash'], grand: true },
      {
        id: 'together',
        kind: 'both-hands',
        title: 'Both hands together',
        blurb: 'Notes on both staves are shown. Press them all at the same time.',
        prompts: 10,
        kinds: ['both-hands'],
      },
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Hands Together',
        blurb: 'Five bars with the left hand joining in. Press both keys together where you see two notes.',
        optional: true,
        song: {
          title: 'Hands Together',
          beatsPerBar: 4,
          notes: [
            both(60, 1, 1, 48, 5), { midi: 62, beats: 1, finger: 2 }, both(64, 1, 3, 52, 3), { midi: 62, beats: 1, finger: 2 },
            both(60, 1, 1, 48, 5), { midi: 62, beats: 1, finger: 2 }, both(64, 2, 3, 52, 3),
            both(65, 1, 4, 53, 2), { midi: 64, beats: 1, finger: 3 }, both(62, 1, 2, 50, 4), { midi: 60, beats: 1, finger: 1 },
            both(67, 1, 5, 55, 1), { midi: 65, beats: 1, finger: 4 }, both(64, 1, 3, 52, 3), { midi: 62, beats: 1, finger: 2 },
            both(60, 4, 1, 48, 5),
          ],
        },
      },
      unitTest(['note-flash', 'both-hands']),
    ],
  },
  {
    id: 'unit-9',
    number: 9,
    name: 'Eighth notes and dotted rhythms',
    blurb: 'Eighth notes split a beat in two. A dot adds half of the note again.',
    comingSoon: false,
    notes: [60, 62, 64, 65, 67],
    symbols: [E, DQ, DH, ER],
    keyboard: [60, 72],
    fingers: RIGHT_C,
    unlocks: 'Canon in D',
    mnemonics: [
      { label: 'Eighth note', letters: '½ beat · two eighths fill one beat' },
      { label: 'The dot adds half', letters: 'dotted quarter = 1½ · dotted half = 3' },
    ],
    lessons: [
      read('read', 'Read the rhythm', 'A note or rest is shown. Name it or say how many beats it lasts.', ['rhythm-name', 'rhythm-beats']),
      tap('tap-1', 'Rhythm tap: eighth notes', 'Two taps in every beat where you see a pair of eighths.', 60, [Q, E, E, Q, Q, E, E, E, E, H]),
      tap('tap-2', 'Rhythm tap: dotted rhythms', 'Hold a dotted quarter for a beat and a half, then tap the eighth.', 60, [DQ, E, Q, Q, DQ, E, H]),
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Row, Row, Row Your Boat',
        blurb: 'Five bars with eighth notes and dotted quarters.',
        optional: true,
        song: {
          title: 'Row, Row, Row Your Boat',
          beatsPerBar: 4,
          notes: [
            { midi: 60, beats: 1, finger: 1 }, { midi: 60, beats: 1, finger: 1 }, { midi: 60, beats: 1.5, finger: 1 }, { midi: 62, beats: 0.5, finger: 2 },
            { midi: 64, beats: 1.5, finger: 3 }, { midi: 62, beats: 0.5, finger: 2 }, { midi: 64, beats: 1.5, finger: 3 }, { midi: 65, beats: 0.5, finger: 4 },
            { midi: 67, beats: 4, finger: 5 },
            { midi: 67, beats: 1.5, finger: 5 }, { midi: 65, beats: 0.5, finger: 4 }, { midi: 64, beats: 1.5, finger: 3 }, { midi: 62, beats: 0.5, finger: 2 },
            { midi: 60, beats: 4, finger: 1 },
          ],
        },
      },
      unitTest(['rhythm-name', 'rhythm-beats']),
    ],
  },
  {
    id: 'unit-10',
    number: 10,
    name: 'Key signatures',
    blurb: 'Sharps or flats at the start of the staff apply to every note of that name, all song long.',
    comingSoon: false,
    notes: [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 74, 76, 77],
    keyboard: [60, 77],
    mnemonics: [
      { label: 'Sharps, in order', letters: 'F C G D A E B', phrase: 'Father Charles Goes Down And Ends Battle' },
      { label: 'Flats, in order', letters: 'B E A D G C F', phrase: 'Battle Ends And Down Goes Charles’s Father' },
      { label: 'Keys in this unit', letters: 'C · G (1♯) · D (2♯) · A (3♯) · F (1♭) · B♭ (2♭) · E♭ (3♭)' },
    ],
    lessons: [
      {
        id: 'read',
        kind: 'key-sig',
        title: 'Name the key',
        blurb: 'A key signature is shown. Pick the major key it belongs to.',
        prompts: 10,
        kinds: ['keysig-name'],
      },
      {
        id: 'in-key',
        kind: 'key-sig',
        title: 'Play it in the key',
        blurb: 'A key signature and a note are shown. Press the key that note really is, signature applied.',
        prompts: 10,
        kinds: ['in-key'],
      },
      {
        id: 'scale',
        kind: 'mini-song',
        title: 'Scale: F major',
        blurb: 'Up and down one octave. The signature turns every B into B♭.',
        optional: true,
        song: {
          title: 'F major scale',
          beatsPerBar: 4,
          keySig: 'F',
          notes: [
            { midi: 65, beats: 1, finger: 1 }, { midi: 67, beats: 1, finger: 2 }, { midi: 69, beats: 1, finger: 3 }, { midi: 70, beats: 1, finger: 4 },
            { midi: 72, beats: 1, finger: 1 }, { midi: 74, beats: 1, finger: 2 }, { midi: 76, beats: 1, finger: 3 }, { midi: 77, beats: 1, finger: 4 },
            { midi: 77, beats: 1, finger: 4 }, { midi: 76, beats: 1, finger: 3 }, { midi: 74, beats: 1, finger: 2 }, { midi: 72, beats: 1, finger: 1 },
            { midi: 70, beats: 1, finger: 4 }, { midi: 69, beats: 1, finger: 3 }, { midi: 67, beats: 1, finger: 2 }, { midi: 65, beats: 1, finger: 1 },
          ],
        },
      },
      {
        id: 'song',
        kind: 'mini-song',
        title: 'Mini song: Sharp Eyes',
        blurb: 'Five bars in G major. The signature makes every F an F♯.',
        optional: true,
        song: {
          title: 'Sharp Eyes',
          beatsPerBar: 4,
          keySig: 'G',
          notes: [
            { midi: 67, beats: 1, finger: 1 }, { midi: 69, beats: 1, finger: 2 }, { midi: 71, beats: 1, finger: 3 }, { midi: 74, beats: 1, finger: 5 },
            { midi: 71, beats: 1, finger: 3 }, { midi: 69, beats: 1, finger: 2 }, { midi: 67, beats: 2, finger: 1 },
            { midi: 64, beats: 1, finger: 2 }, { midi: 66, beats: 1, finger: 3 }, { midi: 67, beats: 1, finger: 4 }, { midi: 69, beats: 1, finger: 5 },
            { midi: 67, beats: 1, finger: 4 }, { midi: 66, beats: 1, finger: 3 }, { midi: 64, beats: 1, finger: 2 }, { midi: 62, beats: 1, finger: 1 },
            { midi: 67, beats: 4, finger: 4 },
          ],
        },
      },
      unitTest(['keysig-name', 'in-key']),
    ],
  },
  {
    id: 'unit-11',
    number: 11,
    name: 'Moving around the keyboard',
    blurb: 'Find C, F and G anywhere on the keyboard by the black-key groups, then slide your hand to a new position without looking down.',
    comingSoon: false,
    notes: [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74],
    keyboard: [48, 74],
    landmarkHints: true,
    mnemonics: [
      { label: 'Two black keys', letters: 'C sits just left of the pair, E just right', phrase: 'C is on the left of the twins' },
      { label: 'Three black keys', letters: 'F sits just left of the trio, B just right', phrase: 'F begins the family of three' },
      { label: 'G', letters: 'between the first and second of the three' },
    ],
    lessons: [
      kf('landmarks', 'Find the key', 'A key name and octave are shown, such as C4. Use the black-key groups to find it.', false, 15),
      {
        id: 'anchors',
        kind: 'key-finder',
        title: 'C, F and G, eyes off',
        blurb: 'Find each key by feel from the black-key groups. The keyboard on screen stays hidden until you press.',
        prompts: 12,
        kinds: ['key-finder'],
        notes: [48, 53, 55, 60, 65, 67, 72],
        eyesOff: true,
      },
      {
        id: 'shift',
        kind: 'mini-song',
        title: 'Shift drill: Hill Climb',
        blurb: 'Seven bars. Your hand starts on C, then slides up so your thumb sits on G, and comes back.',
        optional: true,
        song: {
          title: 'Hill Climb',
          beatsPerBar: 4,
          notes: [
            { midi: 60, beats: 1, finger: 1 }, { midi: 62, beats: 1, finger: 2 }, { midi: 64, beats: 1, finger: 3 }, { midi: 65, beats: 1, finger: 4 },
            { midi: 67, beats: 2, finger: 5 }, { midi: 67, beats: 2, finger: 1 },
            { midi: 69, beats: 1, finger: 2 }, { midi: 71, beats: 1, finger: 3 }, { midi: 72, beats: 1, finger: 4 }, { midi: 74, beats: 1, finger: 5 },
            { midi: 72, beats: 1, finger: 4 }, { midi: 71, beats: 1, finger: 3 }, { midi: 69, beats: 1, finger: 2 }, { midi: 67, beats: 1, finger: 1 },
            { midi: 67, beats: 2, finger: 1 }, { midi: 67, beats: 2, finger: 5 },
            { midi: 65, beats: 1, finger: 4 }, { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 60, beats: 1, finger: 1 },
            { midi: 60, beats: 4, finger: 1 },
          ],
        },
      },
      {
        id: 'homes',
        kind: 'mini-song',
        title: 'Shift drill: Three Homes',
        blurb: 'Eight bars that visit the C, F and G positions in turn. Move your thumb to the new home before each new bar.',
        optional: true,
        song: {
          title: 'Three Homes',
          beatsPerBar: 4,
          notes: [
            { midi: 60, beats: 1, finger: 1 }, { midi: 62, beats: 1, finger: 2 }, { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 },
            { midi: 60, beats: 1, finger: 1 }, { midi: 64, beats: 1, finger: 3 }, { midi: 67, beats: 1, finger: 5 }, { midi: 64, beats: 1, finger: 3 },
            { midi: 65, beats: 1, finger: 1 }, { midi: 67, beats: 1, finger: 2 }, { midi: 69, beats: 1, finger: 3 }, { midi: 67, beats: 1, finger: 2 },
            { midi: 65, beats: 1, finger: 1 }, { midi: 69, beats: 1, finger: 3 }, { midi: 72, beats: 1, finger: 5 }, { midi: 69, beats: 1, finger: 3 },
            { midi: 67, beats: 1, finger: 1 }, { midi: 69, beats: 1, finger: 2 }, { midi: 71, beats: 1, finger: 3 }, { midi: 69, beats: 1, finger: 2 },
            { midi: 67, beats: 1, finger: 1 }, { midi: 71, beats: 1, finger: 3 }, { midi: 74, beats: 1, finger: 5 }, { midi: 71, beats: 1, finger: 3 },
            { midi: 67, beats: 1, finger: 5 }, { midi: 64, beats: 1, finger: 3 }, { midi: 62, beats: 1, finger: 2 }, { midi: 64, beats: 1, finger: 3 },
            { midi: 60, beats: 4, finger: 1 },
          ],
        },
      },
      kf('test', 'Unit test', '20 prompts. Get 18 right to pass.', true),
    ],
  },
];

export function getUnit(id: string): Unit | undefined {
  return UNITS.find((u) => u.id === id);
}

export function unitNumber(id: string): number {
  const n = Number(/^unit-(\d+)$/.exec(id)?.[1]);
  return Number.isInteger(n) ? n : 0;
}

/** Every rhythm symbol taught by units up to and including this number. */
export function taughtSymbolsThrough(n: number): number[] {
  return [...new Set(UNITS.filter((u) => u.number <= n).flatMap((u) => u.symbols ?? []))];
}

/** Every note taught by units up to and including this number. */
export function taughtThrough(n: number): number[] {
  return [...new Set(UNITS.filter((u) => u.number <= n).flatMap((u) => u.notes))];
}

export function getLesson(unit: Unit, lessonId: string): LessonDef | undefined {
  return unit.lessons.find((l) => l.id === lessonId);
}
