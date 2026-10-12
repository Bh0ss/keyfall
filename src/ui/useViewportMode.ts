import { useSyncExternalStore } from 'react';

/**
 * 'phone-landscape': the compact Play layout (under 900 px wide, or a coarse-pointer screen no taller
 * than 500 px, which covers the widest iPhones turned sideways). 'phone-portrait': narrow and upright,
 * where Play asks for the phone to be turned. 'wide' is everything else.
 */
export type ViewportMode = 'wide' | 'phone-landscape' | 'phone-portrait';

export const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 899px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
export const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 899px)';

function modeNow(): ViewportMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'wide';
  if (window.matchMedia(PHONE_PORTRAIT_QUERY).matches) return 'phone-portrait';
  if (window.matchMedia(PHONE_LANDSCAPE_QUERY).matches) return 'phone-landscape';
  return 'wide';
}

function subscribe(onChange: () => void) {
  if (!window.matchMedia) return () => undefined;
  const lists = [window.matchMedia(PHONE_PORTRAIT_QUERY), window.matchMedia(PHONE_LANDSCAPE_QUERY)];
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, modeNow, () => 'wide');
}
