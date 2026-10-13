import type { ProfileSettings } from '../storage/types';
import { TOUR_STEPS } from './content';

/** The one-time tips tour is due until the profile has seen it (or skipped it). The flag is a profile setting, so it syncs. */
export const tourDue = (settings: Pick<ProfileSettings, 'tipsSeen'>): boolean => settings.tipsSeen !== true;

/** Setting patches: finishing or skipping the tour, and asking for it again from Settings. */
export const SEEN_TOUR = { tipsSeen: true } as const;
export const REPLAY_TOUR = { tipsSeen: false } as const;

export function clampStep(step: number): number {
  return Math.min(Math.max(0, step), TOUR_STEPS.length - 1);
}
