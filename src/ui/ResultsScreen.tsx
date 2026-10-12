import { lastMeasure } from '../engine/loop';
import {
  averageOffset,
  measureMisses,
  mostMissedNotes,
  offsetHistogram,
  points,
  practiceRange,
  pressOffsets,
  rankBoard,
  missSummary,
  stars,
  timingNote,
} from '../engine/results';
import { findSong } from '../songs/library';
import { getAttempt } from '../storage/attempts';
import { getDb } from '../storage/db';
import { songScores } from '../storage/scores';
import type { AttemptRecord } from '../storage/types';
import { AppLayout } from './AppLayout';
import { noteName } from './keyboardLayout';
import { useProfiles } from './profileStore';
import { useAsync } from './useAsync';
import { hrefFor } from './useRoute';

const MODE_LABEL = { wait: 'Wait', practice: 'Practice', full: 'Full', expert: 'Expert' } as const;

function modeText(a: Pick<AttemptRecord, 'mode' | 'speedPct'>): string {
  return a.mode === 'practice' ? `Practice ${a.speedPct}%` : MODE_LABEL[a.mode];
}

const GRADE_ROWS = [
  { key: 'perfect', name: 'Perfect', colour: 'var(--accent)' },
  { key: 'great', name: 'Great', colour: 'var(--correct)' },
  { key: 'good', name: 'Good', colour: 'var(--right-hand)' },
] as const;

function Bar({ name, n, total, colour, testId }: { name: string; n: number; total: number; colour: string; testId: string }) {
  return (
    <div className="bar-row">
      <div className="bar-name">{name}</div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: colour }} />
      </div>
      <div className="bar-n" data-testid={testId}>
        {n}
      </div>
    </div>
  );
}

function Histogram({ offsets }: { offsets: number[] }) {
  const bins = offsetHistogram(offsets);
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className="histo" data-testid="histogram" role="img" aria-label="How early or late your notes landed, in 25 millisecond steps">
      <div className="histo-bars">
        {bins.map((b) => (
          <div key={b.from} className="histo-col" title={`${b.from} to ${b.to} ms: ${b.count}`} data-count={b.count}>
            <div className="histo-bar" style={{ height: `${(b.count / max) * 100}%`, background: b.from === -25 || b.from === 0 ? 'var(--accent)' : 'var(--right-hand)' }} />
          </div>
        ))}
      </div>
      <div className="histo-axis">
        <span>150 ms early</span>
        <span>on time</span>
        <span>150 ms late</span>
      </div>
    </div>
  );
}

