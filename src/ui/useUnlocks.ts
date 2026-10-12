import { isSongUnlocked } from '../learn/unlocks';
import { getDb } from '../storage/db';
import { passedUnits } from '../storage/learn';
import { useActiveProfile } from './profileStore';
import { useAsync } from './useAsync';

export interface Unlocks {
  /** Unit ids the active profile has passed. */
  passed: ReadonlySet<string>;
  isUnlocked(song: { unlockedBy?: string }): boolean;
}

/** Which songs the active profile may play. Undefined while the progress loads. */
export function useUnlocks(): Unlocks | undefined {
  const profile = useActiveProfile();
  const passed = useAsync(() => passedUnits(getDb(), profile.id), profile.id);
  if (!passed) return undefined;
  return { passed, isUnlocked: (song) => isSongUnlocked(song, passed, profile.level) };
}
