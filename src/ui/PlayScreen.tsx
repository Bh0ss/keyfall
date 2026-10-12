import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { beatsToMs, msToBeats } from '../engine/clock';
import { setCurrentPlay } from '../engine/current';
import { labelVisible, type LabelMode } from '../engine/fade';
import type { Mode } from '../engine/judge';
import { deviceKey } from '../engine/latency';
import { barBeats, lastMeasure } from '../engine/loop';
import { clicksDue, isAccent, wantsClick } from '../engine/metronome';
import type { PlaySession } from '../engine/session';
import { TimedSession } from '../engine/timed';
import { WaitSession } from '../engine/wait';
import { midi } from '../midi/engine';
import { getSong } from '../songs/catalog';
import { saveRun, type SavedRun } from '../storage/attempts';
import { getDb } from '../storage/db';
import { getLatency } from '../storage/latency';
import { noteStreaks } from '../storage/noteStats';
import { scheduleClick } from './audio';
import { drawFrame, LOOKAHEAD_BEATS } from './highwayDraw';
import { buildLayout, keyRangeFor } from './highwayLayout';
import { noteName } from './keyboardLayout';
import { profiles, useActiveProfile } from './profileStore';
import { useMidi } from './useMidi';
import { hrefFor, type PlayPreset } from './useRoute';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'wait', label: 'Wait', hint: 'The song waits for you' },
  { id: 'practice', label: 'Practice', hint: '50 to 90% speed, wide timing' },
  { id: 'full', label: 'Full', hint: 'Full speed' },
  { id: 'expert', label: 'Expert', hint: 'Tight timing, no labels' },
];
const SPEEDS = [50, 60, 70, 80, 90];
const GRADE_TEXT = { perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss' } as const;
const CLICK_AHEAD_MS = 120;

interface Setup {
  mode: Mode;
  speedPct: number;
  metronome: boolean;
  countIn: boolean;
  loop: boolean;
  from: number;
  to: number;
}

const HANDS = { right: 'Right hand', left: 'Left hand', both: 'Both hands' } as const;

function Stat({ value, label, tone, testId }: { value: string; label: string; tone?: 'accent' | 'correct'; testId: string }) {
  return (
    <div className="stat">
      <div className="stat-value" data-tone={tone} data-testid={testId}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function PlayScreen({ songId, preset }: { songId: string; preset: PlayPreset }) {
  const song = getSong(songId);
  const [attempt, setAttempt] = useState(0);
  if (!song) {
    return (
      <div className="shell">
        <main className="main">
          <section className="card" data-tone="warn" role="alert">
            <h2>Song not found</h2>
            <p>That song is not in the library.</p>
            <div className="row">
              <a className="btn" data-primary href={hrefFor.songs()}>
                Back to songs
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }
  return <PlayLoader key={`${song.id}:${attempt}`} songId={song.id} preset={preset} onRetry={() => setAttempt((a) => a + 1)} />;
}

/** Loads what the song needs from storage (latency offset, label-fade streaks) before it opens. */
function PlayLoader({ songId, preset, onRetry }: { songId: string; preset: PlayPreset; onRetry: () => void }) {
  const profile = useActiveProfile();
  const device = deviceKey(useMidi().devices.name);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [streaks, setStreaks] = useState<Map<number, number> | null>(null);

  useEffect(() => {
    let live = true;
    void getLatency(getDb(), device).then((v) => live && setLatencyMs(v));
    return () => {
      live = false;
    };
  }, [device]);

  useEffect(() => {
    let live = true;
    void noteStreaks(getDb(), profile.id).then((v) => live && setStreaks(v));
    return () => {
      live = false;
    };
  }, [profile.id]);

  if (latencyMs === null || streaks === null) return <div className="play" data-testid="play-loading" />;
  return <PlayInner songId={songId} preset={preset} latencyMs={latencyMs} streaks={streaks} onRetry={onRetry} />;
}

function PlayInner({
  songId,
  preset,
  latencyMs,
  streaks,
  onRetry,
}: {
  songId: string;
  preset: PlayPreset;
  latencyMs: number;
  streaks: ReadonlyMap<number, number>;
  onRetry: () => void;
}) {
  const song = getSong(songId)!;
  const profile = useActiveProfile();
  const lastBar = lastMeasure(song);
  const [setup, setSetup] = useState<Setup>(() => {
    const clamp = (n: number) => Math.min(Math.max(1, n), lastBar);
    const from = clamp(preset.from ?? 1);
    const mode = preset.mode ?? profile.settings.mode;
    const speed = preset.speedPct ?? profile.settings.speedPct;
    return {
      mode,
      speedPct: SPEEDS.includes(speed) ? speed : 70,
      metronome: profile.settings.metronome,
      countIn: profile.settings.countIn,
      loop: preset.from !== undefined,
      from,
      to: Math.max(from, clamp(preset.to ?? Math.min(from + 1, lastBar))),
    };
  });
  const bar = barBeats(song);
  const session: PlaySession = useMemo(() => {
    const common = {
      hands: 'both' as const,
      leadInBeats: Math.max(LOOKAHEAD_BEATS, bar),
      loop: setup.loop ? { fromMeasure: setup.from, toMeasure: setup.to } : undefined,
    };
    if (setup.mode === 'wait') return new WaitSession(song, common);
    return new TimedSession(song, { ...common, mode: setup.mode, speed: setup.speedPct / 100, latencyMs });
  }, [song, setup, bar, latencyMs]);
  const layout = useMemo(() => buildLayout(keyRangeFor(song.notes.map((n) => n.midi))), [song]);
  const [labelMode, setLabelMode] = useState<LabelMode>(setup.mode === 'expert' ? 'off' : profile.settings.labels);
  const labelsRef = useRef({ mode: labelMode, streaks });
  const saveRef = useRef<Promise<SavedRun> | null>(null);
  const [saved, setSaved] = useState<SavedRun | null>(null);
  const rulesRef = useRef({ metronome: false, countIn: true, barBeats: bar, playStartBeat: 0 });
  const lastClickRef = useRef(-Infinity);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useSyncExternalStore(session.subscribe.bind(session), () => session.version);
  const wait = session instanceof WaitSession ? session : null;
  const timed = session instanceof TimedSession ? session : null;
  const stats = wait?.stats();
  const sum = timed?.summary();
  const status = session.status;

  const update = (patch: Partial<Setup>) => {
    setSetup((cur) => {
      const next = { ...cur, ...patch };
      next.from = Math.min(Math.max(1, next.from), lastBar);
      next.to = Math.min(Math.max(next.from, next.to), lastBar);
      return next;
    });
    if (patch.mode) setLabelMode(patch.mode === 'expert' ? 'off' : profile.settings.labels);
    const { mode, speedPct, metronome, countIn } = patch;
    const remember = { mode, speedPct, metronome, countIn };
    if (Object.values(remember).some((v) => v !== undefined)) {
      void profiles.saveSettings(profile.id, Object.fromEntries(Object.entries(remember).filter(([, v]) => v !== undefined)));
    }
  };

  const cycleLabels = () => {
    const next: LabelMode = labelMode === 'on' ? 'fade' : labelMode === 'fade' ? 'off' : 'on';
    setLabelMode(next);
    void profiles.saveSettings(profile.id, { labels: next });
  };

  useEffect(() => {
    labelsRef.current = { mode: labelMode, streaks };
  }, [labelMode, streaks]);

  // Save the finished run (attempt, high score, per-note stats) exactly once.
  useEffect(() => {
    if (session.status !== 'finished' || saveRef.current) return;
    saveRef.current = saveRun(getDb(), {
      profileId: profile.id,
      song,
      mode: setup.mode,
      speedPct: setup.speedPct,
      loop: setup.loop ? { from: setup.from, to: setup.to } : null,
      summary: session.summary(),
      wait: session instanceof WaitSession ? { wrong: session.stats().wrong, avgTimeToPressMs: session.stats().avgTimeToPressMs } : null,
    });
    void saveRef.current.then(setSaved, () => undefined);
  }, [status, session, profile.id, song, setup]);

  const retry = () => {
    void (saveRef.current ?? Promise.resolve()).then(onRetry, onRetry);
  };

  useEffect(() => {
    rulesRef.current = { metronome: setup.metronome, countIn: setup.countIn, barBeats: bar, playStartBeat: session.playStartBeat };
  }, [setup.metronome, setup.countIn, bar, session]);

  // Let debug tooling (autoplay) drive this song.
  useEffect(() => {
    setCurrentPlay({
      song,
      session,
      ensureStarted: () => {
        if (session.status === 'ready') session.start(performance.now());
      },
    });
    return () => setCurrentPlay(null);
  }, [song, session]);

  // Keys feed the session through the same pipeline as real MIDI.
  useEffect(
    () =>
      midi.subscribeNotes((e) => {
        if (e.type !== 'noteOn') return;
        const now = performance.now();
        if (session.status === 'ready') session.start(now);
        else session.noteOn(e.midi, now);
      }),
    [session],
  );

  // Animation loop: advance the session and paint the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const frame = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      session.update(now);
      const beat = session.beatAt(now);
      if (session.status === 'playing') {
        const ahead = msToBeats(CLICK_AHEAD_MS, song.bpm) * session.speed;
        const due = clicksDue(beat, lastClickRef.current, ahead);
        lastClickRef.current = due.last;
        for (const b of due.beats) {
          if (wantsClick(b, rulesRef.current)) scheduleClick(beatsToMs(b - beat, song.bpm) / session.speed / 1000, isAccent(b, bar));
        }
      } else {
        // Skip the beat the playhead is sitting on so a pause does not replay it.
        lastClickRef.current = session.status === 'ready' ? Math.ceil(beat - 1e-9) - 1 : Math.floor(beat + 1e-9);
      }
      const { mode: labelsMode, streaks: hits } = labelsRef.current;
      drawFrame(ctx, w, h, {
        layout,
        session,
        beat,
        pressed: midi.getSnapshot().pressed,
        labels: labelsMode !== 'off',
        noteLabel: (m) => labelVisible(labelsMode, hits.get(m) ?? 0),
        now,
      });
      if (progressRef.current) {
        const frac = Math.min(1, Math.max(0, beat / session.endBeat));
        progressRef.current.style.width = `${(frac * 100).toFixed(1)}%`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, layout, song, bar]);

  const togglePause = () => {
    const now = performance.now();
    if (session.status === 'paused') session.resume(now);
    else session.pause(now);
  };

  const needed = (wait?.waitingFor() ?? []).map(noteName).join(' ');
  const statusText =
    status === 'waiting' ? `Waiting for ${needed}` : status === 'paused' ? 'Paused' : status === 'finished' ? 'Complete' : status === 'ready' ? 'Ready' : 'Playing';

  return (
    <div className="play" data-testid="play-screen">
      <header className="play-head">
        <div className="play-head-left">
          <a className="icon-btn" href={hrefFor.songs()} aria-label="Back to songs">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </a>
          <div>
            <div className="play-title">{song.title}</div>
            <div className="play-sub">
              {MODES.find((m) => m.id === setup.mode)!.label}
              {timed && timed.speed < 1 ? ` ${Math.round(timed.speed * 100)}%` : ''} · {HANDS[song.hands]} ·{' '}
              <span data-testid="play-status" data-status={status}>
                {statusText}
              </span>
            </div>
          </div>
        </div>
        <div className="play-stats">
          {stats && (
            <>
              <Stat value={`${stats.correct}/${stats.total}`} label="Correct" tone="correct" testId="stat-correct" />
              <Stat value={String(stats.wrong)} label="Wrong keys" testId="stat-wrong" />
              <Stat value={`${(stats.avgTimeToPressMs / 1000).toFixed(1)}s`} label="Avg press time" tone="accent" testId="stat-time" />
            </>
          )}
          {sum && (
            <>
              <Stat value={String(sum.score)} label="Score" tone="accent" testId="stat-score" />
              <Stat value={`${sum.streak} · x${sum.multiplier}`} label="Streak" tone="correct" testId="stat-streak" />
              <Stat value={`${Math.round(sum.accuracy * 100)}%`} label="Accuracy" testId="stat-accuracy" />
            </>
          )}
        </div>
        <div className="play-head-right">
          <button className="btn small" type="button" aria-pressed={labelMode !== 'off'} data-testid="toggle-labels" onClick={cycleLabels}>
            Note names: {labelMode === 'on' ? 'On' : labelMode === 'fade' ? 'Fade' : 'Off'}
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label={status === 'paused' ? 'Resume' : 'Pause'}
            disabled={status === 'ready' || status === 'finished'}
            onClick={togglePause}
          >
            {status === 'paused' ? (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4l13 8-13 8z" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            )}
          </button>
        </div>
      </header>
      <div className="play-progress">
        <div ref={progressRef} className="play-progress-bar" />
      </div>
      <div className="play-stage">
        <canvas ref={canvasRef} className="play-canvas" data-testid="highway" aria-label="Falling notes and keyboard" />
        {timed && status === 'playing' && timed.last.seq > 0 && (
          <div key={timed.last.seq} className="grade-pop" data-testid="play-grade" data-grade={timed.last.label}>
            {GRADE_TEXT[timed.last.label]}
          </div>
        )}
        {status === 'ready' && (
          <div className="play-overlay" data-testid="play-ready">
            <SetupPanel setup={setup} lastBar={lastBar} latencyMs={latencyMs} onChange={update} />
            <button className="btn" data-primary type="button" data-testid="play-start" onClick={() => session.start(performance.now())}>
              Start
            </button>
            <p>{setup.mode === 'wait' ? 'Or press any key. The song waits for you at every note.' : 'Or press any key to begin. Notes are judged on timing.'}</p>
          </div>
        )}
        {status === 'paused' && (
          <div className="play-overlay">
            <button className="btn" data-primary type="button" onClick={togglePause}>
              Resume
            </button>
          </div>
        )}
        {status === 'finished' && (
          <div className="play-overlay" data-testid="play-finished" role="status">
            <h2>Song complete</h2>
            {stats && (
              <p>
                {stats.correct} of {stats.total} notes · {(stats.avgTimeToPressMs / 1000).toFixed(1)}s average wait · {stats.wrong} wrong keys
              </p>
            )}
            {sum && (
              <div className="summary" data-testid="summary">
                <div className="summary-stars" data-testid="summary-stars" data-stars={sum.stars} aria-label={`${sum.stars} of 3 stars`}>
                  {[1, 2, 3].map((n) => (
                    <span key={n} data-on={n <= sum.stars}>
                      ★
                    </span>
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>Score</dt>
                    <dd data-testid="summary-score">{sum.score}</dd>
                  </div>
                  <div>
                    <dt>Accuracy</dt>
                    <dd data-testid="summary-accuracy">{(sum.accuracy * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Notes hit</dt>
                    <dd data-testid="summary-hits">
                      {sum.hits} of {sum.total}
                    </dd>
                  </div>
                  <div>
                    <dt>Longest streak</dt>
                    <dd data-testid="summary-streak">{sum.longestStreak}</dd>
                  </div>
                </dl>
                <p className="summary-grades" data-testid="summary-grades">
                  Perfect {sum.grades.perfect} · Great {sum.grades.great} · Good {sum.grades.good} · Missed {sum.misses.length}
                </p>
              </div>
            )}
            <div className="row">
              {saved ? (
                <a className="btn" data-primary href={hrefFor.results(saved.attempt.id)} data-testid="see-results">
                  See results
                </a>
              ) : (
                <span className="btn" aria-disabled="true" data-testid="saving-results">
                  Saving...
                </span>
              )}
              <button className="btn" type="button" onClick={retry}>
                Retry
              </button>
              <a className="btn" href={hrefFor.songs()}>
                Songs
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SetupPanel({
  setup,
  lastBar,
  latencyMs,
  onChange,
}: {
  setup: Setup;
  lastBar: number;
  latencyMs: number;
  onChange: (patch: Partial<Setup>) => void;
}) {
  const bars = Array.from({ length: lastBar }, (_, i) => i + 1);
  return (
    <div className="setup" data-testid="setup">
      <div className="seg" role="group" aria-label="Difficulty">
        {MODES.map((m) => (
          <button key={m.id} type="button" data-testid={`mode-${m.id}`} aria-pressed={setup.mode === m.id} title={m.hint} onClick={() => onChange({ mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      {setup.mode === 'practice' && (
        <div className="seg" role="group" aria-label="Speed">
          {SPEEDS.map((v) => (
            <button key={v} type="button" data-testid={`speed-${v}`} aria-pressed={setup.speedPct === v} onClick={() => onChange({ speedPct: v })}>
              {v}%
            </button>
          ))}
        </div>
      )}
      <div className="row setup-row">
        <button className="btn small" type="button" data-testid="toggle-metronome" aria-pressed={setup.metronome} onClick={() => onChange({ metronome: !setup.metronome })}>
          Metronome: {setup.metronome ? 'On' : 'Off'}
        </button>
        <button className="btn small" type="button" data-testid="toggle-countin" aria-pressed={setup.countIn} onClick={() => onChange({ countIn: !setup.countIn })}>
          Count-in: {setup.countIn ? 'On' : 'Off'}
        </button>
      </div>
      <div className="row setup-row">
        <button className="btn small" type="button" data-testid="toggle-loop" aria-pressed={setup.loop} onClick={() => onChange({ loop: !setup.loop })}>
          A-B loop: {setup.loop ? 'On' : 'Off'}
        </button>
        {setup.loop && (
          <>
            <label className="field">
              From bar
              <select data-testid="loop-from" value={setup.from} onChange={(e) => onChange({ from: Number(e.target.value) })}>
                {bars.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              To bar
              <select data-testid="loop-to" value={setup.to} onChange={(e) => onChange({ to: Number(e.target.value) })}>
                {bars.filter((b) => b >= setup.from).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <p className="setup-note" data-testid="setup-latency">
        {setup.mode === 'wait' ? 'No timing grade in Wait mode.' : `Latency offset: ${latencyMs > 0 ? '+' : ''}${latencyMs} ms`}{' '}
        <a href={hrefFor.settings()}>Latency check</a>
      </p>
    </div>
  );
}
