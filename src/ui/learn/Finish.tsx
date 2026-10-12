import { useEffect, type ReactNode } from 'react';
import { playSound } from '../sounds';
import { hrefFor } from '../useRoute';

/** The end card of a lesson: pass or fail for the unit test, "done" for practice. */
export function Finish({
  tone,
  title,
  lines,
  unitId,
  actions,
  passed,
}: {
  tone: 'pass' | 'fail' | 'done';
  title: string;
  lines: ReactNode[];
  unitId: string;
  actions: ReactNode;
  passed?: boolean;
}) {
  useEffect(() => {
    playSound(tone === 'pass' ? 'pass' : tone === 'fail' ? 'fail' : 'complete');
  }, [tone]);
  const earnedSparkle = lines.some((l) => typeof l === 'string' && (l.startsWith('Level up') || l.startsWith('New badge')));
  useEffect(() => {
    if (!earnedSparkle) return;
    const t = setTimeout(() => playSound('badge'), 900);
    return () => clearTimeout(t);
  }, [earnedSparkle]);
  return (
    <main className="main learn-main learn-finish" data-testid="learn-result" data-tone={tone} data-passed={passed === undefined ? undefined : String(passed)}>
      <section className="card finish-card" data-tone={tone === 'fail' ? 'warn' : undefined}>
        <div className="finish-mark" aria-hidden="true">
          {tone === 'pass' ? '✓' : tone === 'fail' ? '↻' : '♪'}
        </div>
        <h2 data-testid="learn-result-title">{title}</h2>
        {lines.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        <div className="row">
          {actions}
          <a className="btn" href={hrefFor.learn(unitId)} data-testid="learn-back">
            Back to unit
          </a>
        </div>
      </section>
    </main>
  );
}
