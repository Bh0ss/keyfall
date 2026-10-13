import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { beatsToMs, msToBeats } from '../engine/clock';
import { setCurrentPlay } from '../engine/current';
import { labelVisible, type LabelMode } from '../engine/fade';
import type { Mode } from '../engine/judge';
import { deviceKey } from '../engine/latency';
import { barBeats, lastMeasure, type LoopSpan } from '../engine/loop';
import { autoFingersFor } from '../engine/fingering';
import { activeShift, analysePositions, drillRange, zonesAt, type Shift, type Zone } from '../engine/positions';
import { clicksDue, isAccent, wantsClick } from '../engine/metronome';
import type { PlaySession } from '../engine/session';
import { TimedSession } from '../engine/timed';
import { WaitSession } from '../engine/wait';
import type { Song } from '../engine/song';
import { midi } from '../midi/engine';
import { songUsesCommandNotes } from '../nav/commands';
import { isNavSwallowed, useNavScope, usePauseHandler } from '../nav/store';
import { clearPreviewSong, findPlayableSong, hasApproximateSheet, loadPlayableSong, songLookups } from '../songs/library';
import { clearDraft } from '../audioImport/draft';
import type { PlayView } from '../storage/types';
import { saveRun, type SavedRun } from '../storage/attempts';
import { getDb } from '../storage/db';
import { getLatency } from '../storage/latency';
import { noteStreaks } from '../storage/noteStats';
import { scheduleClick } from './audio';
import { EarnedCard } from './ProgressWidgets';
import { HelpBubble } from './HelpBubble';
import { playSound, playStarSequence } from './sounds';
import { drawFrame, type HelpState } from './highwayDraw';
import { buildLayout, keyRangeFor, PHONE_MIN_WHITES } from './highwayLayout';
import { noteName } from './keyboardLayout';
import { createPlaySession, feedNote } from './playSession';
import { profiles, useActiveProfile } from './profileStore';
import { useMidi } from './useMidi';
import { useViewportMode } from './useViewportMode';
import { hrefFor, type PlayPreset } from './useRoute';

// OpenSheetMusicDisplay is large: load it only when a sheet view is opened.
const SheetView = lazy(() => import('./SheetView'));

const VIEWS: { id: PlayView; label: string }[] = [
  { id: 'falling', label: 'Falling' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'split', label: 'Split' },
];

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
  /** Index of the hand-position shift being drilled, or null for the normal run. */
  drill: number | null;
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
  const song = findPlayableSong(songId);
  const [attempt, setAttempt] = useState(0);
  const portraitPhone = useViewportMode() === 'phone-portrait';
  if (!song) {
    return (
      <div className="shell">
        <main className="main">
          <section className="card" data-tone="warn" role="alert">
            <h2>{preset.preview ? 'Preview not found' : 'Song not found'}</h2>
            <p>{preset.preview ? 'The preview is gone. Reloading the page clears it, along with your choices. Choose the recording again to start over.' : 'That song is not in the library.'}</p>
            <div className="row">
              <a className="btn" data-primary href={preset.preview ? hrefFor.addAudio() : hrefFor.songs()}>
                {preset.preview ? 'Back to Add song' : 'Back to songs'}
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }
  return (
    <>
      {portraitPhone && <RotatePrompt preview={preset.preview === true} />}
      <PlayLoader key={`${song.id}:${attempt}`} songId={song.id} preset={preset} onRetry={() => setAttempt((a) => a + 1)} />
    </>
  );
}

/** Portrait on a phone: the highway needs the width, so ask for the phone to be turned. */
function RotatePrompt({ preview }: { preview: boolean }) {
  return (
    <div className="rotate-prompt" data-testid="rotate-prompt" role="alert" data-nav-modal>
      <svg aria-hidden="true" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="16" rx="2" />
        <path d="M4 14a8 8 0 0 0 8 8M12 22l-3-2M12 22l-1.5-3" />
      </svg>
      <h2>Turn your phone sideways</h2>
      <p>Keyfall plays in landscape. Rest the phone on the music stand and the keys line up with the piano.</p>
      <a className="btn" href={preview ? hrefFor.addAudio() : hrefFor.songs()}>
        {preview ? 'Back to review' : 'Back to songs'}
      </a>
    </div>
  );
}

