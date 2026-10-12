import { useEffect, useRef, useState } from 'react';
import { judgeTaps, tapTimes, tapsPass, tapWindow } from '../../learn/rhythm';
import { virtualInputEnabled } from '../../midi/virtual';
import { getDb } from '../../storage/db';
import { markLessonDone } from '../../storage/learn';
import { noteName } from '../keyboardLayout';
import { outputLatencyMs, scheduleClick } from '../audio';
import { Finish } from './Finish';
import type { RunnerProps } from './LessonRunner';
import { RhythmStaff } from './Staff';
import { useNoteOn } from './useNotes';

const COUNT_IN = 4;

type Phase = { name: 'idle' } | { name: 'running'; expected: number[]; start: number } | { name: 'done'; hits: number; total: number; extra: number; saved: boolean };

export function RhythmRunner({ unit, lesson, profileId }: RunnerProps) {
  const pattern = lesson.pattern!;
  const windowMs = tapWindow(pattern.beats, pattern.bpm);
  const length = pattern.length ?? pattern.beats[pattern.beats.length - 1]! + 1;
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
    // The metronome clicks every beat; the player taps only where a note starts (rests and held beats stay silent).
    const beatsList = Array.from({ length: Math.ceil(length) }, (_, i) => i);
    const clicks = [...Array.from({ length: COUNT_IN }, (_, i) => t0 + i * beatMs), ...tapTimes(beatsList, pattern.bpm, patternStart)];
    clicks.forEach((at, i) => {
      scheduleClick(Math.max(0, (at - performance.now()) / 1000), i % COUNT_IN === 0);
    });
    tapTimes(pattern.beats, pattern.bpm, patternStart).forEach((at, i) => {
      timers.current.push(setTimeout(() => setBeat(i), Math.max(0, at - performance.now())));
    });
    setPhase({ name: 'running', expected, start: t0 });
    const end = Math.max(expected[expected.length - 1]!, patternStart + heard + (length * 60000) / pattern.bpm) + windowMs + 200;
    timers.current.push(
      setTimeout(() => {
        const j = judgeTaps(expected, taps.current, windowMs);
        const ok = tapsPass(j);
        setBeat(-1);
        setPhase({ name: 'done', ...j, saved: !ok });
        if (ok) void markLessonDone(getDb(), profileId, unit.id, lesson.id).then(() => setPhase((p) => (p.name === 'done' ? { ...p, saved: true } : p)));
      }, Math.max(0, end - performance.now())),
    );
  };

  if (phase.name === 'done' && phase.saved) {
    const ok = tapsPass(phase);
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
        {pattern.steps && <RhythmStaff steps={pattern.steps} />}
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
