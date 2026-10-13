import { useState } from 'react';
import { TOUR_STEPS } from '../help/content';
import { clampStep, SEEN_TOUR, tourDue } from '../help/tour';
import { profiles, useActiveProfile } from './profileStore';

/**
 * The one-time tips tour: a card at the top of Home that steps through the main ideas. Shown once for each profile
 * (the flag is a profile setting, so it syncs), skippable at any step, and replayable from Settings. It is a card,
 * not a modal, so the rest of Home stays usable and the piano keys can still step through it.
 */
export function TipsTour() {
  const profile = useActiveProfile();
  const [step, setStep] = useState(0);
  if (!tourDue(profile.settings)) return null;
  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[clampStep(step)]!;
  const finish = () => void profiles.saveSettings(profile.id, SEEN_TOUR);
  return (
    <section className="card tour" data-testid="tips-tour" aria-labelledby="tour-title">
      <div className="tour-step" data-testid="tour-step">
        Tip {step + 1} of {TOUR_STEPS.length}
      </div>
      <div aria-live="polite" className="stack-tight">
        <h2 id="tour-title">{current.title}</h2>
        <p data-testid="tour-text">{current.text}</p>
      </div>
      <div className="tour-dots" aria-hidden="true">
        {TOUR_STEPS.map((s, i) => (
          <span key={s.title} data-on={i === step} />
        ))}
      </div>
      <div className="row">
        {step > 0 && (
          <button className="btn" type="button" data-testid="tour-back" onClick={() => setStep(clampStep(step - 1))}>
            Back
          </button>
        )}
        {last ? (
          <button className="btn" type="button" data-nav-default data-testid="tour-done" onClick={finish}>
            Got it
          </button>
        ) : (
          <button className="btn" type="button" data-nav-default data-testid="tour-next" onClick={() => setStep(clampStep(step + 1))}>
            Next
          </button>
        )}
        <button className="btn" type="button" data-testid="tour-skip" onClick={finish}>
          Skip tour
        </button>
      </div>
    </section>
  );
}
