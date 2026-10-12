import { useSyncExternalStore } from 'react';
import { midi } from '../midi/engine';

export function useMidi() {
  return useSyncExternalStore(midi.subscribe, midi.getSnapshot);
}
