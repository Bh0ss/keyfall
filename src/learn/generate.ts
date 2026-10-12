import { KEY_SIGS, WRITTEN_RANGE, applyKeySig, signatureText } from './keysig';
import { beatsLabel, symbolById } from './rhythm';
import { noteWeight, type ReviewEntry } from './review';
import { isBlackKey, type Spell } from './staff';
import { taughtSymbolsThrough, taughtThrough, type LessonDef, type Unit } from './units';

export type PromptKind = 'key-finder' | 'note-flash' | 'both-hands' | 'rhythm-name' | 'rhythm-beats' | 'keysig-name' | 'in-key';

/** Kinds answered by pressing one key (the original pitch prompts). */
const NOTE_KINDS: ReadonlySet<PromptKind> = new Set(['key-finder', 'note-flash']);

export interface Choice {
  id: string;
  label: string;
}

export interface Prompt {
  kind: PromptKind;
  /**
   * The answer's review id: a pitch for key prompts, a rhythm symbol (200+) or a key signature (300+) for the
   * others. For a two-hand set it is the right-hand note.
   */
  midi: number;
  /** Two-hand prompts: every key to press together. */
  set?: number[];
  /** Black keys: which name the prompt shows. */
  spell?: Spell;
  /** Rhythm prompts: the symbol drawn. */
  symbol?: number;
  /** Key-signature prompts: the signature id. */
  sig?: string;
  /** In-key prompts: the white note as written on the staff. */
  written?: number;
  /** Choice prompts: the buttons and the id of the right one. */
  choices?: Choice[];
  answer?: string;
}

/** The review ids a prompt exercises. */
export const reviewIds = (p: Prompt): number[] => p.set ?? [p.midi];

function pickWeighted(pool: Map<number, number>, rng: () => number, prev?: number): number {
  if (pool.size > 1 && prev !== undefined) pool.delete(prev);
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let id = [...pool.keys()][0]!;
  for (const [m, w] of pool) {
    id = m;
    roll -= w;
    if (roll < 0) break;
  }
  return id;
}

/** Own ids weigh 1 plus their queue weight; queued ids taught in earlier units can also appear; nothing untaught. */
function buildPool(own: readonly number[], taught: ReadonlySet<number>, queue: ReadonlyMap<number, ReviewEntry>): Map<number, number> {
  const ownSet = new Set(own);
  const pool = new Map<number, number>();
  for (const id of own) pool.set(id, 1 + noteWeight(queue.get(id)));
  for (const [id, entry] of queue) {
    if (!ownSet.has(id) && taught.has(id) && noteWeight(entry) > 0) pool.set(id, noteWeight(entry));
  }
  return pool;
}

function notePool(unit: Unit, queue: ReadonlyMap<number, ReviewEntry>): Map<number, number> {
  return buildPool(unit.notes, new Set(taughtThrough(unit.number)), queue);
}

/** A black key shows as a sharp or a flat, at random. */
function withSpell(p: Prompt, rng: () => number): Prompt {
  return isBlackKey(p.midi) ? { ...p, spell: rng() < 0.5 ? 'sharp' : 'flat' } : p;
}

function bothHands(unit: Unit, queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const rights = unit.notes.filter((m) => m >= 60);
  const lefts = unit.notes.filter((m) => m < 60);
  const weigh = (ids: number[]) => new Map(ids.map((m) => [m, 1 + noteWeight(queue.get(m))]));
  const right = pickWeighted(weigh(rights), rng, prev);
  const left = pickWeighted(weigh(lefts), rng);
  // A third above the right-hand note, when the unit teaches it, makes a chord across the two staves.
  const third = [3, 4].map((d) => right + d).find((m) => rights.includes(m));
  const chord = third !== undefined && rng() < 0.35;
  return { kind: 'both-hands', midi: right, set: chord ? [left, right, third!] : [left, right] };
}

function rhythmPrompt(kind: 'rhythm-name' | 'rhythm-beats', unit: Unit, queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const own = unit.symbols ?? [];
  const id = pickWeighted(buildPool(own, new Set(taughtSymbolsThrough(unit.number)), queue), rng, prev);
  const shown = [...new Set([...own, id])].map((i) => symbolById(i)!);
  if (kind === 'rhythm-name') {
    return { kind, midi: id, symbol: id, choices: shown.map((s) => ({ id: `s${s.id}`, label: s.name })), answer: `s${id}` };
  }
  const beats = [...new Set(shown.map((s) => s.beats))].sort((a, b) => a - b);
  return { kind, midi: id, symbol: id, choices: beats.map((b) => ({ id: `b${b}`, label: beatsLabel(b) })), answer: `b${symbolById(id)!.beats}` };
}

function keySigName(queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const rid = pickWeighted(new Map(KEY_SIGS.map((k) => [k.rid, 1 + noteWeight(queue.get(k.rid))])), rng, prev);
  const sig = KEY_SIGS.find((k) => k.rid === rid)!;
  return {
    kind: 'keysig-name',
    midi: rid,
    sig: sig.id,
    choices: KEY_SIGS.map((k) => ({ id: `k${k.id}`, label: `${k.name} · ${signatureText(k)}` })),
    answer: `k${sig.id}`,
  };
}

/** A white note written on the staff under a signature; the key to press is the one the signature turns it into. */
function inKey(queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const combos = KEY_SIGS.flatMap((sig) => WRITTEN_RANGE.map((written) => ({ sig, written, played: applyKeySig(sig, written) })));
  const usable = combos.length > 1 && prev !== undefined ? combos.filter((c) => c.played !== prev) : combos;
  // Notes the signature changes are the point of the lesson, so they weigh double.
  const weights = usable.map((c) => (c.played !== c.written ? 2 : 1) + noteWeight(queue.get(c.played)));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  let chosen = usable[0]!;
  for (let i = 0; i < usable.length; i++) {
    chosen = usable[i]!;
    roll -= weights[i]!;
    if (roll < 0) break;
  }
  return { kind: 'in-key', midi: chosen.played, sig: chosen.sig.id, written: chosen.written };
}

/**
 * Next prompt for a lesson. The pool is the unit's own items plus any queued review items taught in earlier
 * units (never an untaught one). Queued items weigh more until answered right 3 times in a row.
 * The item just asked is skipped so the same one never comes up twice in a row.
 */
export function makePrompt(unit: Unit, lesson: LessonDef, queue: ReadonlyMap<number, ReviewEntry>, rng: () => number, prev?: number): Prompt {
  const kinds = lesson.kinds ?? [];
  if (kinds.every((k) => NOTE_KINDS.has(k))) {
    const midi = pickWeighted(notePool(unit, queue), rng, prev);
    const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))] ?? 'key-finder';
    return withSpell({ kind, midi }, rng);
  }
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))]!;
  switch (kind) {
    case 'key-finder':
    case 'note-flash':
      return withSpell({ kind, midi: pickWeighted(notePool(unit, queue), rng, prev) }, rng);
    case 'both-hands':
      return bothHands(unit, queue, rng, prev);
    case 'rhythm-name':
    case 'rhythm-beats':
      return rhythmPrompt(kind, unit, queue, rng, prev);
    case 'keysig-name':
      return keySigName(queue, rng, prev);
    case 'in-key':
      return inKey(queue, rng, prev);
  }
}
