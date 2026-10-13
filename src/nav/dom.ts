/** Moving a visible selection through a screen's controls, for the piano-key navigation. */

const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';

function usable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.hidden) return false;
  if (el.tabIndex < 0 || el.closest('[inert], [aria-hidden="true"]')) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** Everything the selection can land on, in page order. An open overlay (`data-nav-modal`) holds the selection inside it. */
export function navItems(doc: Document = document): HTMLElement[] {
  const root = doc.querySelector<HTMLElement>('[data-nav-modal]') ?? doc.querySelector<HTMLElement>('#root') ?? doc.body;
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(usable);
}

/** Where the selection starts on a screen: marked default, else the first primary action, else the first control. */
export function defaultItem(items: HTMLElement[]): HTMLElement | undefined {
  return items.find((e) => e.matches('[data-nav-default]')) ?? items.find((e) => e.matches('[data-primary]')) ?? items[0];
}

export function show(el: HTMLElement): void {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Move the selection one control forward or back (wrapping). With nothing selected yet, the first press selects the default.
 * `only` limits the stops to controls matching a selector (the first one when the selection is elsewhere).
 */
export function moveSelection(dir: 'next' | 'prev', doc: Document = document, only?: string): HTMLElement | null {
  const items = navItems(doc).filter((e) => !only || e.matches(only));
  if (items.length === 0) return null;
  const at = doc.activeElement instanceof HTMLElement ? items.indexOf(doc.activeElement) : -1;
  const fallback = only ? items[dir === 'next' ? 0 : items.length - 1]! : defaultItem(items)!;
  const target = at < 0 ? fallback : items[(at + (dir === 'next' ? 1 : items.length - 1)) % items.length]!;
  show(target);
  return target;
}

/** Press the selected control. With nothing selected yet, select the default first so the player sees what C1 would do. */
export function activateSelection(doc: Document = document): 'activated' | 'selected' | 'none' {
  const items = navItems(doc);
  const el = doc.activeElement instanceof HTMLElement && items.includes(doc.activeElement) ? doc.activeElement : null;
  if (!el) {
    const target = defaultItem(items);
    if (!target) return 'none';
    show(target);
    return 'selected';
  }
  el.click();
  return 'activated';
}
