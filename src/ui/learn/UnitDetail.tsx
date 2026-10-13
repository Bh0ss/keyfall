import { isSongUnlocked, unitLockText, type UnitStatus } from '../../learn/unlocks';
import type { Unit } from '../../learn/units';
import { bundledSummaries } from '../../songs/bundled';
import type { LearnProgressRecord, PlayerLevel } from '../../storage/types';
import { HelpBubble } from '../HelpBubble';
import { hrefFor } from '../useRoute';
import { UnitIntro } from './UnitIntro';

const KIND = {
  'key-finder': 'Key finder',
  'note-flash': 'Note flash',
  'rhythm-tap': 'Rhythm tap',
  'mini-song': 'Mini song',
  'rhythm-read': 'Read the rhythm',
  'both-hands': 'Both hands',
  'key-sig': 'Key signatures',
} as const;

export function UnitDetail({ unit, status, progress, level }: { unit: Unit; status: UnitStatus; progress?: LearnProgressRecord; level: PlayerLevel }) {
  const playable = status === 'open' || status === 'passed';
  const passed = new Set(progress?.passed ? [unit.id] : []);
  const songs = bundledSummaries().filter((s) => s.unlockedBy === unit.id);
  return (
    <main className="main learn-main" data-testid="unit-detail" data-unit={unit.id}>
      <header className="header">
        <div className="stack-tight">
          <div className="eyebrow learn-eyebrow">Unit {unit.number}</div>
          <h2 className="title" data-testid="unit-title">
            {unit.name}
          </h2>
        </div>
        <span className="pill" data-testid="unit-status">
          {status === 'passed' ? 'Passed' : status === 'open' ? 'Ready' : status === 'locked' ? 'Locked' : 'Coming soon'}
        </span>
      </header>
      <p className="tile-text">{unit.blurb}</p>
      <div className="title-help" data-testid="learn-rules-help">
        <span className="muted small-text">How passing works</span>
        <HelpBubble id="learn.pass" />
        <span className="muted small-text">Review list</span>
        <HelpBubble id="learn.review" />
      </div>

      {unit.unlocks && (
        <div className="pills">
          <span className="pill" data-testid="unit-unlocks">
            Unlocks {unit.unlocks}
          </span>
          {songs.map((s) => {
            const open = isSongUnlocked(s, passed, level);
            return open ? (
              <a key={s.id} className="pill pill-link" href={hrefFor.play(s.id)} data-testid={`unit-song-${s.id}`}>
                Unlocked · play {s.title}
              </a>
            ) : null;
          })}
        </div>
      )}

      {status === 'coming-soon' && (
        <section className="card" data-testid="unit-coming-soon">
          <h3>Coming soon</h3>
          <p>This unit is planned for a later update.</p>
        </section>
      )}
      {status === 'locked' && (
        <section className="card" data-testid="unit-locked">
          <h3>Locked</h3>
          <p>{unitLockText(unit)}</p>
        </section>
      )}

      {unit.mnemonics && (
        <section className="card learn-tip">
          <div className="label label-learn">Memory trick</div>
          {unit.mnemonics.map((m) => (
            <p key={m.label}>
              {m.label}: <b>{m.letters}</b>
              {m.phrase ? `, "${m.phrase}."` : ''}
            </p>
          ))}
        </section>
      )}

      {playable && <UnitIntro key={unit.id} unit={unit} progress={progress} />}

      {playable && (
        <ol className="lesson-list">
          {unit.lessons.map((l) => {
            const done = l.test ? !!progress?.passed : progress?.lessonsDone.includes(l.id);
            return (
              <li key={l.id} className="lesson-row" data-done={done ? 'true' : undefined} data-testid={`lesson-${l.id}`}>
                <div className="lesson-text">
                  <div className="label label-learn">{l.test ? 'Unit test' : KIND[l.kind]}{l.optional ? ' · optional' : ''}</div>
                  <strong>{l.title}</strong>
                  <span className="muted small-text">{l.blurb}</span>
                  {l.test && progress && progress.attempts > 0 && (
                    <span className="small-text" data-testid="unit-best">
                      Best: {progress.bestCorrect} of {progress.bestTotal} · {progress.attempts} {progress.attempts === 1 ? 'try' : 'tries'}
                    </span>
                  )}
                </div>
                <div className="row">
                  {done && <span className="done-mark" aria-label="Done">✓</span>}
                  <a className="btn" data-primary={l.test ? true : undefined} href={hrefFor.learn(unit.id, l.id)} data-testid={`learn-start-${l.id}`}>
                    {l.test ? (progress?.passed ? 'Retake test' : 'Take the test') : done ? 'Again' : 'Start'}
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
