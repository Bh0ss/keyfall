import { useEffect, useRef } from 'react';
import { HOLD_MS, resolveCommand, type NavAction } from '../nav/actions';
import { commandForNote } from '../nav/commands';
import { activateSelection, moveSelection } from '../nav/dom';
import { getNavScope, navEnabled, setNavEnabled, togglePause } from '../nav/store';
import { midi } from '../midi/engine';
import { setSoundEnabled, playSound } from './sounds';
import { useProfiles } from './profileStore';
import { useRoute } from './useRoute';

/**
 * Piano-key navigation and the per-profile sound and motion settings. Renders nothing.
 * The five command keys arrive through the same MIDI pipeline as every other key, so tests drive them with
 * `__keyfall.press`. While a ring is wanted, `data-nav="piano"` on the root makes the focus ring show on whatever
 * the keys selected (the browser only draws it for keyboard users otherwise).
 */
export function PianoNav() {
  const { profiles, activeId } = useProfiles();
  const route = useRoute();
  const routeRef = useRef(route);
  const settings = profiles.find((p) => p.id === activeId)?.settings;
  const navOn = settings?.pianoNav !== false;
  const soundOn = settings?.sound !== false;
  const reduced = settings?.reduceMotion === true;

  useEffect(() => {
    routeRef.current = route;
  });

  useEffect(() => {
    setNavEnabled(navOn);
  }, [navOn]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'auto';
  }, [reduced]);

  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      delete root.dataset.nav;
    };
    window.addEventListener('pointerdown', clear, true);
    window.addEventListener('keydown', clear, true);
    const perform = (command: NonNullable<ReturnType<typeof commandForNote>>, action: NavAction) => {
      const scope = getNavScope();
      if (action.type === 'none') return;
      root.dataset.nav = 'piano';
      switch (action.type) {
        case 'focus':
          if (moveSelection(action.dir)) playSound('nav');
          break;
        case 'activate':
          if (activateSelection() === 'activated') playSound('select');
          else playSound('nav');
          break;
        case 'go':
          playSound(command === 'back' ? 'back' : 'select');
          window.location.hash = action.hash;
          break;
        case 'toggle-pause':
          playSound(scope.kind === 'play' && scope.status === 'paused' ? 'resume' : 'pause');
          togglePause();
          break;
      }
    };
    const holds = new Map<number, ReturnType<typeof setTimeout>>();
    const off = midi.subscribeNotes((e) => {
      if (!navEnabled()) return;
      const command = commandForNote(e.midi);
      if (!command) return;
      const scope = getNavScope();
      if (scope.kind === 'keycheck') {
        // The keyboard check: a plain tap only lights the key; holding a command key still works as the command.
        clearTimeout(holds.get(e.midi));
        holds.delete(e.midi);
        if (e.type === 'noteOn') {
          holds.set(
            e.midi,
            setTimeout(() => {
              holds.delete(e.midi);
              perform(command, resolveCommand(command, { kind: 'menu' }, routeRef.current));
            }, HOLD_MS),
          );
        }
        return;
      }
      if (e.type !== 'noteOn') return;
      perform(command, resolveCommand(command, scope, routeRef.current));
    });
    return () => {
      off();
      holds.forEach(clearTimeout);
      window.removeEventListener('pointerdown', clear, true);
      window.removeEventListener('keydown', clear, true);
    };
  }, []);

  return null;
}
