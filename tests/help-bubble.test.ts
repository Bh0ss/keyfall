import { describe, expect, it } from 'vitest';
import { bubbleReduce, BUBBLE_CLOSED, bubbleVisible, type BubbleEvent, type BubbleState } from '../src/help/bubble';

const run = (events: BubbleEvent[], from: BubbleState = BUBBLE_CLOSED) => events.reduce(bubbleReduce, from);

describe('help bubble state', () => {
  it('starts closed', () => {
    expect(bubbleVisible(BUBBLE_CLOSED)).toBe(false);
  });

  it('opens while a mouse hovers and closes when it leaves', () => {
    const over = run([{ type: 'hover', on: true }]);
    expect(bubbleVisible(over)).toBe(true);
    expect(bubbleVisible(bubbleReduce(over, { type: 'hover', on: false }))).toBe(false);
  });

  it('opens when the button gets focus from the keyboard or the piano keys, and closes on blur', () => {
    const focused = run([{ type: 'focus' }]);
    expect(bubbleVisible(focused)).toBe(true);
    expect(bubbleVisible(bubbleReduce(focused, { type: 'blur' }))).toBe(false);
  });

  it('a press and release (tap or click) opens it, and the next one closes it', () => {
    const tapped = run([{ type: 'pointerdown' }, { type: 'focus' }, { type: 'click' }]);
    expect(bubbleVisible(tapped)).toBe(true);
    expect(bubbleVisible(run([{ type: 'pointerdown' }, { type: 'click' }], tapped))).toBe(false);
  });

  it('a pointer press that moves focus does not open it by itself (so the click is not undone)', () => {
    expect(bubbleVisible(run([{ type: 'pointerdown' }, { type: 'focus' }]))).toBe(false);
  });

  it('C1 (a click on the focused button) closes a bubble that focus opened, and the next press opens it again', () => {
    const focused = run([{ type: 'focus' }]);
    const closed = bubbleReduce(focused, { type: 'click' });
    expect(bubbleVisible(closed)).toBe(false);
    expect(bubbleVisible(bubbleReduce(closed, { type: 'click' }))).toBe(true);
  });

  it('a click while the bubble only shows because of the hover pins it open past the mouse leaving', () => {
    const pinned = run([{ type: 'hover', on: true }, { type: 'click' }, { type: 'hover', on: false }]);
    expect(bubbleVisible(pinned)).toBe(true);
  });

  it('a click on a pinned bubble closes it even with the mouse still over it', () => {
    const closed = run([{ type: 'hover', on: true }, { type: 'click' }, { type: 'click' }]);
    expect(bubbleVisible(closed)).toBe(false);
  });

  it('Escape closes it however it was opened', () => {
    for (const open of [[{ type: 'focus' }], [{ type: 'hover', on: true }], [{ type: 'click' }]] as BubbleEvent[][]) {
      expect(bubbleVisible(run([...open, { type: 'escape' }]))).toBe(false);
    }
  });

  it('a press outside closes a pinned bubble', () => {
    expect(bubbleVisible(run([{ type: 'click' }, { type: 'outside' }]))).toBe(false);
  });
});
