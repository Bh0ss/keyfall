import { buildKeyboard, noteName } from './keyboardLayout';
import type { PressedKeys } from '../midi/pressed';

const { whites, blacks } = buildKeyboard();
const WHITE_W = 100 / whites.length;
const BLACK_W = WHITE_W * 0.62;

export function Keyboard({ pressed }: { pressed: PressedKeys }) {
  return (
    <div className="piano" role="group" aria-label="88-key keyboard">
      {whites.map((k) => {
        const on = pressed.has(k.midi);
        return (
          <div
            key={k.midi}
            className="key-white"
            data-midi={k.midi}
            data-pressed={on}
            aria-label={`${noteName(k.midi)}${on ? ' pressed' : ''}`}
          >
            {k.midi % 12 === 0 ? noteName(k.midi) : ''}
          </div>
        );
      })}
      {blacks.map((k) => (
        <div
          key={k.midi}
          className="key-black"
          data-midi={k.midi}
          data-pressed={pressed.has(k.midi)}
          aria-label={`${noteName(k.midi)}${pressed.has(k.midi) ? ' pressed' : ''}`}
          style={{ left: `${k.center * WHITE_W - BLACK_W / 2}%`, width: `${BLACK_W}%` }}
        />
      ))}
    </div>
  );
}
