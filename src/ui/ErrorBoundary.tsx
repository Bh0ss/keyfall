import { Component, type ReactNode } from 'react';
import { hrefFor } from './useRoute';

interface State {
  error: Error | null;
}

/**
 * Catches anything a screen throws (a storage read that failed, a chunk that did not download) and shows a plain
 * message with a way out, instead of a blank page. `resetKey` clears it when the player navigates elsewhere.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell">
        <main className="main">
          <section className="card" data-tone="warn" role="alert" data-testid="screen-error">
            <h2>Something went wrong on this screen</h2>
            <p>Your scores and progress are safe on this device. Try again, or go back Home.</p>
            <p className="muted small-text" data-testid="screen-error-detail">
              {this.state.error.message}
            </p>
            <div className="row">
              <button className="btn" data-primary type="button" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <a className="btn" href={hrefFor.home()}>
                Back to Home
              </a>
              <button className="btn" type="button" onClick={() => window.location.reload()}>
                Reload Keyfall
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
