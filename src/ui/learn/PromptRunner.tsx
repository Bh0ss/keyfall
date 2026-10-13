import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Prompt } from '../../learn/generate';
import { keySigById } from '../../learn/keysig';
import { symbolById } from '../../learn/rhythm';
import { LearnRun, type AnswerResult } from '../../learn/run';
import { blackKeyHint, clefFor, isBlackKey, otherSpell, spellName, staffPlace, whiteOf } from '../../learn/staff';
import { getUnit, UNITS } from '../../learn/units';
import { virtualInputEnabled } from '../../midi/virtual';
import { bundledSummaries } from '../../songs/bundled';
import { getDb } from '../../storage/db';
import { markLessonDone, recordUnitTest, saveReviewEntries } from '../../storage/learn';
import { noteName } from '../keyboardLayout';
import { hrefFor } from '../useRoute';
import { Finish } from './Finish';
import type { RunnerProps } from './LessonRunner';
import { MiniKeyboard, type KeyMark } from './MiniKeyboard';
import { reviewLabel } from './labels';
import { GrandStaff, NoteStaff, RhythmStaff, SignatureStaff } from './Staff';
import { playSound } from '../sounds';
import { earnedLines, trackLearn, type Earned } from './earned';
import { useNoteKeys } from './useNotes';

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

/** The key name as the prompt shows it; a black key also gets its other name. */
function keyName(p: Prompt, both = false): string {
  const name = spellName(p.midi, p.spell);
  return both && isBlackKey(p.midi) ? `${name} (also ${spellName(p.midi, otherSpell(p.spell ?? 'sharp'))})` : name;
}

/** Where the note sits on the staff, in words, for the feedback line. */
function placeOf(p: Prompt): string {
  if (p.kind !== 'note-flash') return '';
  const sign = isBlackKey(p.midi) ? ` with a ${p.spell === 'flat' ? 'flat' : 'sharp'}` : '';
  return `, ${staffPlace(whiteOf(p.midi, p.spell))}${sign}`;
}

/** What the right answer is, in a sentence, for the feedback line. */
function answerText(p: Prompt): string {
  switch (p.kind) {
    case 'both-hands':
      return `${(p.set ?? []).map((m) => spellName(m)).join(' + ')}`;
    case 'rhythm-name':
      return `a ${symbolById(p.symbol!)!.name.toLowerCase()}`;
    case 'rhythm-beats':
      return p.choices!.find((c) => c.id === p.answer)!.label;
    case 'keysig-name':
      return p.choices!.find((c) => c.id === p.answer)!.label;
    case 'in-key': {
      const sig = keySigById(p.sig!)!;
      return `${spellName(p.midi, sig.kind === 'flat' ? 'flat' : 'sharp')} in ${sig.name}`;
    }
    default:
      return `${keyName(p, true)}${placeOf(p)}`;
  }
}

export function PromptRunner(props: RunnerProps) {
  const [round, setRound] = useState(0);
  return <PromptSession key={round} {...props} onRetry={() => setRound((r) => r + 1)} />;
}