export function ResultsScreen({ attemptId }: { attemptId: string }) {
  const { profiles } = useProfiles();
  const data = useAsync(async () => {
    const db = getDb();
    const attempt = await getAttempt(db, attemptId);
    if (!attempt) return null;
    return { attempt, board: await songScores(db, attempt.songId) };
  }, attemptId);

  if (data === undefined) {
    return (
      <AppLayout active="play">
        <main className="main" data-testid="results-loading" />
      </AppLayout>
    );
  }
  const song = data ? findSong(data.attempt.songId) : undefined;
  if (!data || !song) {
    return (
      <AppLayout active="play">
        <main className="main">
          <section className="card" data-tone="warn" role="alert" data-testid="results-missing">
            <h2>Result not found</h2>
            <p>This result is not saved on this device.</p>
            <div className="row">
              <a className="btn" data-primary href={hrefFor.home()}>
                Back to Home
              </a>
            </div>
          </section>
        </main>
      </AppLayout>
    );
  }

  const { attempt: a, board } = data;
  const owner = profiles.find((p) => p.id === a.profileId);
  const lastBar = lastMeasure(song);
  const isWait = a.mode === 'wait';
  const offsets = pressOffsets(a.hitOffsets, a.misses);
  const avg = averageOffset(offsets);
  const mistakes = mostMissedNotes(a.misses, 5);
  const perBar = measureMisses(a.misses, lastBar);
  const range = practiceRange(a.misses, lastBar);
  const personalBest = !a.loop && board.some((s) => s.attemptId === a.id);
  const ranked = rankBoard(board, 8);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? 'Player';
  const practiceSpeed = owner?.settings.speedPct ?? 70;
  const hot = Math.max(1, ...perBar);

  return (
    <AppLayout active="play">
      <main className="main results" data-testid="results">
        <header className="header">
          <div className="stack-tight">
            <div className="eyebrow">
              {owner?.name ?? 'Player'} · {modeText(a)}
              {a.loop ? ` · bars ${a.loop.from} to ${a.loop.to}` : ''}
            </div>
            <h1 className="title" data-testid="results-title">
              {song.title}
            </h1>
          </div>
          <div className="result-stars" data-testid="results-stars" data-stars={a.stars} role="img" aria-label={`${a.stars} of 3 stars`}>
            {stars(a.stars)}
          </div>
        </header>

        <section className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-big" data-testid="results-score">
              {points(a.score)}
            </div>
            <div className="stat-cap">Score{personalBest ? ' · new personal best' : ''}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-tone="correct" data-testid="results-accuracy">
              {Math.round(a.accuracy * 100)}%
            </div>
            <div className="stat-cap" data-testid="results-notes">
              Accuracy · {a.hits} of {a.total} notes
            </div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-tone="accent" data-testid="results-streak">
              {a.longestStreak}
            </div>
            <div className="stat-cap">Longest streak</div>
          </div>
          <div className="stat-tile">
            <div className="stat-big" data-testid="results-xp">
              +{a.xp} XP
            </div>
            <div className="stat-cap">Levels come in a later update</div>
          </div>
        </section>

        <section className="result-cols">
          <div className="panel" data-testid="timing-card">
            <h2>Timing</h2>
            {isWait ? (
              <>
                <Bar name="First try" n={a.hits} total={a.total} colour="var(--correct)" testId="bar-first-try" />
                <Bar name="Retried" n={a.total - a.hits} total={a.total} colour="var(--miss)" testId="bar-retried" />
                <div className="callout" data-testid="timing-note">
                  Wait mode has no timing grade.
                  {a.wait ? ` ${a.wait.wrong} wrong ${a.wait.wrong === 1 ? 'key' : 'keys'}, ${(a.wait.avgTimeToPressMs / 1000).toFixed(1)} s average to press.` : ''}
                </div>
              </>
            ) : (
              <>
                {GRADE_ROWS.map((g) => (
                  <Bar key={g.key} name={g.name} n={a.grades[g.key]} total={a.total} colour={g.colour} testId={`bar-${g.key}`} />
                ))}
                <Bar name="Miss" n={Math.max(0, a.total - a.hits)} total={a.total} colour="var(--miss)" testId="bar-miss" />
                <Histogram offsets={offsets} />
                <div className="callout" data-testid="timing-note">
                  {timingNote(avg)}
                </div>
                <div className="muted small-text" data-testid="avg-offset" data-value={avg === null ? '' : Math.round(avg)}>
                  {avg === null ? 'Average offset: none' : `Average offset: ${avg > 0 ? '+' : ''}${Math.round(avg)} ms`}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <h2>Where it went wrong</h2>
            <div className="muted small-text">Most-missed notes</div>
            <div className="chips" data-testid="missed-notes">
              {mistakes.length === 0 && <span className="muted small-text">None</span>}
              {mistakes.map((m) => (
                <div key={m.midi} className="miss-chip" data-midi={m.midi}>
                  <div className="miss-note">{noteName(m.midi)}</div>
                  <div className="miss-count">
                    {m.count} {m.count === 1 ? 'miss' : 'misses'}
                  </div>
                </div>
              ))}
            </div>
            <div className="muted small-text">Bars to practice</div>
            <div className="bars" data-testid="bars">
              {perBar.map((n, i) => (
                <div
                  key={i}
                  className="bar-cell"
                  data-bar={i + 1}
                  data-misses={n}
                  style={n ? { background: `color-mix(in srgb, var(--miss) ${30 + (n / hot) * 40}%, #232833)`, color: '#FFD3CC' } : undefined}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="summary-line" data-testid="miss-summary">
              {missSummary(a.misses, lastBar)}
            </div>
            {range ? (
              <a
                className="btn big"
                data-primary
                data-testid="practice-mistakes"
                data-from={range.from}
                data-to={range.to}
                href={hrefFor.play(song.id, { mode: 'practice', from: range.from, to: range.to, speedPct: practiceSpeed })}
              >
                Practice my mistakes
              </a>
            ) : (
              <span className="btn big" aria-disabled="true" data-testid="practice-mistakes-off">
                Nothing to practise
              </span>
            )}
          </div>

          <div className="panel">
            <h2>High scores · {song.title}</h2>
            <ol className="board" data-testid="board">
              {ranked.length === 0 && <li className="muted small-text">No scores yet.</li>}
              {ranked.map((s) => (
                <li key={s.id} className="board-row" data-testid="board-row" data-profile={nameOf(s.profileId)} data-score={s.score} data-me={s.attemptId === a.id}>
                  <span className="board-rank">{s.rank}</span>
                  <span className="board-who">
                    <strong>{nameOf(s.profileId)}</strong>
                    <small>
                      {modeText(s)} · {stars(s.stars)}
                    </small>
                  </span>
                  <span className="board-score">{points(s.score)}</span>
                </li>
              ))}
            </ol>
            <div className="row panel-foot">
              <a
                className="btn big grow"
                data-testid="results-retry"
                href={hrefFor.play(song.id, { mode: a.mode, speedPct: a.mode === 'practice' ? a.speedPct : undefined, from: a.loop?.from, to: a.loop?.to })}
              >
                Retry
              </a>
              <a className="btn big grow" data-testid="results-songs" href={hrefFor.songs()}>
                Songs
              </a>
            </div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
