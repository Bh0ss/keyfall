import { useState } from 'react';
import { explainerFor, INTRO_ID, introSeen } from '../../learn/explainers';
import type { Unit } from '../../learn/units';
import { getDb } from '../../storage/db';
import { markLessonDone } from '../../storage/learn';
import type { LearnProgressRecord } from '../../storage/types';
import { useActiveProfile } from '../profileStore';
import { DiagramView } from './Diagrams';

/**
 * The unit's explainer cards. Open the first time a profile visits the unit; skipping or finishing them
 * closes the panel and remembers it (the unit's finished-lessons list, which syncs with the profile).
 * A button reopens them any time.
 */
export function UnitIntro({ unit, progress }: { unit: Unit; progress?: LearnProgressRecord }) {
  const profile = useActiveProfile();
  const cards = explainerFor(unit.id);
  const [open, setOpen] = useState(() => !introSeen(progress));
  const [index, setIndex] = useState(0);
  if (cards.length === 0) return null;

  const close = () => {
    setOpen(false);
    setIndex(0);
    if (!introSeen(progress)) void markLessonDone(getDb(), profile.id, unit.id, INTRO_ID).catch(() => undefined);
  };

  if (!open) {
    return (
      <div className="row">
        <button className="btn" type="button" onClick={() => setOpen(true)} data-testid="intro-open">
          Show the unit intro
        </button>
      </div>
    );
  }

  const card = cards[index]!;
  const last = index === cards.length - 1;
  return (
    <section className="card intro-card" aria-label="Before you start" data-testid="unit-intro" data-card={index}>
      <div className="label label-learn" data-testid="intro-step">
        Before you start · {index + 1} of {cards.length}
      </div>
      <h3 className="intro-title" data-testid="intro-title">
        {card.title}
      </h3>
      <p>{card.concept}</p>
      <DiagramView diagram={card.diagram} alt={card.alt} />
      <p className="intro-tip">
        <b>Tip:</b> {card.tip}
      </p>
      <div className="row">
        {index > 0 && (
          <button className="btn" type="button" onClick={() => setIndex(index - 1)} data-testid="intro-back">
            Back
          </button>
        )}
        {last ? (
          <button className="btn" data-primary type="button" onClick={close} data-testid="intro-done">
            Got it
          </button>
        ) : (
          <button className="btn" data-primary type="button" onClick={() => setIndex(index + 1)} data-testid="intro-next">
            Next
          </button>
        )}
        {!last && (
          <button className="btn" type="button" onClick={close} data-testid="intro-skip">
            Skip intro
          </button>
        )}
      </div>
    </section>
  );
}