/** Loads what the song needs from storage (latency offset, label-fade streaks) before it opens. */
function PlayLoader({ songId, preset, onRetry }: { songId: string; preset: PlayPreset; onRetry: () => void }) {
  const profile = useActiveProfile();
  const device = deviceKey(useMidi().devices.name);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [streaks, setStreaks] = useState<Map<number, number> | null>(null);
  const [song, setSong] = useState<Song | null | undefined>(undefined);

  // A bundled song's MusicXML is a separate chunk, fetched here when the song opens.
  useEffect(() => {
    let live = true;
    loadPlayableSong(songId).then(
      (v) => live && setSong(v ?? null),
      () => live && setSong(null),
    );
    return () => {
      live = false;
    };
  }, [songId]);

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

  if (song === null) {
    return (
      <div className="shell">
        <main className="main">
          <section className="card" data-tone="warn" role="alert" data-testid="song-load-error">
            <h2>This song did not load</h2>
            <p>Keyfall could not fetch the music for this song. Check your connection and try again.</p>
            <div className="row">
              {/* A browser remembers a failed module download until the page reloads, so retrying means reloading. */}
              <button className="btn" data-primary type="button" onClick={() => window.location.reload()}>
                Try again
              </button>
              <a className="btn" href={preset.preview ? hrefFor.addAudio() : hrefFor.songs()}>
                {preset.preview ? 'Back to review' : 'Back to songs'}
              </a>
            </div>
          </section>
        </main>
      </div>
    );
  }
  if (song === undefined || latencyMs === null || streaks === null) return <div className="play" data-testid="play-loading" />;
  return <PlayInner song={song} preset={preset} latencyMs={latencyMs} streaks={streaks} onRetry={onRetry} />;
}