interface Finished {
  correct: number;
  total: number;
  passed: boolean;
  missed: number[];
  earned?: Earned;
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
        .then(() =>
          trackLearn(profileId, async () => {
            if (lesson.test) await recordUnitTest(db, profileId, unit.id, { correct: r.correct, total: r.total, passed: r.passed });
            else await markLessonDone(db, profileId, unit.id, lesson.id);
          }),
        )
        .then((earned) => setFinished({ correct: r.correct, total: r.total, passed: r.passed, missed: r.missed, earned }));
    }
    bump();
  }, [run, lesson, unit.id, profileId]);

  const settled = useCallback(
    (result: AnswerResult) => {
      if (result === 'ignored') return;
      if (result === 'pending') {
        bump();
        return;
      }
      persist();
      bump();
      playSound(result === 'correct' ? 'correct' : 'wrong');
      if (result === 'correct') timer.current = setTimeout(advance, ADVANCE_MS);
    },
    [persist, advance],
  );

  useNoteKeys(
    (m) => settled(run.answer(m, performance.now())),
    (m) => run.release(m),
  );

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
  const targets = prompt ? (prompt.set ?? (prompt.choices ? [] : [prompt.midi])) : [];
  const marks: Record<number, KeyMark> = {};
  if (state === 'right') for (const t of targets) marks[t] = 'correct';
  if (state === 'wrong') {
    for (const t of targets) marks[t] = 'target';
    if (run.lastWrong !== null) marks[run.lastWrong] = 'wrong';
  }
  if (state === 'asking') for (const m of run.heldKeys) marks[m] = 'correct';
  const review = run.reviewNotes;
  const finger = prompt && !prompt.set && !prompt.choices ? unit.fingers?.[prompt.midi] : undefined;
  const handName = unit.number === 4 ? 'left' : 'right';
  const tone = state === 'right' ? 'correct' : state === 'wrong' ? 'wrong' : 'idle';
  const choiceLabel = prompt?.choices?.find((c) => c.id === run.lastChoice)?.label;
  const sig = prompt?.sig ? keySigById(prompt.sig) : undefined;
  const wrongPrefix = run.revealed
    ? ''
    : choiceLabel
      ? `You chose ${choiceLabel}. `
      : run.lastWrong !== null
        ? `That was ${spellName(run.lastWrong)}. `
        : '';
  const label = lesson.test ? 'Unit test' : { 'note-flash': 'Note flash', 'key-finder': 'Key finder', 'both-hands': 'Both hands', 'rhythm-read': 'Read the rhythm', 'key-sig': 'Key signatures', 'rhythm-tap': 'Rhythm tap', 'mini-song': 'Mini song' }[lesson.kind];

  return (
    <main className="main learn-main" data-testid="prompt-runner">
      <header className="header">
        <div className="stack-tight">
          <div className="eyebrow learn-eyebrow">
            Unit {unit.number} · {label}
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
          data-target-set={debug && prompt?.set ? JSON.stringify(prompt.set) : undefined}
          data-answer={debug ? prompt?.answer : undefined}
        >
          {prompt && <PromptBody prompt={prompt} unit={unit} tone={tone} state={state} finger={finger} handName={handName} grand={!!lesson.grand} sig={sig} lastChoice={run.lastChoice} onChoose={(id) => settled(run.choose(id, performance.now()))} />}
          <div className="feedback" data-state={state} aria-live="polite" data-testid="learn-feedback">
            {state === 'right' && prompt && `Correct: that's ${answerText(prompt)} · ${(run.lastMs / 1000).toFixed(1)} s`}
            {state === 'wrong' && prompt && `${wrongPrefix}It's ${answerText(prompt)}.`}
          </div>
          {prompt && !prompt.choices && !(lesson.eyesOff && state === 'asking') && <MiniKeyboard range={unit.keyboard} marks={marks} labels={!lesson.test} />}
          {prompt && lesson.eyesOff && state === 'asking' && (
            <p className="prompt-hint" data-testid="eyes-off-note">
              Find it by feel: touch the black-key groups, then press. The keyboard shows once you press a key.
            </p>
          )}
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
                    {reviewLabel(m)}
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
  const missed = [...new Set(finished.missed)].map(reviewLabel);
  const retry = (label: string) => (
    <button className="btn" data-primary type="button" onClick={onRetry} data-testid="learn-retry">
      {label}
    </button>
  );
  const missLine = missed.length ? `Missed: ${missed.join(', ')}. They will come up more often.` : 'No misses.';
  if (!isTest) {
    return <Finish tone="done" unitId={unitId} title={`${lessonTitle} done`} lines={[score, ...earnedLines(finished.earned), missLine]} actions={retry('Again')} />;
  }
  if (finished.passed) {
    const unlocked = bundledSummaries().filter((s) => s.unlockedBy === unit.id);
    const next = UNITS.find((u) => u.number === unit.number + 1);
    const unlockLine = unlocked.length ? [`Unlocked: ${unlocked.map((s) => s.title).join(', ')}.`] : unit.unlocks ? [`${unit.unlocks} unlocks in a later update.`] : [];
    return (
      <Finish
        tone="pass"
        passed
        unitId={unitId}
        title={`Unit ${unit.number} passed`}
        lines={[score, ...unlockLine, ...earnedLines(finished.earned), missLine]}
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
  return <Finish tone="fail" passed={false} unitId={unitId} title="Not quite yet" lines={[score, `You need ${Math.ceil(finished.total * 0.9)} of ${finished.total} to pass.`, ...earnedLines(finished.earned), missLine]} actions={retry('Try again')} />;
}

interface BodyProps {
  prompt: Prompt;
  unit: RunnerProps['unit'];
  tone: 'idle' | 'correct' | 'wrong';
  state: string;
  finger?: number;
  handName: string;
  grand: boolean;
  sig?: ReturnType<typeof keySigById>;
  lastChoice: string | null;
  onChoose: (id: string) => void;
}

/** The part of the card that changes with the prompt kind: what is shown, and what the answer buttons are. */
function PromptBody({ prompt, unit, tone, state, finger, handName, grand, sig, lastChoice, onChoose }: BodyProps) {
  const choices = prompt.choices && (
    <div className="choices" data-testid="choices">
      {prompt.choices.map((c) => (
        <button
          key={c.id}
          type="button"
          className="btn choice"
          disabled={state !== 'asking'}
          data-testid={`choice-${c.id}`}
          data-mark={state !== 'asking' ? (c.id === prompt.answer ? 'right' : c.id === lastChoice ? 'wrong' : undefined) : undefined}
          onClick={() => onChoose(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
  switch (prompt.kind) {
    case 'note-flash':
      return (
        <>
          <div className="prompt-ask">Play this note on your keyboard</div>
          {grand ? <GrandStaff midis={[prompt.midi]} spell={prompt.spell} tone={tone} /> : <NoteStaff midi={prompt.midi} spell={prompt.spell} clef={clefFor(prompt.midi)} tone={tone} />}
        </>
      );
    case 'both-hands':
      return (
        <>
          <div className="prompt-ask">Press all of these together, left hand and right hand</div>
          <GrandStaff midis={prompt.set!} tone={tone} />
        </>
      );
    case 'rhythm-name':
    case 'rhythm-beats':
      return (
        <>
          <div className="prompt-ask">{prompt.kind === 'rhythm-name' ? 'What is this?' : 'How many beats does this last?'}</div>
          <RhythmStaff steps={[prompt.symbol!]} tone={tone} />
          {choices}
        </>
      );
    case 'keysig-name':
      return (
        <>
          <div className="prompt-ask">Which major key has this key signature?</div>
          <SignatureStaff keySig={sig!} />
          {choices}
        </>
      );
    case 'in-key':
      return (
        <>
          <div className="prompt-ask">
            Key of {sig!.name}. Press the key for this note, signature applied
          </div>
          <NoteStaff midi={prompt.written!} clef="treble" keySig={sig} tone={tone} />
        </>
      );
    default:
      return (
        <>
          <div className="prompt-ask">Find this key and press it</div>
          <div className="prompt-name" data-testid="learn-key-name">
            {spellName(prompt.midi, prompt.spell)}
          </div>
          <div className="prompt-hint">
            {unit.landmarkHints || unit.number === 1
              ? KEY_HINTS[letter(prompt.midi)]
              : isBlackKey(prompt.midi)
                ? blackKeyHint(prompt.midi, prompt.spell ?? 'sharp')
                : finger
                  ? `Use finger ${finger} of your ${handName} hand.`
                  : ''}
          </div>
        </>
      );
  }
}
