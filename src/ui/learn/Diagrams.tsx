import type { Diagram, DiagramTone } from '../../learn/explainers';
import { isBlack, noteName } from '../keyboardLayout';

const WHITE_W = 40;
const BLACK_W = 24;
const TONE: Record<DiagramTone, string> = { right: 'var(--right-hand)', left: 'var(--left-hand)', accent: 'var(--accent)' };
const TEXT = { fill: 'var(--text)', fontFamily: 'var(--font-body)' } as const;
const MUTED = { fill: 'var(--muted)', fontFamily: 'var(--font-body)' } as const;

type Keyboard = Extract<Diagram, { kind: 'keyboard' }>;

function KeyboardDiagram({ d, alt }: { d: Keyboard; alt: string }) {
  const whites: number[] = [];
  const blacks: { midi: number; at: number }[] = [];
  for (let m = d.range[0]; m <= d.range[1]; m++) {
    if (isBlack(m)) blacks.push({ midi: m, at: whites.length });
    else whites.push(m);
  }
  const width = Math.max(whites.length * WHITE_W, 240);
  const x0 = (width - whites.length * WHITE_W) / 2;
  const top = 30;
  const keyH = 96;
  const marks = new Set(d.marks ?? []);
  const centre = (m: number) => {
    const w = whites.indexOf(m);
    if (w >= 0) return x0 + w * WHITE_W + WHITE_W / 2;
    const b = blacks.find((k) => k.midi === m);
    return b ? x0 + b.at * WHITE_W : x0;
  };
  // Runs of adjacent black keys are the landmark groups (two, then three).
  const groups: { first: number; last: number }[] = [];
  if (d.groups) {
    for (const b of blacks) {
      const run = groups[groups.length - 1];
      if (run && b.midi - run.last <= 2) run.last = b.midi;
      else groups.push({ first: b.midi, last: b.midi });
    }
  }
  const below = top + keyH;
  const zoneY = below + (d.fingers && Object.keys(d.fingers).length ? 30 : 10);
  const height = zoneY + (d.zones?.length ? 40 : 10);
  return (
    <svg className="diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={alt} data-testid="diagram-keyboard">
      {whites.map((m, i) => (
        <g key={m}>
          <rect x={x0 + i * WHITE_W + 1} y={top} width={WHITE_W - 2} height={keyH} rx={5} style={{ fill: marks.has(m) ? 'var(--accent)' : '#f4f1ea', stroke: '#9ba0aa' }} />
          <text x={x0 + i * WHITE_W + WHITE_W / 2} y={top + keyH - 8} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: marks.has(m) ? 'var(--accent-ink)' : '#4a5160', fontFamily: 'var(--font-display)' }}>
            {noteName(m).replace(/\d/, '')}
          </text>
        </g>
      ))}
      {blacks.map((b) => (
        <rect key={b.midi} x={x0 + b.at * WHITE_W - BLACK_W / 2} y={top} width={BLACK_W} height={keyH * 0.6} rx={4} style={{ fill: marks.has(b.midi) ? 'var(--accent)' : '#1e2430', stroke: marks.has(b.midi) ? 'var(--accent-ink)' : '#000' }} />
      ))}
      {groups.map((g) => {
        const a = centre(g.first) - BLACK_W / 2;
        const b = centre(g.last) + BLACK_W / 2;
        const n = blacks.filter((k) => k.midi >= g.first && k.midi <= g.last).length;
        return (
          <g key={g.first} data-group={n}>
            <path d={`M ${a} ${top - 6} v -6 H ${b} v 6`} fill="none" strokeWidth={2} style={{ stroke: 'var(--right-hand)' }} />
            <text x={(a + b) / 2} y={top - 17} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: 'var(--right-hand)', fontFamily: 'var(--font-body)' }}>
              {n} black {n === 1 ? 'key' : 'keys'}
            </text>
          </g>
        );
      })}
      {Object.entries(d.fingers ?? {}).map(([m, f]) => (
        <g key={m}>
          <circle cx={centre(Number(m))} cy={below + 15} r={11} style={{ fill: 'var(--surface)', stroke: 'var(--accent)' }} strokeWidth={2} />
          <text x={centre(Number(m))} y={below + 20} textAnchor="middle" fontSize={14} fontWeight={700} style={TEXT}>
            {f}
          </text>
        </g>
      ))}
      {(d.zones ?? []).map((z) => {
        const a = centre(z.from) - WHITE_W / 2 + 2;
        const b = centre(z.to) + WHITE_W / 2 - 2;
        return (
          <g key={`${z.from}-${z.to}`}>
            <rect x={a} y={zoneY} width={b - a} height={6} rx={3} style={{ fill: TONE[z.tone] }} />
            <text x={(a + b) / 2} y={zoneY + 22} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: TONE[z.tone], fontFamily: 'var(--font-body)' }}>
              {z.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PostureDiagram({ alt }: { alt: string }) {
  const line = { stroke: 'var(--text)', strokeWidth: 5, strokeLinecap: 'round', fill: 'none' } as const;
  return (
    <svg className="diagram" viewBox="0 0 340 200" role="img" aria-label={alt} data-testid="diagram-posture">
      <path d="M 10 176 H 330" strokeWidth={2} style={{ stroke: 'var(--border)' }} />
      <rect x={40} y={124} width={80} height={9} rx={3} style={{ fill: 'var(--muted)' }} />
      <path d="M 52 133 V 176 M 108 133 V 176" strokeWidth={4} style={{ stroke: 'var(--muted)' }} />
      <rect x={236} y={72} width={94} height={34} rx={4} style={{ fill: 'var(--surface)', stroke: 'var(--border)' }} />
      <rect x={196} y={104} width={134} height={10} rx={3} style={{ fill: '#f4f1ea' }} />
      <path d="M 80 124 L 84 64" style={line} />
      <circle cx={88} cy={42} r={15} style={{ fill: 'var(--text)' }} />
      <path d="M 84 66 L 114 100 L 186 100" style={{ ...line, stroke: 'var(--right-hand)' }} />
      <path d="M 80 124 H 156 V 172 H 182" style={line} />
      <path d="M 114 100 H 200" strokeWidth={1.5} strokeDasharray="5 5" style={{ stroke: 'var(--accent)' }} />
      <text x={118} y={86} fontSize={13} fontWeight={700} style={{ fill: 'var(--accent)', fontFamily: 'var(--font-body)' }}>
        forearm level
      </text>
      <text x={118} y={36} fontSize={13} style={MUTED}>
        tall, relaxed back
      </text>
      <text x={196} y={150} fontSize={13} style={MUTED}>
        feet flat on the floor
      </text>
    </svg>
  );
}

const FINGER_H: Record<number, number> = { 1: 46, 2: 66, 3: 76, 4: 66, 5: 50 };

function Hand({ side, x }: { side: 'right' | 'left'; x: number }) {
  const order = side === 'right' ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
  const tone = side === 'right' ? 'var(--right-hand)' : 'var(--left-hand)';
  return (
    <g data-hand={side}>
      <rect x={x} y={96} width={5 * 26 + 2} height={46} rx={12} style={{ fill: 'var(--raised)', stroke: tone }} strokeWidth={2} />
      {order.map((f, i) => {
        const h = FINGER_H[f]!;
        const lower = f === 1 ? 26 : 0;
        const fx = x + 1 + i * 26;
        return (
          <g key={f}>
            <rect x={fx} y={100 - h + lower} width={24} height={h} rx={11} style={{ fill: 'var(--raised)', stroke: tone }} strokeWidth={2} />
            <text x={fx + 12} y={100 - h + lower + 20} textAnchor="middle" fontSize={16} fontWeight={800} style={{ fill: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              {f}
            </text>
          </g>
        );
      })}
      <text x={x + 65} y={166} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: tone, fontFamily: 'var(--font-body)' }}>
        {side === 'right' ? 'Right hand' : 'Left hand'}
      </text>
    </g>
  );
}

function HandsDiagram({ hands, alt }: { hands: 'right' | 'left' | 'both'; alt: string }) {
  const both = hands === 'both';
  return (
    <svg className="diagram" viewBox={both ? '0 0 340 180' : '0 0 170 180'} role="img" aria-label={alt} data-testid="diagram-hands" style={{ maxWidth: both ? 420 : 220 }}>
      {(both || hands === 'left') && <Hand side="left" x={both ? 14 : 20} />}
      {(both || hands === 'right') && <Hand side="right" x={both ? 196 : 20} />}
    </svg>
  );
}

const STEPS = { treble: ['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F'], bass: ['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'] } as const;

function StaffDiagram({ clef, alt }: { clef: 'treble' | 'bass'; alt: string }) {
  const bottom = 104;
  const half = 8;
  return (
    <svg className="diagram" viewBox="0 0 340 170" role="img" aria-label={alt} data-testid="diagram-staff">
      <text x={14} y={22} fontSize={13} fontWeight={700} style={{ fill: 'var(--right-hand)', fontFamily: 'var(--font-body)' }}>
        {clef === 'treble' ? 'Treble staff' : 'Bass staff'}
      </text>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M 14 ${bottom - i * 2 * half} H 326`} strokeWidth={1.5} style={{ stroke: 'var(--muted)' }} />
      ))}
      {STEPS[clef].map((letter, i) => {
        const x = 34 + i * 34;
        const y = bottom - i * half;
        const line = i % 2 === 0;
        return (
          <g key={i} data-line={line ? 'true' : undefined}>
            <ellipse cx={x} cy={y} rx={11} ry={7} style={{ fill: line ? 'var(--accent)' : 'var(--right-hand)', stroke: 'var(--bg)' }} strokeWidth={2} />
            <text x={x} y={bottom + 34} textAnchor="middle" fontSize={15} fontWeight={800} style={{ fill: line ? 'var(--accent)' : 'var(--right-hand)', fontFamily: 'var(--font-display)' }}>
              {letter}
            </text>
          </g>
        );
      })}
      <text x={14} y={160} fontSize={12} style={MUTED}>
        Amber notes sit on a line, blue notes sit in a space.
      </text>
    </svg>
  );
}

function BeatsDiagram({ d, alt }: { d: Extract<Diagram, { kind: 'beats' }>; alt: string }) {
  const slot = 56;
  const width = d.counts.length * slot + 20;
  const starts = d.bars.map((_, i) => d.bars.slice(0, i).reduce((a, b) => a + b.span, 0));
  return (
    <svg className="diagram" viewBox={`0 0 ${width} 100`} role="img" aria-label={alt} data-testid="diagram-beats">
      {d.counts.map((c, i) => (
        <text key={i} x={10 + i * slot + slot / 2} y={22} textAnchor="middle" fontSize={c === '&' ? 16 : 20} fontWeight={800} style={{ fill: c === '&' ? 'var(--muted)' : 'var(--text)', fontFamily: 'var(--font-display)' }}>
          {c}
        </text>
      ))}
      {d.bars.map((b, i) => {
        const x = 10 + starts[i]! * slot;
        return (
          <g key={i}>
            <rect x={x + 2} y={36} width={b.span * slot - 4} height={44} rx={8} style={{ fill: 'var(--raised)', stroke: 'var(--accent)' }} strokeWidth={2} />
            <text x={x + (b.span * slot) / 2} y={63} textAnchor="middle" fontSize={13} fontWeight={700} style={TEXT}>
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The small picture on an explainer card. Drawn from data, no images. */
export function DiagramView({ diagram, alt }: { diagram: Diagram; alt: string }) {
  switch (diagram.kind) {
    case 'keyboard':
      return <KeyboardDiagram d={diagram} alt={alt} />;
    case 'posture':
      return <PostureDiagram alt={alt} />;
    case 'hands':
      return <HandsDiagram hands={diagram.hands} alt={alt} />;
    case 'staff':
      return <StaffDiagram clef={diagram.clef} alt={alt} />;
    case 'beats':
      return <BeatsDiagram d={diagram} alt={alt} />;
  }
}
