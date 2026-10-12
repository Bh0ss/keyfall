import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { LearnRun } from '../../learn/run';
import { clefFor, staffPlace } from '../../learn/staff';
import { getUnit, UNITS } from '../../learn/units';
import { virtualInputEnabled } from '../../midi/virtual';
import { getSongs } from '../../songs/catalog';
import { getDb } from '../../storage/db';
import { markLessonDone, recordUnitTest, saveReviewEntries } from '../../storage/learn';
import { noteName } from '../keyboardLayout';
import { hrefFor } from '../useRoute';
import { Finish } from './Finish';
import type { RunnerProps } from './LessonRunner';
import { MiniKeyboard, type KeyMark } from './MiniKeyboard';
import { NoteStaff } from './Staff';
import { useNoteOn } from './useNotes';

const ADVANCE_MS = 400;
const KEY_HINTS: Record<string, string> = {
  C: 'C is the white key just left of the two black keys.',
  D: 'D sits in the middle of the two black keys.',
  E: 'E is the white key just right of the two black keys.',
  F: 'F is the white key just left of the three black keys.',
  G: 'G sits between the first and second of the three black keys.',
  A: 'A sits between the second and third of the three black keys.',
  B: 'B is the white key just right of the three black keys.',
};
const letter = (midi: number) => noteName(midi).replace(/\d/, '');

export function PromptRunner(props: RunnerProps) {
  const [round, setRound] = useState(0);
  return <PromptSession key={round} {...props} onRetry={() => setRound((r) => r + 1)} />;
}

interface Finished {
  correct: number;
  total: number;
  passed: boolean;
  missed: number[];
}

