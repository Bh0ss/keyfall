/**
 * The open/closed logic of a help bubble, kept apart from React so it can be tested. A bubble shows while a mouse
 * hovers the (i) button, after a click or tap (until the next one), and while the button has focus from the keyboard
 * or the piano keys (C1 presses the focused button, so it closes and reopens the bubble).
 */
export interface BubbleState {
  /** Opened by focus or by a click or tap. */
  open: boolean;
  /** A mouse is over the button. */
  hover: boolean;
  /** A pointer press is under way: the focus it causes must not open the bubble, or the click would close it again. */
  pressing: boolean;
}

export const BUBBLE_CLOSED: BubbleState = { open: false, hover: false, pressing: false };

export type BubbleEvent =
  | { type: 'hover'; on: boolean }
  | { type: 'pointerdown' }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'click' }
  | { type: 'escape' }
  | { type: 'outside' };

export function bubbleVisible(s: BubbleState): boolean {
  return s.open || s.hover;
}

export function bubbleReduce(s: BubbleState, e: BubbleEvent): BubbleState {
  switch (e.type) {
    case 'hover':
      return { ...s, hover: e.on };
    case 'pointerdown':
      return { ...s, pressing: true };
    case 'focus':
      return s.pressing ? { ...s, pressing: false } : { ...s, open: true };
    case 'blur':
      return { open: false, hover: s.hover, pressing: false };
    case 'click':
      return bubbleVisible(s) && s.open ? BUBBLE_CLOSED : { open: true, hover: s.hover, pressing: false };
    case 'escape':
      return BUBBLE_CLOSED;
    case 'outside':
      return { ...s, open: false };
  }
}
