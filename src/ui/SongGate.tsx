import type { ReactNode } from 'react';
import { unlockHint } from '../learn/unlocks';
import { findPlayableSong } from '../songs/library';
import { AppLayout } from './AppLayout';
import { hrefFor } from './useRoute';
import { useUnlocks } from './useUnlocks';

/** Shows the song only if this profile has unlocked it; a locked song's link lands on a short explanation. */
export function SongGate({ songId, children }: { songId: string; children: ReactNode }) {
  const song = findPlayableSong(songId);
  const unlocks = useUnlocks();
  if (!song || song.unlockedBy === undefined) return <>{children}</>;
  if (!unlocks) return <div className="shell" data-testid="song-gate-loading" />;
  if (unlocks.isUnlocked(song)) return <>{children}</>;
  return (
    <AppLayout active="play">
      <main className="main">
        <section className="card" data-tone="warn" role="alert" data-testid="song-locked">
          <h2>{song.title} is locked</h2>
          <p>{unlockHint(song)}.</p>
          <div className="row">
            <a className="btn" data-primary href={hrefFor.learn(song.unlockedBy === 'advanced' ? undefined : song.unlockedBy)}>
              Go to Learn
            </a>
            <a className="btn" href={hrefFor.songs()}>
              Back to songs
            </a>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
