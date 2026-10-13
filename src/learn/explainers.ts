/**
 * Explainer cards: a short, skippable introduction shown at the top of each unit. A card has a concept, a small
 * diagram (drawn by the UI from this data, no images) and one tip. All text is original.
 */

export type DiagramTone = 'right' | 'left' | 'accent';

export type Diagram =
  | {
      kind: 'keyboard';
      range: [number, number];
      /** Keys to highlight in the accent colour. */
      marks?: number[];
      /** Finger numbers drawn under keys. */
      fingers?: Record<number, number>;
      /** Draw a bracket over each run of two or three black keys, with the count. */
      groups?: boolean;
      /** A coloured band under a run of keys, with a caption. */
      zones?: { from: number; to: number; label: string; tone: DiagramTone }[];
    }
  | { kind: 'posture' }
  | { kind: 'hands'; hands: 'right' | 'left' | 'both' }
  | { kind: 'staff'; clef: 'treble' | 'bass' }
  /** A bar split into equal counting slots; each cell covers `span` slots. */
  | { kind: 'beats'; counts: string[]; bars: { label: string; span: number }[] };

export interface ExplainerCard {
  title: string;
  concept: string;
  diagram: Diagram;
  /** What the diagram shows, in words, for screen readers. */
  alt: string;
  tip: string;
}

/** The unit's "finished lessons" list holds this id once the player has finished or skipped the cards. */
export const INTRO_ID = 'intro';

export const introSeen = (progress: { lessonsDone: readonly string[] } | undefined): boolean => !!progress?.lessonsDone.includes(INTRO_ID);

const FOUR = ['1', '2', '3', '4'];

