import { useEffect, useRef, useState } from 'react';
import { judgeTaps, tapTimes } from '../../learn/rhythm';
import { virtualInputEnabled } from '../../midi/virtual';
import { getDb } from '../../storage/db';
import { markLessonDone } from '../../storage/learn';
import { noteName } from '../keyboardLayout';
import { outputLatencyMs, scheduleClick } from '../audio';
import { Finish } from './Finish';
import type { RunnerProps } from './LessonRunner';
import { useNoteOn } from './useNotes';

const WINDOW_MS = 200;
const COUNT_IN = 4;
const PASS_RATIO = 0.75;

type Phase = { name: 'idle' } | { name: 'running'; expected: number[]; start: number } | { name: 'done'; hits: number; total: number; extra: number; saved: boolean };

export function RhythmRunner({ unit, lesson, profileId }: RunnerProps) {
  const pattern = lesson.pattern!;
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [beat, setBeat] = useState(-1);
  const taps = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });
  const debug = virtualInputEnabled(import.meta.env.DEV, window.location.search);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useNoteOn((m) => {
    if (phaseRef.current.name === 'running' && m === pattern.midi) taps.current.push(performance.now());
  });

  const begin = () => {
    timers.current.forEach(clearTimeout);
    taps.current = [];
    const beatMs = 60000 / pattern.bpm;
    const t0 = performance.now() + 600;
    const patternStart = t0 + COUNT_IN * beatMs;
    // Clicks are heard a little after they are scheduled; the player taps to what they hear.
    const heard = outputLatencyMs();
    const expected = tapTimes(pattern.beats, pattern.bpm, patternStart + heard);
    const clicks = [...Array.from({ length: COUNT_IN }, (_, i) => t0 + i * beatMs), ...tapTimes(pattern.beats, pattern.bpm, patternStart)];
    clicks.forEach((at, i) => {
      scheduleClick(Math.max(0, (at - performance.now()) / 1000), i % COUNT_IN === 0 && i < COUNT_IN);
      timers.current.push(setTimeout(() => setBeat(i < COUNT_IN ? -1 : i - COUNT_IN), Math.max(0, at - performance.now())));
    });
    setPhase({ name: 'running', expected, start: t0 });
    const end = expected[expected.length - 1]! + WINDOW_MS + 200;
    timers.current.push(
      setTimeout(() => {
        const j = judgeTaps(expected, taps.current, WINDOW_MS);
        const ok = j.hits / j.total >= PASS_RATIO;
        setBeat(-1);
        setPhase({ name: 'done', ...j, saved: !ok });
        if (ok) void markLessonDone(getDb(), profileId, unit.id, lesson.id).then(() => setPhase((p) => (p.name === 'done' ? { ...p, saved: true } : p)));
      }, Math.max(0, end - performance.now())),
    );
  };

  if (phase.name === 'done' && phase.saved) {
    const ok = phase.hits / phase.total >= PASS_RATIO;
    return (
      <Finish
        tone={ok ? 'done' : 'fail'}
        unitId={unit.id}
        title={ok ? 'Nice and steady' : 'Close, try again'}
        lines={[`${phase.hits} of ${phase.total} taps on the beat.`, phase.extra ? `${phase.extra} extra ${phase.extra === 1 ? 'tap' : 'taps'}.` : 'No extra taps.']}
        actions={
          <button className="btn" data-primary type="button" onClick={() => setPhase({ name: 'idle' })} data-testid="learn-retry">
            Again
          </button>
        }
      />
    );
  }
  return (
    <main className="main learn-main" data-testid="rhythm-runner">
      <header className="header">
        <div className="stack-tight">
          <div className="eyebrow learn-eyebrow">Unit {unit.number} · Rhythm tap</div>
          <div className="lesson-title">{unit.name}</div>
        </div>
      </header>
      <section className="prompt-card" data-testid="rhythm-card" data-phase={phase.name} data-tap-times={debug && phase.name === 'running' ? JSON.stringify(phase.expected) : undefined}>
        <div className="prompt-ask">
          Tap <b>{noteName(pattern.midi)}</b> on each dot. Four clicks count you in, then tap along.
        </div>
        <div className="beat-dots" aria-hidden="true">
          {pattern.beats.map((_, i) => (
            <span key={i} className="beat-dot" data-on={beat === i ? 'true' : undefined} />
          ))}
        </div>
        <button className="btn big" data-primary type="button" disabled={phase.name !== 'idle'} onClick={begin} data-testid="rhythm-start">
          {phase.name === 'idle' ? 'Start' : 'Listen and tap'}
        </button>
      </section>
    </main>
  );
}
