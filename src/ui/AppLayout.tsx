import type { ReactNode } from 'react';
import { hrefFor } from './useRoute';

export type RailItem = 'home' | 'learn' | 'play' | 'stats' | 'settings';

const ICONS: Record<RailItem, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  learn: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5" />
    </>
  ),
  play: <path d="M7 4l13 8-13 8z" />,
  stats: <path d="M5 20V10M12 20V4M19 20v-7" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
};

function Icon({ item }: { item: RailItem }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[item]}
    </svg>
  );
}

const ITEMS: { id: RailItem; label: string; href: string | null }[] = [
  { id: 'home', label: 'Home', href: hrefFor.home() },
  { id: 'learn', label: 'Learn', href: hrefFor.learn() },
  { id: 'play', label: 'Play', href: hrefFor.songs() },
  { id: 'stats', label: 'Stats', href: hrefFor.stats() },
  { id: 'settings', label: 'Settings', href: hrefFor.settings() },
];

/** Left navigation rail from the canvas, around a screen. */
export function AppLayout({ active, children }: { active: RailItem; children: ReactNode }) {
  return (
    <div className="frame">
      <nav className="rail" aria-label="Main">
        <div className="rail-mark">Kf</div>
        {ITEMS.map((item) =>
          item.href ? (
            <a key={item.id} className="rail-item" href={item.href} aria-current={active === item.id ? 'page' : undefined} data-testid={`rail-${item.id}`}>
              <Icon item={item.id} />
              {item.label}
            </a>
          ) : (
            <span key={item.id} className="rail-item" aria-disabled="true" title="Coming soon" data-testid={`rail-${item.id}`}>
              <Icon item={item.id} />
              {item.label}
            </span>
          ),
        )}
      </nav>
      <div className="frame-body">{children}</div>
    </div>
  );
}
