import type { ReactNode } from 'react';
import { BADGES, badgeById, type BadgeDef } from '../progress/badges';
import type { ProfileProgress } from '../progress/compute';
import type { StreakInfo } from '../progress/streak';
import { songLookups } from '../songs/library';
import { loadProgress } from '../progress/store';
import { getDb } from '../storage/db';
import { useActiveProfile } from './profileStore';
import { useAsync } from './useAsync';

/** The active profile's XP, level, streak and badges, read from its history. Undefined while loading. */
export function useProgress(): ProfileProgress | undefined {
  const profile = useActiveProfile();
  return useAsync(() => loadProgress(getDb(), profile.id, songLookups), profile.id);
}

const GLYPHS: Record<BadgeDef['group'], ReactNode> = {
  play: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" />,
  learn: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5" />
    </>
  ),
  streak: <path d="M12 3c1 3.5-2 5-2 8a3 3 0 0 0 6 0c0-1-.4-1.8-1-2.6 2.6 1.4 4 3.8 4 6.6A7 7 0 0 1 5 15c0-4 3.5-5.5 4-9 1 1 2 1.5 3-3z" />,
  level: <path d="M6 15l6-6 6 6M6 20l6-6 6 6" />,
};

/** A round badge. Earned ones glow amber; locked ones are outlined and dim. */
export function Medal({ badge, earned, size = 56 }: { badge: BadgeDef; earned: boolean; size?: number }) {
  return (
    <span className="medal" data-earned={earned} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill={badge.group === 'play' || badge.group === 'streak' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[badge.group]}
      </svg>
    </span>
  );
}

/** Level, title and an XP bar toward the next level. */
export function LevelBar({ progress, testId = 'level-bar' }: { progress: ProfileProgress; testId?: string }) {
  const l = progress.level;
  return (
    <div className="level-bar" data-testid={testId}>
      <div className="level-head">
        <span className="level-num" data-testid={`${testId}-level`}>
          Level {l.level}
        </span>
        <span className="level-title">{l.title}</span>
      </div>
      <div
        className="xp-track"
        role="progressbar"
        aria-label={`Experience toward level ${l.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={l.nextLevelXp - l.levelStartXp}
        aria-valuenow={l.xpIntoLevel}
      >
        <div className="xp-fill" style={{ width: `${Math.round(l.fraction * 100)}%` }} />
      </div>
      <div className="level-foot" data-testid={`${testId}-xp`}>
        {progress.totalXp} XP · {l.xpToNext} to level {l.level + 1}
      </div>
    </div>
  );
}

export function streakText(streak: StreakInfo): string {
  if (streak.current === 0) return 'No streak yet';
  return `${streak.current}-day streak`;
}

/** The daily streak. Amber when played today, muted when it is alive but still needs today. */
export function StreakChip({ streak }: { streak: StreakInfo }) {
  const tone = streak.current === 0 ? 'idle' : streak.activeToday ? 'ok' : 'warn';
  return (
    <span className="chip streak-chip" data-tone={tone} data-testid="streak-chip" data-days={streak.current}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        {GLYPHS.streak}
      </svg>
      {streakText(streak)}
      {streak.atRisk && <span className="streak-note"> · play today to keep it</span>}
    </span>
  );
}

/** Every badge, earned or not, with how to earn it. */
export function BadgeShelf({ earned }: { earned: readonly string[] }) {
  const have = new Set(earned);
  return (
    <ul className="badge-shelf" aria-label="Badges" data-testid="badge-shelf">
      {BADGES.map((b) => (
        <li key={b.id} className="badge" data-earned={have.has(b.id)} data-testid={`badge-${b.id}`}>
          <Medal badge={b} earned={have.has(b.id)} />
          <span className="badge-text">
            <strong>{b.name}</strong>
            <small>{b.blurb}</small>
            <span className="badge-state">{have.has(b.id) ? 'Earned' : 'Locked'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What a finished song earned: a level up and new badges. Renders nothing when there is nothing to celebrate. */
export function EarnedCard({ levelFrom, levelTo, newBadges }: { levelFrom?: number; levelTo?: number; newBadges?: string[] }) {
  const up = levelFrom !== undefined && levelTo !== undefined && levelTo > levelFrom;
  const badges = (newBadges ?? []).map(badgeById).filter((b): b is BadgeDef => !!b);
  if (!up && badges.length === 0) return null;
  return (
    <div className="earned-card" data-testid="earned-card" role="status">
      {up && (
        <div className="earned-row" data-testid="level-up">
          <span className="level-badge">{levelTo}</span>
          <span>
            <strong>Level up!</strong>
            <small>You reached level {levelTo}.</small>
          </span>
        </div>
      )}
      {badges.map((b) => (
        <div key={b.id} className="earned-row" data-testid={`earned-${b.id}`}>
          <Medal badge={b} earned size={44} />
          <span>
            <strong>New badge: {b.name}</strong>
            <small>{b.blurb}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
