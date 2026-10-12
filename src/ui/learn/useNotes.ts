import { useEffect, useRef } from 'react';
import { midi } from '../../midi/engine';

/** Call `handler(midi)` for every key pressed on the keyboard (real or virtual). */
export function useNoteOn(handler: (midiNote: number) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(
    () =>
      midi.subscribeNotes((e) => {
        if (e.type === 'noteOn') ref.current(e.midi);
      }),
    [],
  );
}
