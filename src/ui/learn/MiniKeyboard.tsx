import { isBlack, noteName } from '../keyboardLayout';

export type KeyMark = 'correct' | 'wrong' | 'target';

/** A short keyboard for lessons (the canvas shows eight keys). Black keys sit between the whites they straddle. */
export function MiniKeyboard({ range, marks, labels }: { range: [number, number]; marks: Record<number, KeyMark>; labels: boolean }) {
  const whites: number[] = [];
  const blacks: { midi: number; left: number }[] = [];
  for (let m = range[0]; m <= range[1]; m++) {
    if (isBlack(m)) blacks.push({ midi: m, left: whites.length });
    else whites.push(m);
  }
  const w = 100 / whites.length;
  return (
    <div className="mini-kb" data-testid="mini-keyboard">
      {whites.map((m) => (
        <div key={m} className="mini-key" data-mark={marks[m]} data-midi={m}>
          {labels ? noteName(m).replace(/\d/, '') : ''}
        </div>
      ))}
      {blacks.map((b) => (
        <div key={b.midi} className="mini-black" data-mark={marks[b.midi]} style={{ left: `${b.left * w - w * 0.3}%`, width: `${w * 0.6}%` }} />
      ))}
    </div>
  );
}
