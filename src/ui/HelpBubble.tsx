import { useEffect, useId, useLayoutEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BUBBLE_CLOSED, bubbleReduce, bubbleVisible } from '../help/bubble';
import { HELP, type HelpId } from '../help/content';

const HIDDEN_UNTIL_PLACED = { left: 0, top: 0, visibility: 'hidden' } as const;
const GAP = 8;
const EDGE = 8;

/**
 * An (i) button that explains a control. The bubble opens on mouse hover, on a click or tap (the next one closes it)
 * and when the button gets focus from the keyboard or the piano keys (C1 presses the focused button, so it closes
 * and reopens it). Escape closes it. The button is the only focusable part, so the bubble never traps focus.
 */
export function HelpBubble({ id }: { id: HelpId }) {
  const entry = HELP[id];
  const bubbleId = useId();
  const [state, dispatch] = useReducer(bubbleReduce, BUBBLE_CLOSED);
  const visible = bubbleVisible(state);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  // Place it under the button (above when there is no room), kept inside the screen. Fixed to the viewport, so a
  // scrolling or transformed parent cannot clip it.
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const b = button.current?.getBoundingClientRect();
      const t = bubble.current;
      if (!b || !t) return;
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), window.innerWidth - w - EDGE);
      const below = b.bottom + GAP;
      const top = below + h <= window.innerHeight - EDGE || b.top - GAP - h < EDGE ? below : b.top - GAP - h;
      t.style.left = `${left}px`;
      t.style.top = `${top}px`;
      t.style.visibility = 'visible';
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible]);

  // A press anywhere else closes a bubble that a tap opened.
  useEffect(() => {
    if (!state.open) return;
    const away = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node)) dispatch({ type: 'outside' });
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [state.open]);

  // Escape closes it, whether the mouse or the focus opened it.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dispatch({ type: 'escape' });
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  return (
    <>
      <button
        ref={button}
        className="help-btn"
        type="button"
        data-testid={`help-${id}`}
        data-help={id}
        aria-label={`Help: ${entry.title}`}
        aria-expanded={visible}
        aria-describedby={visible ? bubbleId : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && dispatch({ type: 'hover', on: true })}
        onPointerLeave={(e) => e.pointerType === 'mouse' && dispatch({ type: 'hover', on: false })}
        onPointerDown={() => dispatch({ type: 'pointerdown' })}
        onFocus={() => dispatch({ type: 'focus' })}
        onBlur={() => dispatch({ type: 'blur' })}
        onClick={() => dispatch({ type: 'click' })}
      >
        <span className="help-glyph" aria-hidden="true">
          i
        </span>
      </button>
      {visible &&
        createPortal(
          <div
            ref={bubble}
            id={bubbleId}
            className="help-bubble"
            role="tooltip"
            data-testid="help-bubble"
            data-help={id}
            style={HIDDEN_UNTIL_PLACED}
          >
            <strong>{entry.title}</strong>
            <p>{entry.text}</p>
            {entry.items && (
              <dl>
                {entry.items.map((i) => (
                  <div key={i.term}>
                    <dt>{i.term}</dt>
                    <dd>{i.text}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
