import { getSongs } from '../songs/catalog';
import { hrefFor } from './useRoute';

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

export function SongPicker() {
  const songs = getSongs();
  return (
    <div className="shell">
      <main className="main">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">Keyfall</div>
            <h1 className="title">Pick a song</h1>
          </div>
          <div className="row">
            <a className="btn" href={hrefFor.settings()}>
              Settings
            </a>
            <a className="btn" href={hrefFor.connect()}>
              Keyboard check
            </a>
          </div>
        </header>
        <ul className="song-list" aria-label="Songs">
          {songs.map((s) => (
            <li key={s.id} className="card song-card" data-testid={`song-${s.id}`}>
              <div>
                <div className="label">Level {s.level}</div>
                <h2>{s.title}</h2>
                <p>
                  {s.composer} · {HANDS[s.hands]} · {s.notes.length} notes
                </p>
              </div>
              <a className="btn" data-primary href={hrefFor.play(s.id)}>
                Play
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
