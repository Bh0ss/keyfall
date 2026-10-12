import { COMMANDS } from '../nav/commands';
import { profiles, useActiveProfile } from './profileStore';

/** The five command keys and what they do, shown as keycaps. */
export function KeyLegend() {
  return (
    <ul className="key-legend" aria-label="Piano navigation keys" data-testid="key-legend">
      {COMMANDS.map((c) => (
        <li key={c.command} data-command={c.command}>
          <kbd>{c.note}</kbd>
          <span>{c.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** First run: a card on Home that says the five lowest white keys steer the menus. Dismissed once per profile. */
export function FirstRunLegend() {
  const profile = useActiveProfile();
  if (profile.settings.pianoNav === false || profile.settings.navLegendSeen) return null;
  return (
    <section className="card legend-card" data-testid="nav-legend" aria-labelledby="nav-legend-title">
      <div className="stack-tight">
        <h2 id="nav-legend-title">Steer Keyfall from the piano</h2>
        <p>The five lowest white keys work the menus, so you never have to leave the piano. They pause and resume while a song plays.</p>
      </div>
      <KeyLegend />
      <div className="row">
        <button className="btn" type="button" data-testid="nav-legend-dismiss" onClick={() => void profiles.saveSettings(profile.id, { navLegendSeen: true })}>
          Got it
        </button>
        <span className="muted small-text">Turn this off any time in Settings.</span>
      </div>
    </section>
  );
}
