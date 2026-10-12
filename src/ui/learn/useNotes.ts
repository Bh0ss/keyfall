import { useEffect, useRef } from 'react';
import { midi } from '../../midi/engine';
import { isNavSwallowed } from '../../nav/store';

/** Call `handler(midi)` for every key pressed on the keyboard (real or virtual). */
export function useNoteOn(handler: (midiNote: number) => void): void {
  useNoteKeys(handler);
}

/** Call `down(midi)` when a key goes down and `up(midi)` when it comes up (two-hand prompts need both). */
export function useNoteKeys(down: (midiNote: number) => void, up?: (midiNote: number) => void): void {
  const ref = useRef({ down, up });
  useEffect(() => {
    ref.current = { down, up };
  });
  useEffect(
    () =>
      midi.subscribeNotes((e) => {
        // The five low command keys move the selection; they are never an answer.
        if (isNavSwallowed(e.midi)) return;
        if (e.type === 'noteOn') ref.current.down(e.midi);
        else if (e.type === 'noteOff') ref.current.up?.(e.midi);
      }),
    [],
  );
}
