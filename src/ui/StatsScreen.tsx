import { accuracyTrend, mostMissedNotes, points, stars } from '../engine/results';
import { getSong } from '../songs/catalog';
import { profileAttempts } from '../storage/attempts';
import { getDb } from '../storage/db';
import { bestPerSong, profileScores } from '../storage/scores';
import { AppLayout } from './AppLayout';
import { noteName } from './keyboardLayout';
import { useActiveProfile } from './profileStore';
import { useAsync } from './useAsync';
import { hrefFor } from './useRoute';

function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="muted small-text">Play a few songs to see your accuracy trend.</p>;
  const w = 320;
  const h = 90;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - v * h).toFixed(1)}`).join(' ');
  return (
    <svg className="trend" data-testid="trend" viewBox={`-6 -6 ${w + 12} ${h + 12}`} role="img" aria-label={`Accuracy over your last ${values.length} songs`}>
      <line x1="0" y1={h * 0.05} x2={w} y2={h * 0.05} stroke="var(--border)" />
      <line x1="0" y1={h} x2={w} y2={h} stroke="var(--border)" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - v * h} r="3.5" fill="var(--accent)" />
      ))}
    </svg>
  );
}

export function StatsScreen() {
  const profile = useActiveProfile();
  const data = useAsync(async () => {
    const db = getDb();
    const [attempts, scores] = await Promise.all([profileAttempts(db, profile.id), profileScores(db, profile.id)]);
    return { attempts, best: bestPerSong(scores) };
  }, profile.id);

  const attempts = data?.attempts ?? [];
  const songsPlayed = new Set(attempts.map((a) => a.songId)).size;
  const xp = attempts.reduce((n, a) => n + a.xp, 0);
  const avgAccuracy = attempts.length ? attempts.reduce((n, a) => n + a.accuracy, 0) / attempts.length : 0;
  const trend = accuracyTrend(attempts);
  const missed = mostMissedNotes(attempts.flatMap((a) => a.misses), 6);
  const bestRows = [...(data?.best.values() ?? [])].sort((a, b) => b.score - a.score);

  return (
    <AppLayout active="stats">
      <main className="main" data-testid="stats">
        <header className="header">
          <div className="stack-tight">
            <div className="eyebrow">{profile.name}</div>
            <h1 className="title">Stats</h1>
          </div>
        </header>
        <section className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-big" data-testid="stats-songs">
              {songsPlayed}
            </div>
            <div className="stat-cap">Songs played</div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-testid="stats-attempts">
              {attempts.length}
            </div>
            <div className="stat-cap">Runs finished</div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-tone="correct" data-testid="stats-accuracy">
              {Math.round(avgAccuracy * 100)}%
            </div>
            <div className="stat-cap">Average accuracy</div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-testid="stats-xp">
              {xp} XP
            </div>
            <div className="stat-cap">Total earned</div>
          </div>
        </section>
        <section className="result-cols two">
          <div className="panel">
            <h2>Best scores</h2>
            {bestRows.length === 0 && <p className="muted small-text">No scores yet. Finish a song to set one.</p>}
            <ol className="board" data-testid="stats-best">
              {bestRows.map((s) => (
                <li key={s.id} className="board-row" data-testid="stats-best-row" data-song={s.songId}>
                  <span className="board-who">
                    <strong>{getSong(s.songId)?.title ?? s.songId}</strong>
                    <small>{stars(s.stars)}</small>
                  </span>
                  <span className="board-score">{points(s.score)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel">
            <h2>Accuracy trend</h2>
            <Trend values={trend} />
            <h2>Most-missed notes</h2>
            <div className="chips" data-testid="stats-missed">
              {missed.length === 0 && <span className="muted small-text">None yet</span>}
              {missed.map((m) => (
                <div key={m.midi} className="miss-chip">
                  <div className="miss-note">{noteName(m.midi)}</div>
                  <div className="miss-count">{m.count}</div>
                </div>
              ))}
            </div>
            <a className="btn" href={hrefFor.songs()}>
              Pick a song
            </a>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
