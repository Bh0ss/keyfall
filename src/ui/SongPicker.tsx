import { unlockHint } from '../learn/unlocks';
import { useLibrary } from '../songs/library';
import {
  HANDS_FILTERS,
  SONG_SORTS,
  lastPlayedBySong,
  parseHandsFilter,
  parseSort,
  viewSongs,
  type HandsFilter,
  type SongSort,
} from '../songs/listView';
import { getDb } from '../storage/db';
import { profileAttempts } from '../storage/attempts';
import { profileScores } from '../storage/scores';
import { AppLayout } from './AppLayout';
import { profiles, useActiveProfile } from './profileStore';
import { useAsync } from './useAsync';
import { useUnlocks } from './useUnlocks';
import { hrefFor } from './useRoute';

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

const SORT_LABELS: Record<SongSort, string> = { difficulty: 'Difficulty', title: 'A-Z', recent: 'Recent' };
const HANDS_LABELS: Record<HandsFilter, string> = { all: 'All', right: 'Right', left: 'Left', both: 'Both' };

export function SongPicker() {
  const library = useLibrary().songs;
  const unlocks = useUnlocks();
  const profile = useActiveProfile();
  const sort = parseSort(profile.settings.songSort);
  const hands = parseHandsFilter(profile.settings.songHands);
  const lastPlayed = useAsync(async () => {
    const db = getDb();
    const [attempts, scores] = await Promise.all([profileAttempts(db, profile.id), profileScores(db, profile.id)]);
    return lastPlayedBySong(attempts, scores);
  }, profile.id);
  const songs = viewSongs(library, { sort, hands }, lastPlayed ?? new Map());
  const choose = (patch: { songSort?: SongSort; songHands?: HandsFilter }) => void profiles.saveSettings(profile.id, patch);
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
        <section className="song-controls" aria-label="Sort and filter" data-testid="song-controls">
          <div className="song-control">
            <span className="label" id="song-sort-label">Sort by</span>
            <div className="seg" role="group" aria-labelledby="song-sort-label">
              {SONG_SORTS.map((v) => (
                <button key={v} type="button" data-testid={`sort-${v}`} aria-pressed={sort === v} onClick={() => choose({ songSort: v })}>
                  {SORT_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="song-control">
            <span className="label" id="song-hands-label">Hands</span>
            <div className="seg" role="group" aria-labelledby="song-hands-label">
              {HANDS_FILTERS.map((v) => (
                <button key={v} type="button" data-testid={`hands-${v}`} aria-pressed={hands === v} onClick={() => choose({ songHands: v })}>
                  {HANDS_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          <p className="label" role="status" data-testid="song-count">
            {songs.length === 0 ? 'No songs match this filter.' : `${songs.length} of ${library.length} songs`}
          </p>
        </section>
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