const CARDS: Record<string, ExplainerCard[]> = {
  'unit-1': [
    {
      title: 'Read the keyboard by its black keys',
      concept:
        'White keys all look alike, but the black keys come in groups of two and three. Those groups are your landmarks. The white key just left of a pair of black keys is always C.',
      diagram: { kind: 'keyboard', range: [60, 72], groups: true, marks: [60, 72] },
      alt: 'A short keyboard from C to C. A bracket marks each group of two black keys and each group of three. The two Cs are highlighted.',
      tip: 'Say the letters out loud as you slide one finger up the white keys: C D E F G A B, then C again.',
    },
  ],
  'unit-2': [
    {
      title: 'Sit so your hands can relax',
      concept:
        'Sit on the front half of the bench, tall but loose, with the keyboard about a forearm away. Let your elbows hang a little above key height so your forearms and wrists make a flat line to the keys.',
      diagram: { kind: 'posture' },
      alt: 'A side view of a player at a keyboard. The upper arm hangs down, the forearm is level with the keys, and the feet rest flat on the floor.',
      tip: 'If your shoulders creep up toward your ears, shake your hands out and start again.',
    },
    {
      title: 'Fingers have numbers',
      concept:
        'Each finger has a number, the same on both hands: thumb is 1, then index 2, middle 3, ring 4 and pinky 5. Music often shows the number above or below a note to tell you which finger to use.',
      diagram: { kind: 'hands', hands: 'right' },
      alt: 'A right hand drawn with a number on each finger: thumb 1, index 2, middle 3, ring 4, pinky 5.',
      tip: 'Keep your fingers gently curved, as if you were holding a small ball.',
    },
    {
      title: 'Middle C position',
      concept: 'Rest your right thumb on middle C. Your five fingers then cover C D E F G, one finger per key, and you do not need to move your hand to play them.',
      diagram: { kind: 'keyboard', range: [60, 67], fingers: { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 }, marks: [60], zones: [{ from: 60, to: 67, label: 'Right hand, C position', tone: 'right' }] },
      alt: 'Five white keys from middle C to G with finger numbers 1 to 5 under them, middle C highlighted.',
      tip: 'Let each finger rest on its key before you play, so your hand knows where home is.',
    },
  ],
  'unit-3': [
    {
      title: 'The treble staff',
      concept:
        'Music is written on five lines. Notes sit on the lines or in the gaps between them, and higher on the page means higher on the keyboard. The treble staff holds the notes you usually play with your right hand.',
      diagram: { kind: 'staff', clef: 'treble' },
      alt: 'A staff of five lines. The lines from the bottom are labelled E, G, B, D, F and the spaces from the bottom are F, A, C, E.',
      tip: 'Count lines from the bottom. The bottom line is line 1, and the first space is the gap just above it.',
    },
  ],
  'unit-4': [
    {
      title: 'Your left hand has the same numbers',
      concept:
        'The left hand uses the same finger numbers, but they run the other way along the keys. Put your left little finger (5) on the C below middle C, and your thumb (1) lands on G.',
      diagram: { kind: 'keyboard', range: [48, 55], fingers: { 48: 5, 50: 4, 52: 3, 53: 2, 55: 1 }, marks: [48], zones: [{ from: 48, to: 55, label: 'Left hand, C position', tone: 'left' }] },
      alt: 'Five white keys from the C below middle C up to G, with finger numbers 5, 4, 3, 2, 1 under them.',
      tip: 'Play a few notes with the left hand slowly. It is usually the weaker hand, and that is normal.',
    },
    {
      title: 'Both hands, side by side',
      concept: 'Each hand has its own five fingers, numbered the same way. The two thumbs are number 1 and sit closest together, near the middle of the keyboard.',
      diagram: { kind: 'hands', hands: 'both' },
      alt: 'Two hands drawn side by side with numbers on each finger. The thumbs, both numbered 1, are in the middle.',
      tip: 'Check the number before you press. Thumb is always 1, whichever hand you use.',
    },
  ],
  'unit-5': [
    {
      title: 'The bass staff',
      concept:
        'The bass staff is the lower staff, for notes you usually play with the left hand. It has five lines too, but the same line holds a different note than on the treble staff, so learn this set on its own.',
      diagram: { kind: 'staff', clef: 'bass' },
      alt: 'A staff of five lines. The lines from the bottom are labelled G, B, D, F, A and the spaces from the bottom are A, C, E, G.',
      tip: 'Find one note you know well, such as the C just below the middle of the staff, and read the others from it.',
    },
  ],
  'unit-6': [
    {
      title: 'Counting beats',
      concept:
        'A beat is the steady pulse you could tap your foot to. A quarter note lasts one beat, a half note two and a whole note four. A rest is the same length, but you stay silent.',
      diagram: {
        kind: 'beats',
        counts: FOUR,
        bars: [
          { label: 'quarter', span: 1 },
          { label: 'quarter', span: 1 },
          { label: 'half', span: 2 },
        ],
      },
      alt: 'One bar of four counts, 1 2 3 4. A quarter note fills count 1, another fills count 2, and a half note fills counts 3 and 4.',
      tip: 'Count out loud, 1 2 3 4, and press the key on the number where a note starts.',
    },
  ],
  'unit-7': [
    {
      title: 'Sharps and flats are the black keys',
      concept:
        'A sharp (♯) means the very next key to the right, and a flat (♭) means the very next key to the left. Most of the time that is a black key, so every black key has two names.',
      diagram: { kind: 'keyboard', range: [64, 69], marks: [66] },
      alt: 'Six keys from E to A, black keys included. The black key between F and G is highlighted. It is F sharp when you come up from F, and G flat when you come down from G.',
      tip: 'Sharp climbs, flat falls: a sharp goes up one key and a flat goes down one key.',
    },
  ],
  'unit-8': [
    {
      title: 'Two hands, two staves',
      concept:
        'Piano music joins the treble staff and the bass staff. Notes stacked in the same spot on both staves are played at the same moment, one with each hand. Middle C sits between the two.',
      diagram: {
        kind: 'keyboard',
        range: [48, 67],
        marks: [60],
        zones: [
          { from: 48, to: 55, label: 'Left hand', tone: 'left' },
          { from: 60, to: 67, label: 'Right hand', tone: 'right' },
        ],
      },
      alt: 'A keyboard from the C below middle C to G above it. The left hand zone covers C to G below middle C and the right hand zone starts at middle C. Middle C is highlighted.',
      tip: 'Play each hand on its own first, then put them together slowly.',
    },
  ],
  'unit-9': [
    {
      title: 'Eighth notes and dots',
      concept:
        'Eighth notes are half a beat, so two of them fit in one count. Say "1 and 2 and" to count them. A dot after a note adds half of that note again, so a dotted quarter lasts one and a half beats.',
      diagram: {
        kind: 'beats',
        counts: ['1', '&', '2', '&', '3', '&', '4', '&'],
        bars: [
          { label: 'dotted quarter', span: 3 },
          { label: 'eighth', span: 1 },
          { label: 'quarter', span: 2 },
          { label: 'half', span: 2 },
        ],
      },
      alt: 'One bar counted 1 and 2 and 3 and 4 and. A dotted quarter covers three of the eight slots, an eighth one slot, a quarter two slots and a half note the last two slots.',
      tip: 'Keep the beat steady and let the "and" fall exactly halfway between the numbers.',
    },
  ],
  'unit-10': [
    {
      title: 'Key signatures save you work',
      concept:
        'Sharps or flats written once at the start of the staff apply to every note of that name for the whole song. In G major the signature has one sharp, F, so every F you see is played as F sharp.',
      diagram: { kind: 'keyboard', range: [67, 79], marks: [78], zones: [{ from: 67, to: 79, label: 'G major: F is always sharp', tone: 'accent' }] },
      alt: 'A keyboard from G up to the next G with the black key F sharp highlighted.',
      tip: 'Read the signature first, before the first note, and say which notes it changes.',
    },
  ],
  'unit-11': [
    {
      title: 'Find any key by its neighbours',
      concept:
        'You can find C, F and G without looking at labels. C is the white key left of a pair of black keys. F is the white key left of a group of three. G sits between the first and second black key of that three. The number after a letter is the octave: C4 is middle C, C3 is the C below and C5 the C above.',
      diagram: { kind: 'keyboard', range: [48, 72], groups: true, marks: [48, 53, 55, 60, 65, 67, 72] },
      alt: 'Two octaves of keyboard from C to C. Brackets mark each group of two black keys and each group of three. The Cs, Fs and Gs are highlighted.',
      tip: 'Touch the black keys with your fingertips to count the group, then drop to the white key beside it.',
    },
    {
      title: 'Shifting to a new position',
      concept:
        'A hand position is the five white keys your fingers cover. To play higher or lower you shift: lift your whole hand and set the thumb on a new home key. Do the shift in the rest between notes, keep your wrist loose and look at the target, not your hand.',
      diagram: {
        kind: 'keyboard',
        range: [60, 74],
        fingers: { 60: 1, 67: 1 },
        marks: [60, 67],
        zones: [
          { from: 60, to: 67, label: 'C position', tone: 'right' },
          { from: 67, to: 74, label: 'G position', tone: 'accent' },
        ],
      },
      alt: 'A keyboard from middle C up to D. A blue band covers C to G and an amber band covers G to the next D. The thumb, finger 1, is marked on C and on G.',
      tip: 'Say the name of the key your thumb is going to, such as "G", before you move.',
    },
  ],
};

export function explainerFor(unitId: string): ExplainerCard[] {
  return CARDS[unitId] ?? [];
}
