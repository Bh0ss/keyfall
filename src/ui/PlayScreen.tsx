import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { setCurrentPlay } from '../engine/current';
import { WaitSession } from '../engine/wait';
import { midi } from '../midi/engine';
import { getSong } from '../songs/catalog';
import { drawFrame, LOOKAHEAD_BEATS } from './highwayDraw';
import { buildLayout, keyRangeFor } from './highwayLayout';
import { noteName } from './keyboardLayout';
import { hrefFor } from './useRoute';

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

export function PlayScreen({ songId }: { songId: string }) {
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
  return <PlayInner key={`${song.id}:${attempt}`} songId={song.id} onRetry={() => setAttempt((a) => a + 1)} />;
}

function PlayInner({ songId, onRetry }: { songId: string; onRetry: () => void }) {
  const song = getSong(songId)!;
  const session = useMemo(() => new WaitSession(song, { hands: 'both', leadInBeats: LOOKAHEAD_BEATS }), [song]);
  const layout = useMemo(() => buildLayout(keyRangeFor(song.notes.map((n) => n.midi))), [song]);
  const [labels, setLabels] = useState(true);
  const labelsRef = useRef(labels);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useSyncExternalStore(session.subscribe.bind(session), () => session.version);
  const stats = session.stats();
  const status = session.status;

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

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
      drawFrame(ctx, w, h, { layout, session, beat, pressed: midi.getSnapshot().pressed, labels: labelsRef.current, now });
      if (progressRef.current) {
        const frac = Math.min(1, Math.max(0, beat / session.endBeat));
        progressRef.current.style.width = `${(frac * 100).toFixed(1)}%`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [session, layout]);

  const togglePause = () => {
    const now = performance.now();
    if (session.status === 'paused') session.resume(now);
    else session.pause(now);
  };

  const needed = session.waitingFor().map(noteName).join(' ');
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
              Wait · {HANDS[song.hands]} ·{' '}
              <span data-testid="play-status" data-status={status}>
                {statusText}
              </span>
            </div>
          </div>
        </div>
        <div className="play-stats">
          <Stat value={`${stats.correct}/${stats.total}`} label="Correct" tone="correct" testId="stat-correct" />
          <Stat value={String(stats.wrong)} label="Wrong keys" testId="stat-wrong" />
          <Stat value={`${(stats.avgTimeToPressMs / 1000).toFixed(1)}s`} label="Avg press time" tone="accent" testId="stat-time" />
        </div>
        <div className="play-head-right">
          <button className="btn small" type="button" aria-pressed={labels} onClick={() => setLabels((l) => !l)}>
            Note names: {labels ? 'On' : 'Off'}
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
        {status === 'ready' && (
          <div className="play-overlay" data-testid="play-ready">
            <button className="btn" data-primary type="button" data-testid="play-start" onClick={() => session.start(performance.now())}>
              Start
            </button>
            <p>Or press any key. The song waits for you at every note.</p>
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
            <p>
              {stats.correct} of {stats.total} notes · {(stats.avgTimeToPressMs / 1000).toFixed(1)}s average wait · {stats.wrong} wrong keys
            </p>
            <div className="row">
              <button className="btn" data-primary type="button" onClick={onRetry}>
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
