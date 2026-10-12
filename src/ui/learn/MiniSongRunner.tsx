import { useReducer, useRef, useState } from 'react';
import { MiniSongRun } from '../../learn/run';
import { getDb } from '../../storage/db';
import { markLessonDone } from '../../storage/learn';
import { keySigById } from '../../learn/keysig';
import { spellName } from '../../learn/staff';
import { Finish } from './Finish';
import type { RunnerProps } from './LessonRunner';
import { MiniKeyboard, type KeyMark } from './MiniKeyboard';
import { SongStaff } from './Staff';
import { earnedLines, trackLearn, type Earned } from './earned';
import { useNoteKeys } from './useNotes';

export function MiniSongRunner(props: RunnerProps) {
  const [round, setRound] = useState(0);
  return <MiniSession key={round} {...props} onRetry={() => setRound((r) => r + 1)} />;
}

function MiniSession({ unit, lesson, profileId, onRetry }: RunnerProps & { onRetry: () => void }) {
  const song = lesson.song!;
  const [run] = useState(() => new MiniSongRun(song));
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [saved, setSaved] = useState<Earned | null>(null);
  const closing = useRef(false);

  useNoteKeys(
    (m) => {
      const r = run.press(m, performance.now());
      if (r === 'ignored') return;
      if (run.done && !closing.current) {
        closing.current = true;
        void trackLearn(profileId, () => markLessonDone(getDb(), profileId, unit.id, lesson.id)).then(setSaved);
      }
      bump();
    },
    (m) => run.release(m),
  );

  if (saved) {
    return (
      <Finish
        tone="done"
        unitId={unit.id}
        title={`${song.title} done`}
        lines={[run.wrong === 0 ? 'No wrong keys.' : `${run.wrong} wrong ${run.wrong === 1 ? 'key' : 'keys'} along the way.`, ...earnedLines(saved)]}
        actions={
          <button className="btn" data-primary type="button" onClick={onRetry} data-testid="learn-retry">
            Play again
          </button>
        }
      />
    );
  }
  const next = run.song.notes[run.index];
  const marks: Record<number, KeyMark> = Object.fromEntries(run.targets.map((m) => [m, 'target' as KeyMark]));
  const names = run.targets.map((m) => spellName(m, next?.spell ?? (song.keySig && keySigById(song.keySig)?.kind === 'flat' ? 'flat' : 'sharp')));
  const fingerText = next?.left
    ? `right finger ${next.finger}, left finger ${next.left.finger}`
    : next?.finger
      ? `finger ${next.finger}`
      : '';
  return (
    <main className="main learn-main" data-testid="mini-song-runner">
      <header className="header">
        <div className="stack-tight">
          <div className="eyebrow learn-eyebrow">Unit {unit.number} · Mini song</div>
          <div className="lesson-title">{song.title}</div>
        </div>
        <div className="learn-stats">
          <div className="stat">
            <div className="stat-value" data-testid="mini-progress">
              {run.played} / {run.playable}
            </div>
            <div className="stat-label">Notes</div>
          </div>
          <div className="stat">
            <div className="stat-value" data-tone="accent" data-testid="mini-wrong">
              {run.wrong}
            </div>
            <div className="stat-label">Wrong keys</div>
          </div>
        </div>
      </header>
      <section className="prompt-card" data-testid="mini-song" data-next-midi={next?.midi} data-next-set={run.targets.length > 1 ? JSON.stringify(run.targets) : undefined}>
        <div className="prompt-ask">
          Play the notes in order. Next: <b>{names.join(' + ')}</b>
          {fingerText ? ` · ${fingerText}` : ''}
          {run.targets.length > 1 ? ' · press them together' : ''}
        </div>
        <SongStaff song={song} index={run.index} />
        <MiniKeyboard range={unit.keyboard} marks={marks} labels />
      </section>
    </main>
  );
}
