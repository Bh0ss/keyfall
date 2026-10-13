import { useNavScope } from '../nav/store';
import { AppLayout } from './AppLayout';
import { FOLK_ARRANGEMENTS, FONTS, LIBRARIES, LICENSED_SONGS, LICENCE_URL, MUTOPIA_PUBLIC_DOMAIN, REFERENCE_CREDITS, REPO_URL, type Credit } from './credits';
import { hrefFor } from './useRoute';

/** Opens in a new tab; the Content-Security-Policy governs resource loads, not navigation, so these links need no policy change. */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function CreditList({ items, testId }: { items: readonly Credit[]; testId: string }) {
  return (
    <ul className="credit-list" data-testid={testId}>
      {items.map((c) => (
        <li key={c.name}>
          <p>
            <strong>{c.name}</strong>, {c.licence}. Copyright {c.by}; {c.what}.
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CreditsScreen() {
  useNavScope({ kind: 'menu' });
  return (
    <AppLayout active="credits">
      <main className="main" data-testid="credits">
        <header className="header">
          <div>
            <div className="mark">Kf</div>
            <div className="eyebrow">About</div>
            <h1 className="title">Credits</h1>
          </div>
          <a className="btn" href={hrefFor.home()}>
            Home
          </a>
        </header>

        <section className="card" data-testid="credits-about">
          <h2>Keyfall</h2>
          <p>Keyfall is a personal project, free to use: a falling-notes piano game for learning to read and play music.</p>
          <p data-testid="credits-licence">
            The Keyfall code is under the <Ext href={LICENCE_URL}>MIT licence</Ext>. The bundled song files keep their own terms, listed below.
          </p>
          <div className="row">
            <a className="btn" href={REPO_URL} target="_blank" rel="noopener noreferrer" data-testid="credits-repo">
              Source code on GitHub
            </a>
          </div>
        </section>

        <section className="card" data-testid="credits-songs">
          <h2>Bundled songs</h2>
          <p>
            The compositions are in the public domain. The songs are Keyfall arrangements, except where listed here. The full record is{' '}
            <code>src/songs/NOTICE.md</code> in the <Ext href={REPO_URL}>repository</Ext>.
          </p>
          <h3>Shared under Creative Commons</h3>
          <ul className="credit-list" data-testid="credits-licensed">
            {LICENSED_SONGS.map((s) => (
              <li key={s.files[0]}>
                <p>
                  <strong>
                    {s.composer}, {s.work}.
                  </strong>{' '}
                  Adapted from the Mutopia Project typesetting by {s.typesetter} (
                  {s.sources.map((src, i) => (
                    <span key={src.url}>
                      {i > 0 && ', '}
                      <Ext href={src.url}>{src.label}</Ext>
                    </span>
                  ))}
                  ). Licensed <Ext href={s.licenceUrl}>{s.licence}</Ext>. The licence covers {s.files.length === 1 ? 'this one file' : 'these files'} only (
                  <code>{s.files.join(', ')}</code>), not the app code.
                </p>
              </li>
            ))}
          </ul>
          <h3>Public-domain typesettings from the Mutopia Project</h3>
          <p>Converted from public-domain typesettings. No attribution is required; listed for provenance.</p>
          <ul className="credit-list" data-testid="credits-mutopia-pd">
            {MUTOPIA_PUBLIC_DOMAIN.map((s) => (
              <li key={s.file}>
                <p>
                  {s.work}
                  {s.typesetter ? `, typeset by ${s.typesetter}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <h3>Original arrangements of public-domain tunes</h3>
          <p>
            Written for Keyfall: our own key, hands, fingering and left hand. Reference recordings (mostly Wikimedia Commons MIDI files that are
            CC0 or public domain) were used to check pitches, and for many hymns to read the tune; the arrangement is not copied from them. Also
            arranged here: Mary Had a Little Lamb, Twinkle Twinkle Little Star, Ode to Joy, Jingle Bells, When the Saints Go Marching In and
            Canon in D.
          </p>
          <ul className="credit-list" data-testid="credits-folk">
            {FOLK_ARRANGEMENTS.map((s) => (
              <li key={s.file}>
                <p>{s.work}</p>
              </li>
            ))}
          </ul>
          <h3>Reference recordings that carry a credit</h3>
          <p>Used only to check pitches and rhythm; nothing was copied. Credited because of their licences.</p>
          <ul className="credit-list" data-testid="credits-references">
            {REFERENCE_CREDITS.map((r) => (
              <li key={r.file}>
                <p>
                  <strong>{r.work}.</strong> Checked against {r.reference} (<Ext href={r.licenceUrl}>{r.licence}</Ext>).
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" data-testid="credits-libraries">
          <h2>Open-source libraries</h2>
          <CreditList items={LIBRARIES} testId="credits-library-list" />
        </section>

        <section className="card" data-testid="credits-fonts">
          <h2>Fonts</h2>
          <CreditList items={FONTS} testId="credits-font-list" />
        </section>
      </main>
    </AppLayout>
  );
}
