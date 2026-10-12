import { badgeById } from '../../progress/badges';
import { trackProgress, type ProgressChange } from '../../progress/store';
import { songLookups } from '../../songs/library';
import { getDb } from '../../storage/db';

/** What a Learn save earned: new badges and a level change. */
export type Earned = Pick<ProgressChange, 'newBadges' | 'levelFrom' | 'levelTo'>;

/** Run a Learn write (unit result or finished lesson) and report what it earned. */
export async function trackLearn(profileId: string, write: () => Promise<unknown>): Promise<Earned> {
  const { newBadges, levelFrom, levelTo } = await trackProgress(getDb(), profileId, songLookups, write);
  return { newBadges, levelFrom, levelTo };
}

/** Lines for the end card: a level up and each new badge. */
export function earnedLines(earned: Earned | undefined): string[] {
  if (!earned) return [];
  const lines: string[] = [];
  if (earned.levelTo > earned.levelFrom) lines.push(`Level up! You are level ${earned.levelTo}.`);
  for (const id of earned.newBadges) {
    const b = badgeById(id);
    if (b) lines.push(`New badge: ${b.name}. ${b.blurb}`);
  }
  return lines;
}