function PromptSession({ unit, lesson, profileId, queue, onRetry }: RunnerProps & { onRetry: () => void }) {
  const [run] = useState(() => new LearnRun({ unit, lesson, queue }));
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [finished, setFinished] = useState<Finished | null>(null);
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closing = useRef(false);
  const debug = virtualInputEnabled(import.meta.env.DEV, window.location.search);

  useEffect(() => {
    run.start(performance.now());
    return () => clearTimeout(timer.current);
  }, [run]);

  const persist = useCallback(() => {
    const ups = run.drainUpdates();
    if (ups.length) saves.current = saves.current.then(() => saveReviewEntries(getDb(), profileId, ups));
  }, [run, profileId]);

  const advance = useCallback(() => {
    clearTimeout(timer.current);
    run.next(performance.now());
    if (run.state === 'done' && !closing.current) {
      closing.current = true;
      const r = run.result();
      const db = getDb();
      void saves.current
        .then(async () => {
          if (lesson.test) await recordUnitTest(db, profileId, unit.id, { correct: r.correct, total: r.total, passed: r.passed });
          else await markLessonDone(db, profileId, unit.id, lesson.id);
        })
        .then(() => setFinished({ correct: r.correct, total: r.total, passed: r.passed, missed: r.missed }));
    }
    bump();
  }, [run, lesson, unit.id, profileId]);

  const settled = useCallback(
    (result: 'correct' | 'wrong' | 'ignored') => {
      if (result === 'ignored') return;
      persist();
      bump();
      if (result === 'correct') timer.current = setTimeout(advance, ADVANCE_MS);
    },
    [persist, advance],
  );

  useNoteOn((m) => settled(run.answer(m, performance.now())));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && run.state === 'wrong') advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, advance]);

  if (finished) return <PromptFinish unitId={unit.id} lessonTitle={lesson.title} isTest={!!lesson.test} finished={finished} onRetry={onRetry} />;

  const prompt = run.current;
  const state = run.state;
  const target = prompt?.midi;
  const shown = Math.min(run.total, run.answered + (state === 'asking' ? 1 : 0));
  const marks: Record<number, KeyMark> = {};
  if (target !== undefined) {
    if (state === 'right') marks[target] = 'correct';
    if (state === 'wrong') {
      marks[target] = 'target';
      if (run.lastWrong !== null) marks[run.lastWrong] = 'wrong';
    }
  }
  const review = run.reviewNotes;
  const finger = target !== undefined ? unit.fingers?.[target] : undefined;
  const handName = unit.number === 4 ? 'left' : 'right';
  const place = prompt?.kind === 'note-flash' && target !== undefined ? `, ${staffPlace(target)}` : '';

  return (
    <main className="main learn-main" data-testid="prompt-runner">
      <header className="header">
        <div className="stack-tight">
          <div className="eyebrow learn-eyebrow">
            Unit {unit.number} · {lesson.test ? 'Unit test' : lesson.kind === 'note-flash' ? 'Note flash' : 'Key finder'}
          </div>
          <div className="lesson-title">{unit.name}</div>
        </div>
        <div className="learn-stats">
          <div className="stat">
            <div className="stat-value" data-testid="learn-count">
              {shown} / {run.total}
            </div>
            <div className="stat-label">Prompt</div>
          </div>
          <div className="stat">
            <div className="stat-value" data-tone="correct" data-testid="learn-accuracy">
              {run.answered ? `${Math.round(run.accuracy * 100)}%` : '–'}
            </div>
            <div className="stat-label">Accuracy</div>
          </div>
          <div className="stat">
            <div className="stat-value" data-tone="accent" data-testid="learn-streak">
              {run.streak}
            </div>
            <div className="stat-label">Streak</div>
          </div>
        </div>
      </header>
      <div className="learn-bar" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.answered}>
        <div className="learn-bar-fill" style={{ width: `${(run.answered / run.total) * 100}%` }} />
      </div>

      <section className="learn-body">
        <div
          className="prompt-card"
          data-testid="learn-prompt"
          data-kind={prompt?.kind}
          data-index={state === 'asking' ? run.answered : run.answered - 1}
          data-state={state}
          data-target-midi={debug ? target : undefined}
        >
          {prompt?.kind === 'note-flash' && target !== undefined ? (
            <>
              <div className="prompt-ask">Play this note on your keyboard</div>
              <NoteStaff midi={target} clef={clefFor(target)} tone={state === 'right' ? 'correct' : state === 'wrong' ? 'wrong' : 'idle'} />
            </>
          ) : target !== undefined ? (
            <>
              <div className="prompt-ask">Find this key and press it</div>
              <div className="prompt-name" data-testid="learn-key-name">
                {noteName(target)}
              </div>
              <div className="prompt-hint">{unit.number === 1 ? KEY_HINTS[letter(target)] : finger ? `Use finger ${finger} of your ${handName} hand.` : ''}</div>
            </>
          ) : null}
          <div className="feedback" data-state={state} aria-live="polite" data-testid="learn-feedback">
            {state === 'right' && target !== undefined && `Correct: that's ${noteName(target)}${place} · ${(run.lastMs / 1000).toFixed(1)} s`}
            {state === 'wrong' && target !== undefined && `${run.revealed ? '' : `That was ${noteName(run.lastWrong ?? 0)}. `}It's ${noteName(target)}${place}.`}
          </div>
          <MiniKeyboard range={unit.keyboard} marks={marks} labels={!lesson.test} />
        </div>

        <div className="learn-side">
          {unit.mnemonics && (
            <div className="card learn-tip">
              <div className="label label-learn">Memory trick</div>
              {unit.mnemonics.map((m) => (
                <p key={m.label}>
                  {m.label}: <b>{m.letters}</b>
                  {m.phrase ? `, "${m.phrase}."` : ''}
                </p>
              ))}
            </div>
          )}
          <div className="card" data-testid="learn-review">
            <div className="label label-learn">Needs review</div>
            {review.length ? (
              <div className="review-chips">
                {review.map((m) => (
                  <span key={m} className="review-chip" data-testid="review-chip">
                    {noteName(m)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small-text">Nothing yet. Notes you miss show up here.</p>
            )}
            <p className="muted small-text">These come up more often until you get them right 3 times in a row.</p>
          </div>
          {state === 'wrong' ? (
            <button className="btn big" data-primary type="button" onClick={advance} data-testid="learn-next">
              Next
            </button>
          ) : (
            <button
              className="btn big"
              type="button"
              disabled={state !== 'asking'}
              onClick={() => {
                run.reveal(performance.now());
                settled('wrong');
              }}
              data-testid="learn-show"
            >
              Show the answer
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function PromptFinish({ unitId, lessonTitle, isTest, finished, onRetry }: { unitId: string; lessonTitle: string; isTest: boolean; finished: Finished; onRetry: () => void }) {
  const unit = getUnit(unitId)!;
  const pct = Math.round((finished.correct / finished.total) * 100);
  const score = `${finished.correct} of ${finished.total} right (${pct}%)`;
  const missed = [...new Set(finished.missed)].map(noteName);
  const retry = (label: string) => (
    <button className="btn" data-primary type="button" onClick={onRetry} data-testid="learn-retry">
      {label}
    </button>
  );
  const missLine = missed.length ? `Missed: ${missed.join(', ')}. They will come up more often.` : 'No misses.';
  if (!isTest) {
    return <Finish tone="done" unitId={unitId} title={`${lessonTitle} done`} lines={[score, missLine]} actions={retry('Again')} />;
  }
  if (finished.passed) {
    const unlocked = getSongs().filter((s) => s.unlockedBy === unit.id);
    const next = UNITS.find((u) => u.number === unit.number + 1);
    const unlockLine = unlocked.length ? [`Unlocked: ${unlocked.map((s) => s.title).join(', ')}.`] : unit.unlocks ? [`${unit.unlocks} unlocks in a later update.`] : [];
    return (
      <Finish
        tone="pass"
        passed
        unitId={unitId}
        title={`Unit ${unit.number} passed`}
        lines={[score, ...unlockLine, missLine]}
        actions={
          next && !next.comingSoon ? (
            <a className="btn" data-primary href={hrefFor.learn(next.id)} data-testid="learn-next-unit">
              Unit {next.number}: {next.name}
            </a>
          ) : (
            retry('Retake')
          )
        }
      />
    );
  }
  return <Finish tone="fail" passed={false} unitId={unitId} title="Not quite yet" lines={[score, `You need ${Math.ceil(finished.total * 0.9)} of ${finished.total} to pass.`, missLine]} actions={retry('Try again')} />;
}
