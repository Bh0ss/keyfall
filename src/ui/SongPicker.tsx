import { unlockHint } from '../learn/unlocks';
import { getSongs } from '../songs/catalog';
import { AppLayout } from './AppLayout';
import { useUnlocks } from './useUnlocks';
import { hrefFor } from './useRoute';

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

export function SongPicker() {
  const songs = getSongs();
  const unlocks = useUnlocks();
  return (
    <AppLayout active="play">
      <main className="main">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">Pick a song</h1>
          </div>
          <div className="row">
            <a className="btn" href={hrefFor.keyboard()}>
              Keyboard check
            </a>
          </div>
        </header>
        <ul className="song-list" aria-label="Songs">
          {songs.map((s) => {
            const locked = !!unlocks && !unlocks.isUnlocked(s);
            return (
            <li key={s.id} className="card song-card" data-testid={`song-${s.id}`} data-locked={locked ? 'true' : undefined}>
              <div>
                <div className="label">Level {s.level}</div>
                <h2>{s.title}</h2>
                <p>
                  {s.composer} · {HANDS[s.hands]} · {s.notes.length} notes
                </p>
              </div>
              {locked ? (
                <a className="btn" href={hrefFor.learn(s.unlockedBy)} data-testid={`song-locked-${s.id}`}>
                  {unlockHint(s)}
                </a>
              ) : (
                <a className="btn" data-primary href={hrefFor.play(s.id)}>
                  Play
                </a>
              )}
            </li>
            );
          })}
        </ul>
      </main>
    </AppLayout>
  );
}
