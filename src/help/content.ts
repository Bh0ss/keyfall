/**
 * All the help text in one place: the (i) bubbles, and the tips tour. Plain language for a first-time player.
 * Every control on the Play setup panel, the Songs list and the Settings screen must have an entry here
 * (tests/help-content.test.ts reads the screens and fails when one does not). All text is original.
 */

export interface HelpEntry {
  /** What the bubble is about; also the (i) button's accessible name. */
  title: string;
  text: string;
  /** Terms explained one by one under the text, e.g. the four modes. */
  items?: readonly { term: string; text: string }[];
}

const ENTRIES = {
  // Play setup
  'play.mode': {
    title: 'Difficulty',
    text: 'How strictly Keyfall judges your playing. You can change it before every song.',
    items: [
      { term: 'Wait', text: 'The song stops and waits until you press the right key. No timing pressure. Best for a new song.' },
      { term: 'Practice', text: 'Slower, 50 to 90 percent speed (you pick it), and the timing is forgiving. Work up to full speed.' },
      { term: 'Full', text: 'Full speed. Press each key close to its moment to score Perfect, Great or Good.' },
      { term: 'Expert', text: 'Full speed with tight timing and note names hidden. The sheet view is there if you need it.' },
    ],
  },
  'play.speed': {
    title: 'Speed',
    text: 'Practice mode only. A lower number plays the song slower. Start where you can keep up, then step it up.',
  },
  'play.metronome': {
    title: 'Metronome',
    text: 'A steady click on every beat so you can feel the tempo. The first beat of each bar gets a higher click.',
  },
  'play.countIn': {
    title: 'Count-in',
    text: 'One bar of clicks before the song starts, so you know when to come in.',
  },
  'play.drill': {
    title: 'Shift drill',
    text: 'Loops just the stretch around one hand move, so you can practise that move again and again. It replaces the A-B loop while it is on.',
  },
  'play.drillStep': {
    title: 'Previous and next shift',
    text: 'Steps to the earlier or later hand move in this song. The line beside them says which move it is, in which bar, and where your thumb goes.',
  },
  'play.shiftMarker': {
    title: 'Shift marker and shaded keys',
    text: 'A dashed line across the falling notes marks the note where your hand has to move, with an arrow for the direction. Shaded keys show where that hand sits now; a dashed outline marked next shows where it goes. Right hand is blue, left hand is purple.',
  },
  'play.autoFingers': {
    title: 'Auto fingers',
    text: 'Some songs have no finger numbers. When this is on, Keyfall works out sensible ones and shows them in parentheses, like (3). Off shows only the numbers written in the score.',
  },
  'play.positionNames': {
    title: 'Position names',
    text: 'Adds the key under your thumb to each finger number, like 3 · C, so you know where to put your hand. Shows when note names are on.',
  },
  'play.loop': {
    title: 'A-B loop',
    text: 'Repeats a stretch of bars until you have it. Turn it on, then choose the first and last bar.',
  },
  'play.loopBars': {
    title: 'From bar and to bar',
    text: 'The first and last bar of the loop. The song plays just those bars, over and over.',
  },

  // Songs
  'songs.sort': {
    title: 'Sort by',
    text: 'Difficulty puts the easiest songs first. A-Z sorts by title. Recent puts the songs you played last at the top.',
  },
  'songs.hands': {
    title: 'Hands filter',
    text: 'Shows only songs for one hand: Right, Left, or Both hands together. All shows every song.',
  },

  // Settings
  'settings.pianoNav': {
    title: 'Piano navigation',
    text: 'The five lowest white keys work the menus so you can stay at the piano: A0 back, B0 previous, C1 select, D1 next, E1 home. During a song only C1 does anything (pause).',
  },
  'settings.sound': {
    title: 'Sounds',
    text: 'Soft chimes when you move through menus, answer in Learn or finish a song. The metronome is separate and is not affected.',
  },
  'settings.handHelp': {
    title: 'Hand-position help',
    text: 'Shows when and where your hand has to move: a cue about a bar ahead, shaded keys for where the hand is and where it goes, and a shift drill in the song setup. Needs a song with finger numbers.',
  },
  'settings.autoFingering': {
    title: 'Auto finger numbers',
    text: 'For songs with no finger numbers, Keyfall works some out and shows them in parentheses, like (3), so you can tell them from the ones in the score.',
  },
  'settings.positionLabels': {
    title: 'Position names on notes',
    text: 'Adds the key under your thumb to each finger number, like 3 · C. It shows when note names are on.',
  },
  'settings.reduceMotion': {
    title: 'Reduce animation',
    text: 'Stops the celebrations and sliding screens. Keyfall also follows the reduce-motion setting of your device.',
  },
  'settings.tour': {
    title: 'Tips tour',
    text: 'A short walk through the main ideas, shown once for each new player. Use the button to see it again on Home.',
  },
  'settings.about': {
    title: 'About Keyfall',
    text: 'Credits lists who made Keyfall, the songs in it and the open-source libraries and fonts it uses, with their licences.',
  },
  'settings.latency': {
    title: 'Latency check',
    text: 'Some keyboards reach the game a little late, especially over Bluetooth. Tap along to eight clicks and Keyfall measures the delay, then takes it off every note you play.',
  },
  'settings.account': {
    title: 'Account and sync',
    text: 'Sign in to keep your players, scores and imported songs in step across your devices. Keyfall works without it, on this device only.',
  },

  // Results
  'results.score': {
    title: 'How points work',
    text: 'Each note scores by its timing: Perfect 100, Great 70, Good 40, Miss 0. Every 10 hits in a row raises a multiplier, up to x4, and a miss resets it. Wait mode has no timing grade.',
  },
  'results.accuracy': {
    title: 'Accuracy and stars',
    text: 'Accuracy is the share of notes you hit. 70 percent earns one star, 85 percent two, 95 percent three.',
  },
  'results.streak': {
    title: 'Longest streak',
    text: 'The most notes you hit in a row without a miss or a wrong key.',
  },
  'results.xp': {
    title: 'XP and level',
    text: 'Playing and finishing Learn units earns XP. XP builds up into your level, shown on Home.',
  },
  'results.timing': {
    title: 'Timing',
    text: 'How close each key press was to the note, in Full mode. Practice doubles these windows and Expert halves them.',
    items: [
      { term: 'Perfect', text: 'Within 50 ms of the note.' },
      { term: 'Great', text: 'Within 100 ms.' },
      { term: 'Good', text: 'Within 150 ms.' },
      { term: 'Miss', text: 'Later or earlier than that, or the wrong key.' },
    ],
  },
  'results.missed': {
    title: 'Where it went wrong',
    text: 'The notes you missed most, and a square for each bar: the redder the square, the more misses in that bar.',
  },
  'results.practice': {
    title: 'Practice my mistakes',
    text: 'Opens the song in Practice mode, looping only the bars where you missed most, at your Practice speed.',
  },
  'results.board': {
    title: 'High scores',
    text: 'The best scores on this song from every player on this device, with the mode and stars. Only a better score replaces an old one.',
  },

  // Learn
  'learn.pass': {
    title: 'Passing a unit',
    text: 'The unit test asks 20 questions. Get 18 right (90 percent) to pass and open the next unit. You can retake it as often as you like.',
  },
  'learn.review': {
    title: 'Review list',
    text: 'Notes you get wrong go on a review list and come up more often in lessons. A note leaves the list after you answer it right 3 times in a row.',
  },
  // Add song from a recording
  'addAudio.link': {
    title: 'Spotify link',
    text: 'Optional. Keyfall asks Spotify for the song title and cover picture so you do not have to type them. No audio comes from Spotify, and the link is not saved. Spotify does not share the artist, so type that yourself.',
  },
  'addAudio.file': {
    title: 'Your recording',
    text: 'An m4a, mp3 or wav file of you or someone else playing the song. It works best with a solo piano or a simple recording; a full band mix is accepted but the result is rougher. The audio stays on this device and is never saved.',
  },
  'addAudio.version': {
    title: 'Beginner or Full',
    text: 'Both play the recorded tune with the right hand and a left hand Keyfall writes itself.',
    items: [
      { term: 'Beginner', text: 'Simpler tune, fewer notes, and a plain left hand.' },
      { term: 'Full', text: 'Closer to the recording, with a busier left hand.' },
    ],
  },
  'addAudio.tempo': {
    title: 'Tempo',
    text: 'Keyfall guesses the speed, and it can be wrong. Tap Tap tempo along with the music, or type a number. Half and Double fix a guess that is twice too fast or twice too slow.',
  },
  'addAudio.key': {
    title: 'Key',
    text: 'The key the left hand chords are built in. Keyfall guesses it from the notes it heard. If the chords sound wrong against the recording, pick the key you think it is in.',
  },
  'addAudio.trim': {
    title: 'Trim',
    text: 'Keep only the part of the recording from the start second to the end second. Use it to cut off talking, applause or a long intro. Use whole song puts it back.',
  },
  'addAudio.preview': {
    title: 'Preview in Wait mode',
    text: 'Play the song you are about to save, in Wait mode, to check that it feels right. A preview saves nothing: no score, no results and no song. Back returns here with every choice you made. Reloading the page clears the preview and your choices.',
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpId = keyof typeof ENTRIES;

export const HELP: Readonly<Record<HelpId, HelpEntry>> = ENTRIES;

/**
 * The help entry for each button or select in the Play setup panel and the Songs list, by data-testid
 * (a template id like `mode-${id}` is its prefix: `mode-`).
 */
export const CONTROL_HELP: Readonly<Record<string, HelpId>> = {
  'mode-': 'play.mode',
  'speed-': 'play.speed',
  'toggle-metronome': 'play.metronome',
  'toggle-countin': 'play.countIn',
  'toggle-drill': 'play.drill',
  'drill-prev': 'play.drillStep',
  'drill-next': 'play.drillStep',
  'toggle-autofingers': 'play.autoFingers',
  'toggle-posnames': 'play.positionNames',
  'toggle-loop': 'play.loop',
  'loop-from': 'play.loopBars',
  'loop-to': 'play.loopBars',
  'sort-': 'songs.sort',
  'hands-': 'songs.hands',
};

/** The help entry for each Settings preference, by its `id`. */
export const SETTINGS_PREFERENCE_HELP: Readonly<Record<string, HelpId>> = {
  pianoNav: 'settings.pianoNav',
  sound: 'settings.sound',
  handHelp: 'settings.handHelp',
  autoFingering: 'settings.autoFingering',
  positionLabels: 'settings.positionLabels',
  reduceMotion: 'settings.reduceMotion',
};

export interface TourStep {
  title: string;
  text: string;
}

/** The one-time tips tour on Home. */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'Steer from the piano',
    text: 'The five lowest white keys work the menus: A0 back, B0 previous, C1 select, D1 next, E1 home. You can use all of Keyfall without leaving the keyboard.',
  },
  {
    title: 'Learn, or just play',
    text: 'Learn teaches the keys, the staff and rhythm in short lessons, and each unit you pass unlocks songs. Songs lets you pick a tune, sort the list and filter it by hand.',
  },
  {
    title: 'Choose how hard',
    text: 'Before a song starts you pick Wait, Practice, Full or Expert. Wait is the gentlest: the song stops until you press the right key.',
  },
  {
    title: 'Reading the falling notes',
    text: 'Notes fall onto the keys. When your hand has to move, a dashed line across the lanes marks the note with an arrow, and shaded keys show where your hand sits now and where it goes next.',
  },
  {
    title: 'After the song',
    text: 'Results shows your score, stars, timing and the bars you missed most. Practice my mistakes loops just those bars so you can fix them.',
  },
  {
    title: 'Look for the (i)',
    text: 'The small (i) buttons explain what a control does. Hover over one, tap it, or step to it with the piano keys. You can replay this tour any time from Settings.',
  },
];
