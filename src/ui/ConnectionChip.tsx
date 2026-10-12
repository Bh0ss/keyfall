import type { MidiSnapshot } from '../midi/engine';

export function chipLabel(s: MidiSnapshot): { text: string; tone: 'ok' | 'warn' | 'idle' } {
  const { access, devices } = s;
  if (devices.connected) {
    const via = devices.transport ? ` · ${devices.transport}` : '';
    return { text: `${devices.name} connected${via}`, tone: 'ok' };
  }
  if (access === 'idle' || access === 'requesting') return { text: 'Looking for keyboard…', tone: 'idle' };
  return { text: 'No keyboard found', tone: 'warn' };
}

export function ConnectionChip({ snapshot, helpHref }: { snapshot: MidiSnapshot; helpHref: string }) {
  const { text, tone } = chipLabel(snapshot);
  return (
    <div className="row">
      <div className="chip" data-tone={tone} role="status" data-testid="connection-chip">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <rect x="2" y="7" width="20" height="10" rx="2" />
          <path d="M6 7v5M10 7v5M14 7v5M18 7v5" />
        </svg>
        {text}
      </div>
      <a className="btn" href={helpHref}>
        Setup help
      </a>
    </div>
  );
}
