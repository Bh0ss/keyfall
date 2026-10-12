import { useSyncExternalStore } from 'react';

/**
 * 'phone-landscape': the compact Play layout (under 900 px wide, or a coarse-pointer screen no taller
 * than 500 px, which covers the widest iPhones turned sideways). 'phone-portrait': a phone held upright
 * (under 600 px wide), where Play asks for the phone to be turned. 'tablet-portrait': an iPad held upright
 * (600 to 1100 px wide, 820 to 1024 for the iPads in use), which gets a stacked Play layout instead of the prompt.
 * 'wide' is everything else, including a tablet in landscape.
 */
export type ViewportMode = 'wide' | 'phone-landscape' | 'phone-portrait' | 'tablet-portrait';

export const PHONE_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 899px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
export const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 599px)';
export const TABLET_PORTRAIT_QUERY = '(orientation: portrait) and (min-width: 600px) and (max-width: 1100px)';

function modeNow(): ViewportMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'wide';
  if (window.matchMedia(PHONE_PORTRAIT_QUERY).matches) return 'phone-portrait';
  if (window.matchMedia(TABLET_PORTRAIT_QUERY).matches) return 'tablet-portrait';
  if (window.matchMedia(PHONE_LANDSCAPE_QUERY).matches) return 'phone-landscape';
  return 'wide';
}

function subscribe(onChange: () => void) {
  if (!window.matchMedia) return () => undefined;
  const lists = [window.matchMedia(PHONE_PORTRAIT_QUERY), window.matchMedia(TABLET_PORTRAIT_QUERY), window.matchMedia(PHONE_LANDSCAPE_QUERY)];
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

export function useViewportMode(): ViewportMode {
  return useSyncExternalStore(subscribe, modeNow, () => 'wide');
}
