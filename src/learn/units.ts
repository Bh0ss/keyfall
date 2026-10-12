import type { PromptKind } from './generate';

export interface MiniSongNote {
  midi: number;
  /** Length in quarter-note beats (0.5, 1, 2, 4). */
  beats: number;
  finger?: 1 | 2 | 3 | 4 | 5;
}

/** 4 to 8 bars using only the notes the unit has taught. Traditional tunes, public domain. */
export interface MiniSong {
  title: string;
  beatsPerBar: number;
  notes: MiniSongNote[];
}

export interface RhythmPattern {
  bpm: number;
  /** Onsets in beats from the first click. */
  beats: number[];
  /** The key to tap. */
  midi: number;
}

export type LessonKind = 'key-finder' | 'note-flash' | 'rhythm-tap' | 'mini-song';

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
}

export interface Unit {
  id: string;
  number: number;
  name: string;
  blurb: string;
  comingSoon: boolean;
  /** MIDI notes this unit teaches (empty for units that are only defined). */
  notes: number[];
  /** Lowest and highest key drawn on the lesson keyboard. */
  keyboard: [number, number];
  /** Finger number per note, where the unit teaches a hand position. */
  fingers?: Record<number, 1 | 2 | 3 | 4 | 5>;
  /** Sets of letters to memorise, shown on the "Memory trick" card. */
  mnemonics?: { label: string; letters: string; phrase?: string }[];
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
const unitTest = (kinds: PromptKind[]): LessonDef => ({
  id: 'test',
  kind: kinds.includes('note-flash') ? 'note-flash' : 'key-finder',
  title: 'Unit test',
  blurb: '20 prompts. Get 18 right to pass.',
  prompts: 20,
  kinds,
  test: true,
});

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
  { id: 'unit-6', number: 6, name: 'Rhythm basics', blurb: 'Quarter, half and whole notes, and tapping in time.', comingSoon: true, notes: [], keyboard: [60, 72], unlocks: 'Minuet in G', lessons: [] },
  { id: 'unit-7', number: 7, name: 'Sharps and flats', blurb: 'The black keys and the signs that name them.', comingSoon: true, notes: [], keyboard: [60, 72], unlocks: 'Greensleeves', lessons: [] },
  { id: 'unit-8', number: 8, name: 'Both hands', blurb: 'Reading and playing both staves together.', comingSoon: true, notes: [], keyboard: [48, 72], unlocks: 'Für Elise (opening)', lessons: [] },
  { id: 'unit-9', number: 9, name: 'Eighth notes and dotted rhythms', blurb: 'Faster notes and the dot.', comingSoon: true, notes: [], keyboard: [60, 72], unlocks: 'Canon in D', lessons: [] },
  { id: 'unit-10', number: 10, name: 'Key signatures', blurb: 'Which notes are sharp or flat all song long.', comingSoon: true, notes: [], keyboard: [60, 72], lessons: [] },
];

export function getUnit(id: string): Unit | undefined {
  return UNITS.find((u) => u.id === id);
}

export function unitNumber(id: string): number {
  const n = Number(/^unit-(\d+)$/.exec(id)?.[1]);
  return Number.isInteger(n) ? n : 0;
}

/** Every note taught by units up to and including this number. */
export function taughtThrough(n: number): number[] {
  return [...new Set(UNITS.filter((u) => u.number <= n).flatMap((u) => u.notes))];
}

export function getLesson(unit: Unit, lessonId: string): LessonDef | undefined {
  return unit.lessons.find((l) => l.id === lessonId);
}
