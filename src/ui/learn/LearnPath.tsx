import type { ReactNode } from 'react';
import { unitStatus, type UnitStatus } from '../../learn/unlocks';
import { UNITS, type Unit } from '../../learn/units';
import type { LearnProgressRecord } from '../../storage/types';
import { hrefFor } from '../useRoute';

function sub(unit: Unit, status: UnitStatus, p?: LearnProgressRecord): string {
  if (status === 'passed') return p ? `Passed · ${p.bestCorrect} of ${p.bestTotal}` : 'Passed';
  if (status === 'coming-soon') return 'Coming soon';
  if (status === 'locked') return 'Locked';
  return p && p.attempts ? `In progress · best ${p.bestCorrect} of ${p.bestTotal}` : unit.unlocks ? `Unlocks ${unit.unlocks}` : 'Ready';
}

/** The "Learn path" column from the canvas: all ten units with their state. */
export function LearnPath({ passed, progress, activeId }: { passed: ReadonlySet<string>; progress: Map<string, LearnProgressRecord>; activeId?: string }) {
  return (
    <aside className="learn-path" aria-label="Learn path">
      <a className="learn-back" href={hrefFor.home()}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Home
      </a>
      <h1 className="learn-path-title">Learn path</h1>
      <ol className="learn-units">
        {UNITS.map((u) => {
          const status = unitStatus(u, passed);
          const inner: ReactNode = (
            <>
              <span className="unit-dot">{status === 'passed' ? '✓' : u.number}</span>
              <span className="unit-text">
                <span className="unit-name">{u.name}</span>
                <span className="unit-sub">{sub(u, status, progress.get(u.id))}</span>
              </span>
            </>
          );
          const attrs = { 'data-status': status, 'data-active': activeId === u.id ? 'true' : undefined, 'data-testid': `learn-unit-${u.number}` };
          return (
            <li key={u.id}>
              {status === 'open' || status === 'passed' ? (
                <a className="unit-row" href={hrefFor.learn(u.id)} {...attrs}>
                  {inner}
                </a>
              ) : (
                <div className="unit-row" aria-disabled="true" {...attrs}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
