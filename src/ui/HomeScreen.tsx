import { nextUnit } from '../learn/unlocks';
import { BADGES } from '../progress/badges';
import { upNext, points, stars } from '../engine/results';
import { featuredSongs } from '../songs/featured';
import { useLibrary } from '../songs/library';
import { getDb } from '../storage/db';
import { profileAttempts } from '../storage/attempts';
import { bestPerSong, profileScores } from '../storage/scores';
import { AccountChip } from './AccountPanel';
import { AppLayout } from './AppLayout';
import { ConnectionChip } from './ConnectionChip';
import { HelpBubble } from './HelpBubble';
import { FirstRunLegend } from './PianoLegend';
import { Avatar } from './ProfilePicker';
import { TipsTour } from './TipsTour';
import { LevelBar, StreakChip, useProgress } from './ProgressWidgets';
import { profiles, useActiveProfile } from './profileStore';
import { useAsync } from './useAsync';
import { useMidi } from './useMidi';
import { useUnlocks } from './useUnlocks';
import { hrefFor } from './useRoute';

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;
const MODE_LABEL = { wait: 'Wait', practice: 'Practice', full: 'Full', expert: 'Expert' } as const;

function greeting(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen() {
  const profile = useActiveProfile();
  const snapshot = useMidi();
  const songs = useLibrary().songs;
  const data = useAsync(async () => {
    const db = getDb();
    const [scores, attempts] = await Promise.all([profileScores(db, profile.id), profileAttempts(db, profile.id)]);
    return { best: bestPerSong(scores), lastSongId: attempts[attempts.length - 1]?.songId };
  }, profile.id);

  const progress = useProgress();
  const unlocks = useUnlocks();
  const open = unlocks ? songs.filter((s) => unlocks.isUnlocked(s)) : songs.filter((s) => !s.unlockedBy);
  const learnNext = unlocks ? nextUnit(unlocks.passed) : null;
  const best = data?.best;
  const bestStars = new Map([...(best ?? [])].map(([id, s]) => [id, s.stars]));
  const nextId = upNext(open.map((s) => s.id), bestStars, data?.lastSongId);
  const next = open.find((s) => s.id === nextId) ?? open[0]!;
  const nextBest = best?.get(next.id);
  const totalStars = [...bestStars.values()].reduce((a, b) => a + b, 0);
  const { mode, speedPct } = profile.settings;
  const featured = featuredSongs(open, bestStars, data?.lastSongId, next.id);
  const playLabel = mode === 'practice' ? `Practice ${speedPct}%` : MODE_LABEL[mode];

  return (
    <AppLayout active="home">
      <main className="main home" data-testid="home">
        <header className="header">
          <div className="stack-tight">
            <div className="eyebrow">{greeting(new Date().getHours())}</div>
            <h1 className="title" data-testid="home-title">
              Ready to play, {profile.name}?
            </h1>
          </div>
          <div className="row">
            <ConnectionChip snapshot={snapshot} helpHref="#setup" />
            <AccountChip />
            <button className="avatar-btn" type="button" aria-label="Switch profile" data-testid="switch-profile" onClick={() => profiles.switchProfile()}>
              <Avatar profile={profile} />
            </button>
          </div>
        </header>

        <TipsTour />
        <FirstRunLegend />

        {progress && (
          <section className="progress-strip" aria-label="Your progress" data-testid="progress-strip">
            <LevelBar progress={progress} />
            <div className="progress-side">
              <StreakChip streak={progress.streak} />
              <a className="pill pill-link" href={hrefFor.stats()} data-testid="badge-count">
                {progress.badges.length} of {BADGES.length} badges
              </a>
            </div>
          </section>
        )}

        <section className="home-grid">
          <div className="tile">
            <div className="label">Up next · Play</div>
            <div className="tile-title" data-testid="up-next-title">
              {next.title}
            </div>
            <div className="pills">
              <span className="pill">{next.composer}</span>
              <span className="pill">
                Level {next.level} · {HANDS[next.hands]}
              </span>
              <span className="pill" data-testid="up-next-best">
                {nextBest ? `Best: ${stars(nextBest.stars)} · ${points(nextBest.score)}` : 'Not played yet'}
              </span>
            </div>
            <div className="row tile-actions">
              <a className="btn big" data-primary href={hrefFor.play(next.id)} data-testid="play-next">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
                Play · {playLabel}
              </a>
              <a className="btn" href={hrefFor.play(next.id)}>
                Change difficulty
              </a>
            </div>
          </div>
          <div className="tile" data-tone="learn" data-testid="learn-tile">
            <div className="label label-learn">Continue · Learn</div>
            {learnNext ? (
              <>
                <div className="tile-title" data-testid="learn-tile-title">
                  Unit {learnNext.number} · {learnNext.name}
                </div>
                <p className="tile-text">{learnNext.blurb}</p>
                <a className="btn big btn-learn" href={hrefFor.learn(learnNext.id)} data-testid="learn-continue">
                  Continue
                </a>
              </>
            ) : (
              <>
                <div className="tile-title" data-testid="learn-tile-title">
                  {unlocks ? 'All units done' : 'Learn'}
                </div>
                <p className="tile-text">{unlocks ? 'Replay any unit from the Learn path.' : 'Loading your progress.'}</p>
                <a className="btn big btn-learn" href={hrefFor.learn()}>
                  Learn path
                </a>
              </>
            )}
          </div>
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>Up next</h2>
            <div className="muted small-text" data-testid="songs-summary">
              {open.length} of {songs.length} unlocked · {totalStars} {totalStars === 1 ? 'star' : 'stars'} earned
            </div>
          </div>
          <ul className="song-tiles" aria-label="Up next" data-testid="featured-songs">
            {featured.map((s) => {
              const b = best?.get(s.id);
              return (
                <li key={s.id}>
                  <a className="song-tile" href={hrefFor.play(s.id)} data-testid={`home-song-${s.id}`}>
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        Level {s.level} · {s.hands === 'both' ? 'Both' : s.hands === 'right' ? 'Right' : 'Left'}
                      </small>
                    </span>
                    <span className="song-stars" data-testid={`home-stars-${s.id}`}>
                      {b ? stars(b.stars) : '☆☆☆'}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="row all-songs">
            <a className="btn" href={hrefFor.songs()} data-testid="all-songs">
              All songs ({songs.length})
            </a>
            <HelpBubble id="home.allSongs" />
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