function PlayInner({
  song,
  preset,
  latencyMs,
  streaks,
  onRetry,
}: {
  song: Song;
  preset: PlayPreset;
  latencyMs: number;
  streaks: ReadonlyMap<number, number>;
  onRetry: () => void;
}) {
  const profile = useActiveProfile();
  const keyboard = useMidi().devices;
  // The Add song review's preview: Wait mode only, and nothing it does is written anywhere (see the guards below).
  const preview = preset.preview === true;
  const [previewFlags, setPreviewFlags] = useState<{ positionLabels?: boolean; autoFingering?: boolean }>({});
  const lastBar = lastMeasure(song);
  const [setup, setSetup] = useState<Setup>(() => {
    const clamp = (n: number) => Math.min(Math.max(1, n), lastBar);
    const from = clamp(preset.from ?? 1);
    const mode = preview ? 'wait' : (preset.mode ?? profile.settings.mode);
    const speed = preset.speedPct ?? profile.settings.speedPct;
    return {
      mode,
      speedPct: SPEEDS.includes(speed) ? speed : 70,
      metronome: profile.settings.metronome,
      countIn: profile.settings.countIn,
      loop: preset.from !== undefined,
      from,
      to: Math.max(from, clamp(preset.to ?? Math.min(from + 1, lastBar))),
      drill: null,
    };
  });
  const bar = barBeats(song);
  // Fingers the song does not carry are worked out once per song (and only when asked for); the position help reads them too.
  const lacksFingers = useMemo(() => song.notes.some((n) => n.finger === undefined), [song]);
  const autoOn = (previewFlags.autoFingering ?? profile.settings.autoFingering) !== false && lacksFingers;
  const auto = useMemo(() => (autoOn ? autoFingersFor(song.notes) : null), [autoOn, song]);
  const positions = useMemo(() => analysePositions(song.notes, auto ? (n) => n.finger ?? auto.get(n.id) : undefined), [song, auto]);
  const helpOn = profile.settings.handHelp !== false && positions.shifts.length > 0;
  const posLabels = (previewFlags.positionLabels ?? profile.settings.positionLabels) === true && positions.hasFingering;
  const drillShift = helpOn && setup.drill !== null ? positions.shifts[setup.drill] : undefined;
  const drillSpan = useMemo(() => (drillShift ? drillRange(drillShift, song.notes) : undefined), [drillShift, song]);
  // The shift drill replaces the A-B loop; as bars it is the span of the notes it loops.
  const loopBars = useMemo(
    () =>
      drillSpan
        ? { from: Math.floor(drillSpan.startBeat / bar + 1e-9) + 1, to: Math.max(1, Math.ceil(drillSpan.endBeat / bar - 1e-9)) }
        : setup.loop
          ? { from: setup.from, to: setup.to }
          : null,
    [drillSpan, setup.loop, setup.from, setup.to, bar],
  );
  const session: PlaySession = useMemo(() => {
    const loop: LoopSpan | undefined = drillSpan ?? (setup.loop ? { fromMeasure: setup.from, toMeasure: setup.to } : undefined);
    return createPlaySession(song, setup, { latencyMs, loop });
  }, [song, setup, latencyMs, drillSpan]);
  const viewport = useViewportMode();
  const phone = viewport === 'phone-landscape' || viewport === 'phone-portrait';
  const tablet = viewport === 'tablet-portrait';
  const layout = useMemo(() => buildLayout(keyRangeFor(song.notes.map((n) => n.midi), phone ? PHONE_MIN_WHITES : undefined)), [song, phone]);
  const [chosenView, setView] = useState<PlayView>(profile.settings.view ?? 'falling');
  // The phone screen is too short for a score beside the notes: it always shows the falling view.
  const view: PlayView = phone ? 'falling' : chosenView;
  // Settings changed in a preview last for the preview only; saving them would write the profile (and sync it).
  const remember = (patch: Parameters<typeof profiles.saveSettings>[1]) => {
    if (!preview) void profiles.saveSettings(profile.id, patch);
  };
  const chooseView = (v: PlayView) => {
    setView(v);
    remember({ view: v });
  };
  const [labelMode, setLabelMode] = useState<LabelMode>(setup.mode === 'expert' ? 'off' : profile.settings.labels);
  const labelsRef = useRef({ mode: labelMode, streaks });
  const saveRef = useRef<Promise<SavedRun> | null>(null);
  const [saved, setSaved] = useState<SavedRun | null>(null);
  const rulesRef = useRef({ metronome: false, countIn: true, barBeats: bar, playStartBeat: 0 });
  const lastClickRef = useRef(-Infinity);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cue, setCue] = useState<Shift | null>(null);
  const cueRef = useRef<Shift | null>(null);
  const zoneSigRef = useRef('');
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
    const changed = { mode, speedPct, metronome, countIn };
    if (Object.values(changed).some((v) => v !== undefined)) {
      remember(Object.fromEntries(Object.entries(changed).filter(([, v]) => v !== undefined)));
    }
  };

  const cycleLabels = () => {
    const next: LabelMode = labelMode === 'on' ? 'fade' : labelMode === 'fade' ? 'off' : 'on';
    setLabelMode(next);
    remember({ labels: next });
  };

  useEffect(() => {
    labelsRef.current = { mode: labelMode, streaks };
  }, [labelMode, streaks]);

  // Save the finished run (attempt, high score, per-note stats) exactly once.
  useEffect(() => {
    if (preview || session.status !== 'finished' || saveRef.current) return;
    saveRef.current = saveRun(getDb(), {
      profileId: profile.id,
      song,
      mode: setup.mode,
      speedPct: setup.speedPct,
      loop: loopBars,
      summary: session.summary(),
      wait: session instanceof WaitSession ? { wrong: session.stats().wrong, avgTimeToPressMs: session.stats().avgTimeToPressMs } : null,
    }, songLookups);
    void saveRef.current.then(setSaved, () => undefined);
  }, [status, session, profile.id, song, setup, loopBars, preview]);

  // The end card's sounds: a cadence, a chime per star, then a sparkle if the run earned a level or a badge.
  const doneStars = session.status === 'finished' ? session.summary().stars : -1;
  useEffect(() => {
    if (doneStars < 0) return;
    playSound('complete');
    const t = setTimeout(() => playStarSequence(doneStars), 700);
    return () => clearTimeout(t);
  }, [doneStars]);
  useEffect(() => {
    if (!saved || (saved.levelTo <= saved.levelFrom && saved.newBadges.length === 0)) return;
    const t = setTimeout(() => playSound(saved.levelTo > saved.levelFrom ? 'levelup' : 'badge'), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  const retry = () => {
    void (saveRef.current ?? Promise.resolve()).then(onRetry, onRetry);
  };

  // Leaving the preview drops the transient song; the draft survives only on the way back to the review.
  // Leaving the preview drops the transient song; the draft survives only on the way back to the review.
  // Still on the preview URL means React's dev-only unmount and remount, not leaving.
  useEffect(
    () => () => {
      if (!preview) return;
      const to = window.location.hash;
      if (to.startsWith('#/play/') && to.includes('preview=1')) return;
      clearPreviewSong();
      if (!to.startsWith('#/add/audio')) clearDraft();
    },
    [preview],
  );

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
        if (e.type !== 'noteOn' || isNavSwallowed(e.midi)) return;
        feedNote(session, e, performance.now());
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
      let help: HelpState | undefined;
      if (helpOn) {
        const zones = zonesAt(positions, beat, bar);
        const open = session.status !== 'ready' && session.status !== 'finished';
        const next = open
          ? activeShift(
              positions.shifts,
              beat,
              bar,
              (sh) =>
                session.isHit(sh.note.id) ||
                (session.kind === 'timed' && (session.isMissed(sh.note.id) || beat > sh.beat + 0.5)),
              { from: session.playStartBeat, to: session.endBeat },
            )
          : null;
        if (next !== cueRef.current) {
          cueRef.current = next;
          setCue(next);
        }
        help = { zones, cue: next };
        // The shaded zones as attributes too, for tests and assistive tooling.
        const span = (z: Zone | null) => (z ? `${z.lo}-${z.hi}` : '');
        const sig = [zones.right.current, zones.right.next, zones.left.current, zones.left.next].map(span).join('|');
        if (sig !== zoneSigRef.current) {
          zoneSigRef.current = sig;
          const set = (name: string, z: Zone | null) => (z ? canvas.setAttribute(name, span(z)) : canvas.removeAttribute(name));
          set('data-zone-right', zones.right.current);
          set('data-zone-next-right', zones.right.next);
          set('data-zone-left', zones.left.current);
          set('data-zone-next-left', zones.left.next);
        }
      }
      const info = drawFrame(ctx, w, h, {
        layout,
        session,
        beat,
        pressed: midi.getSnapshot().pressed,
        labels: labelsMode !== 'off',
        noteLabel: (m) => labelVisible(labelsMode, hits.get(m) ?? 0),
        now,
        help,
        positionOf: posLabels ? (id) => positions.anchorOf.get(id) : undefined,
        autoFinger: auto ? (id) => auto.get(id) : undefined,
      });
      // How many notes were drawn with an auto finger, for tests and assistive tooling.
      const drawn = String(info.autoFingers);
      if (canvas.getAttribute('data-auto-fingers') !== drawn) canvas.setAttribute('data-auto-fingers', drawn);
      if (progressRef.current) {
        const frac = Math.min(1, Math.max(0, beat / session.endBeat));
        progressRef.current.style.width = `${(frac * 100).toFixed(1)}%`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cueRef.current = null;
      zoneSigRef.current = '';
      setCue(null);
      for (const a of ['data-zone-right', 'data-zone-next-right', 'data-zone-left', 'data-zone-next-left']) canvas.removeAttribute(a);
    };
  }, [session, layout, song, bar, helpOn, positions, posLabels, auto]);

  // Turning the phone upright mid-song pauses it instead of letting the notes run under the prompt.
  useEffect(() => {
    if (viewport === 'phone-portrait' && session.status === 'playing') session.pause(performance.now());
  }, [viewport, session, status]);

  const togglePause = () => {
    const now = performance.now();
    if (session.status === 'paused') session.resume(now);
    else session.pause(now);
  };
  // Piano keys: while the song runs C1 pauses and resumes and the other command keys do nothing. A song that
  // itself uses a command note turns them off, so that note is played like any other.
  useNavScope({ kind: 'play', blocked: songUsesCommandNotes(song.notes), status });
  usePauseHandler(togglePause);

  const needed = (wait?.waitingFor() ?? []).map(noteName).join(' ');
  const statusText =
    status === 'waiting' ? `Waiting for ${needed}` : status === 'paused' ? 'Paused' : status === 'finished' ? 'Complete' : status === 'ready' ? 'Ready' : 'Playing';

  return (
    <div className="play" data-testid="play-screen" data-phone={phone} data-tablet={tablet}>
      <header className="play-head">
        <div className="play-head-left">
          <a className="icon-btn" href={preview ? hrefFor.addAudio() : hrefFor.songs()} aria-label={preview ? 'Back to review' : 'Back to songs'}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </a>
          <div>
            <div className="play-title">{song.title}</div>
            <div className="play-sub">
              {preview ? 'Preview · ' : ''}
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
          <div className="seg" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" data-testid={`view-${v.id}`} aria-pressed={view === v.id} onClick={() => chooseView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
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
      <div className="play-stage" data-view={view}>
        {view !== 'falling' && song.musicXml && (
          <div className="sheet-pane">
            <Suspense fallback={<div className="sheet-note">Loading the score...</div>}>
              <SheetView song={song} session={session} compact={view === 'split'} approximate={hasApproximateSheet(song.id)} autoFingers={auto} />
            </Suspense>
          </div>
        )}
        <canvas ref={canvasRef} className="play-canvas" data-testid="highway" aria-label="Falling notes and keyboard" />
        {helpOn && cue && (
          <div
            className="shift-cue"
            data-testid="shift-cue"
            data-hand={cue.hand}
            data-direction={cue.direction}
            data-shift={cue.id}
            data-measure={cue.measure}
            role="status"
          >
            <span className="shift-cue-arrow" aria-hidden="true">
              {cue.direction === 'right' ? '▶' : '◀'}
            </span>
            <strong>Shift {cue.direction}</strong>
            <span data-testid="shift-cue-label">{cue.label}</span>
            <span className="shift-cue-where">
              bar {cue.measure}
              {song.hands === 'both' ? ` · ${cue.hand} hand` : ''}
            </span>
          </div>
        )}
        {timed && status === 'playing' && timed.last.seq > 0 && (
          <div key={timed.last.seq} className="grade-pop" data-testid="play-grade" data-grade={timed.last.label}>
            {GRADE_TEXT[timed.last.label]}
          </div>
        )}
        {status === 'ready' && (
          <div className="play-overlay" data-testid="play-ready" data-nav-modal>
            <SetupPanel
              setup={setup}
              lastBar={lastBar}
              latencyMs={latencyMs}
              onChange={update}
              shifts={helpOn ? positions.shifts : []}
              fingered={positions.hasFingering}
              posLabels={posLabels}
              onPosLabels={() => (preview ? setPreviewFlags((f) => ({ ...f, positionLabels: !posLabels })) : void profiles.saveSettings(profile.id, { positionLabels: !posLabels }))}
              autoFingers={lacksFingers ? autoOn : null}
              onAutoFingers={() => (preview ? setPreviewFlags((f) => ({ ...f, autoFingering: !autoOn })) : void profiles.saveSettings(profile.id, { autoFingering: !autoOn }))}
              waitOnly={preview}
            />
            <button className="btn" data-primary type="button" data-testid="play-start" onClick={() => session.start(performance.now())}>
              Start
            </button>
            <p>{setup.mode === 'wait' ? 'Or press any key. The song waits for you at every note.' : 'Or press any key to begin. Notes are judged on timing.'}</p>
            {!keyboard.connected && (
              <p className="play-nokb" data-testid="play-no-keyboard" role="status">
                No keyboard found yet. Connect your piano over Bluetooth to play. <a href={hrefFor.keyboard()}>Setup help</a>
              </p>
            )}
          </div>
        )}
        {status === 'paused' && (
          <div className="play-overlay" data-nav-modal>
            <button className="btn" data-primary type="button" onClick={togglePause}>
              Resume
            </button>
          </div>
        )}
        {status === 'finished' && (
          <div className="play-overlay" data-testid="play-finished" role="status" data-nav-modal>
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
            {saved && <EarnedCard levelFrom={saved.levelFrom} levelTo={saved.levelTo} newBadges={saved.newBadges} />}
            {preview && (
              <p className="muted" data-testid="preview-note">
                This was a preview. Nothing was saved: no score, no results.
              </p>
            )}
            <div className="row">
              {preview ? (
                <>
                  <a className="btn" data-primary href={hrefFor.addAudio()} data-testid="preview-back">
                    Back to review
                  </a>
                  <button className="btn" type="button" onClick={onRetry} data-testid="preview-again">
                    Play again
                  </button>
                </>
              ) : saved ? (
                <a className="btn" data-primary href={hrefFor.results(saved.attempt.id)} data-testid="see-results">
                  See results
                </a>
              ) : (
                <span className="btn" aria-disabled="true" data-testid="saving-results">
                  Saving...
                </span>
              )}
              {!preview && (
                <>
                  <button className="btn" type="button" onClick={retry}>
                    Retry
                  </button>
                  <a className="btn" href={hrefFor.songs()}>
                    Songs
                  </a>
                </>
              )}
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
  shifts,
  fingered,
  posLabels,
  onPosLabels,
  autoFingers,
  onAutoFingers,
  waitOnly,
}: {
  setup: Setup;
  lastBar: number;
  latencyMs: number;
  onChange: (patch: Partial<Setup>) => void;
  /** The song's hand-position shifts; empty when the help is off or there are none. */
  shifts: Shift[];
  fingered: boolean;
  posLabels: boolean;
  onPosLabels: () => void;
  /** Whether auto finger numbers are on; null when the song carries a finger on every note. */
  autoFingers: boolean | null;
  onAutoFingers: () => void;
  /** The Add song preview: Wait mode is the only mode. */
  waitOnly: boolean;
}) {
  const drilling = setup.drill !== null && setup.drill < shifts.length ? shifts[setup.drill]! : null;
  const step = (by: number) => onChange({ drill: ((setup.drill ?? 0) + by + shifts.length) % shifts.length });
  const bars = Array.from({ length: lastBar }, (_, i) => i + 1);
  return (
    <div className="setup" data-testid="setup">
      <div className="help-row">
        <div className="seg" role="group" aria-label="Difficulty">
          {MODES.filter((m) => !waitOnly || m.id === 'wait').map((m) => (
            <button key={m.id} type="button" data-testid={`mode-${m.id}`} aria-pressed={setup.mode === m.id} title={m.hint} onClick={() => onChange({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <HelpBubble id="play.mode" />
      </div>
      {setup.mode === 'practice' && (
        <div className="help-row">
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((v) => (
              <button key={v} type="button" data-testid={`speed-${v}`} aria-pressed={setup.speedPct === v} onClick={() => onChange({ speedPct: v })}>
                {v}%
              </button>
            ))}
          </div>
          <HelpBubble id="play.speed" />
        </div>
      )}
      <div className="row setup-row">
        <button className="btn small" type="button" data-testid="toggle-metronome" aria-pressed={setup.metronome} onClick={() => onChange({ metronome: !setup.metronome })}>
          Metronome: {setup.metronome ? 'On' : 'Off'}
        </button>
        <HelpBubble id="play.metronome" />
        <button className="btn small" type="button" data-testid="toggle-countin" aria-pressed={setup.countIn} onClick={() => onChange({ countIn: !setup.countIn })}>
          Count-in: {setup.countIn ? 'On' : 'Off'}
        </button>
        <HelpBubble id="play.countIn" />
      </div>
      {shifts.length > 0 && (
        <div className="row setup-row" data-testid="drill-row">
          <button
            className="btn small"
            type="button"
            data-testid="toggle-drill"
            aria-pressed={drilling !== null}
            onClick={() => onChange({ drill: drilling ? null : 0 })}
          >
            Shift drill: {drilling ? 'On' : 'Off'}
          </button>
          <HelpBubble id="play.drill" />
          <HelpBubble id="play.shiftMarker" />
          {drilling && (
            <>
              <button className="btn small" type="button" data-testid="drill-prev" onClick={() => step(-1)}>
                Previous shift
              </button>
              <button className="btn small" type="button" data-testid="drill-next" onClick={() => step(1)}>
                Next shift
              </button>
              <HelpBubble id="play.drillStep" />
              <span className="drill-info" data-testid="drill-info">
                Shift {drilling.index + 1} of {shifts.length} · bar {drilling.measure} · {drilling.label}
              </span>
            </>
          )}
        </div>
      )}
      {autoFingers !== null && (
        <div className="row setup-row">
          <button className="btn small" type="button" data-testid="toggle-autofingers" aria-pressed={autoFingers} onClick={onAutoFingers}>
            Auto fingers: {autoFingers ? 'On' : 'Off'}
          </button>
          <HelpBubble id="play.autoFingers" />
        </div>
      )}
      {fingered && (
        <div className="row setup-row">
          <button className="btn small" type="button" data-testid="toggle-posnames" aria-pressed={posLabels} onClick={onPosLabels}>
            Position names: {posLabels ? 'On' : 'Off'}
          </button>
          <HelpBubble id="play.positionNames" />
        </div>
      )}
      <div className="row setup-row">
        <button
          className="btn small"
          type="button"
          data-testid="toggle-loop"
          aria-pressed={setup.loop && !drilling}
          disabled={drilling !== null}
          onClick={() => onChange({ loop: !setup.loop })}
        >
          A-B loop: {setup.loop && !drilling ? 'On' : 'Off'}
        </button>
        <HelpBubble id="play.loop" />
        {setup.loop && !drilling && (
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
            <HelpBubble id="play.loopBars" />
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
