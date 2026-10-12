import { unlockHint } from '../learn/unlocks';
import { useLibrary } from '../songs/library';
import { AppLayout } from './AppLayout';
import { useUnlocks } from './useUnlocks';
import { hrefFor } from './useRoute';

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

export function SongPicker() {
  const songs = useLibrary().songs;
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
            <a className="btn" data-primary href={hrefFor.import()} data-testid="import-link">
              Import a song
            </a>
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
                <div className="label">
                  Level {s.level}
                  {s.source === 'imported' && <span className="tag" data-testid={`song-imported-${s.id}`}> · Imported</span>}
                </div>
                <h2>{s.title}</h2>
                <p>
                  {s.composer} · {HANDS[s.hands]} · {s.noteCount} notes
                </p>
              </div>
              {locked ? (
                <a className="btn" href={hrefFor.learn(s.unlockedBy)} data-testid={`song-locked-${s.id}`}>
                  {unlockHint(s)}
                </a>
              ) : (
                <div className="row">
                  {s.source === 'imported' && (
                    <a className="btn" href={hrefFor.import(s.id)} data-testid={`song-edit-${s.id}`}>
                      Edit
                    </a>
                  )}
                  <a className="btn" data-primary href={hrefFor.play(s.id)}>
                    Play
                  </a>
                </div>
              )}
            </li>
            );
          })}
        </ul>
      </main>
    </AppLayout>
  );
}
