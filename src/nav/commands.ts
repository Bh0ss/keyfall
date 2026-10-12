/**
 * Piano-key navigation: the lowest five white keys of an 88-key piano drive the menus, so the whole app can be
 * used from the keyboard without reaching for the mouse. No bundled song goes below F#1, so they never collide
 * with music; a song that does use them (an import) switches the commands off for that song.
 */
export type NavCommand = 'back' | 'prev' | 'select' | 'next' | 'home';

export const COMMAND_NOTES: Readonly<Record<NavCommand, number>> = {
  back: 21, // A0
  prev: 23, // B0
  select: 24, // C1
  next: 26, // D1
  home: 28, // E1
};

export interface CommandInfo {
  command: NavCommand;
  midi: number;
  /** Note name, e.g. "A0". */
  note: string;
  label: string;
}

/** In keyboard order, for the legend. */
export const COMMANDS: readonly CommandInfo[] = [
  { command: 'back', midi: 21, note: 'A0', label: 'Back' },
  { command: 'prev', midi: 23, note: 'B0', label: 'Previous' },
  { command: 'select', midi: 24, note: 'C1', label: 'Select' },
  { command: 'next', midi: 26, note: 'D1', label: 'Next' },
  { command: 'home', midi: 28, note: 'E1', label: 'Home' },
];

const BY_NOTE = new Map<number, NavCommand>(COMMANDS.map((c) => [c.midi, c.command]));

export function commandForNote(midi: number): NavCommand | null {
  return BY_NOTE.get(midi) ?? null;
}

export function isCommandNote(midi: number): boolean {
  return BY_NOTE.has(midi);
}

/** True when the song plays any of the five command notes; the commands are then off for that song. */
export function songUsesCommandNotes(notes: readonly { midi: number }[]): boolean {
  return notes.some((n) => BY_NOTE.has(n.midi));
}
