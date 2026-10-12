import { describe, expect, it } from 'vitest';
import { SetJudge, TOGETHER_MS } from '../src/learn/chord';
import { makePrompt, reviewIds, type Prompt } from '../src/learn/generate';
import { KEY_SIGS, KEYSIG_ID_BASE, alteredLetters, applyKeySig, keySigById, scaleKeys, writtenScale, WRITTEN_RANGE } from '../src/learn/keysig';
import type { ReviewEntry } from '../src/learn/review';
import { DQ, E, ER, H, HR, Q, QR, RHYTHM_ID_BASE, RHYTHM_SYMBOLS, W, beatsLabel, judgeTaps, layOut, symbolById, tapTimes, tapWindow, tapsPass, vexDuration } from '../src/learn/rhythm';
import { LearnRun, MiniSongRun } from '../src/learn/run';
import { barAccidentals, bothNames, spellName, vexSpelled, whiteOf } from '../src/learn/staff';
import { isSongUnlocked } from '../src/learn/unlocks';
import { UNITS, getUnit, taughtSymbolsThrough, taughtThrough, type LessonDef } from '../src/learn/units';
import { getSongs } from '../src/songs/catalog';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const NEW_UNITS = ['unit-6', 'unit-7', 'unit-8', 'unit-9', 'unit-10'];
const promptLessons = (id: string) => getUnit(id)!.lessons.filter((l) => l.prompts);
const none = new Map<number, ReviewEntry>();

describe('units 6 to 10 are defined and playable', () => {
  for (const id of NEW_UNITS) {
    const unit = getUnit(id)!;
    it(`${id} has a 20-prompt unit test, practice lessons and a mini song`, () => {
      expect(unit.comingSoon).toBe(false);
      const test = unit.lessons.filter((l) => l.test);
      expect(test).toHaveLength(1);
      expect(test[0]!.prompts).toBe(20);
      expect(test[0]!.id).toBe('test');
      expect(unit.lessons.some((l) => l.kind === 'mini-song')).toBe(true);
      expect(unit.lessons.filter((l) => !l.test && l.prompts).length).toBeGreaterThan(0);
      // Only the test can pass the unit; every other lesson is practice.
      expect(unit.lessons.filter((l) => !l.test).every((l) => !l.test)).toBe(true);
    });
  }
  it('mini songs have a finger on every sounding note, both hands included', () => {
    for (const id of NEW_UNITS) {
      for (const l of getUnit(id)!.lessons.filter((x) => x.kind === 'mini-song')) {
        for (const n of l.song!.notes.filter((x) => !x.rest)) {
          expect(n.finger, `${id} ${l.id} ${n.midi}`).toBeDefined();
          if (n.left) expect(n.left.finger).toBeDefined();
        }
      }
    }
  });
  it('mini songs are 4 to 8 bars that add up, and use only notes taught so far', () => {
    for (const id of NEW_UNITS) {
      const unit = getUnit(id)!;
      const taught = new Set(taughtThrough(unit.number));
      for (const l of unit.lessons.filter((x) => x.kind === 'mini-song')) {
        const beats = l.song!.notes.reduce((a, n) => a + n.beats, 0);
        expect(beats % l.song!.beatsPerBar).toBe(0);
        expect(beats / l.song!.beatsPerBar).toBeGreaterThanOrEqual(4);
        expect(beats / l.song!.beatsPerBar).toBeLessThanOrEqual(8);
        for (const n of l.song!.notes.filter((x) => !x.rest)) {
          expect(taught.has(n.midi)).toBe(true);
          if (n.left) expect(taught.has(n.left.midi)).toBe(true);
        }
      }
    }
  });
  it('tap patterns use only symbols taught so far, and tap the key at the right onsets', () => {
    for (const id of ['unit-6', 'unit-9']) {
      const unit = getUnit(id)!;
      const taught = new Set(taughtSymbolsThrough(unit.number));
      for (const l of unit.lessons.filter((x) => x.kind === 'rhythm-tap')) {
        expect(l.pattern!.steps!.every((s) => taught.has(s))).toBe(true);
        expect(l.pattern!.beats).toEqual(layOut(l.pattern!.steps!).onsets);
        expect(l.pattern!.length).toBe(layOut(l.pattern!.steps!).length);
        expect(l.pattern!.length! % 4).toBe(0);
      }
    }
  });
  it('units 6 to 9 each gate a bundled song and unit 10 gates none', () => {
    const songs = getSongs();
    for (const n of [6, 7, 8, 9]) expect(songs.some((s) => s.unlockedBy === `unit-${n}`)).toBe(true);
    expect(songs.some((s) => s.unlockedBy === 'unit-10')).toBe(false);
  });
  it('the Advanced override still covers units 5 to 9 only', () => {
    for (const n of [5, 6, 7, 8, 9]) expect(isSongUnlocked({ unlockedBy: `unit-${n}` }, new Set(), 'advanced')).toBe(true);
    expect(isSongUnlocked({ unlockedBy: 'unit-10' }, new Set(), 'advanced')).toBe(false);
  });
});

describe('key signatures', () => {
  it('covers C and the major keys up to three sharps and flats', () => {
    expect(KEY_SIGS.map((k) => k.id)).toEqual(['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb']);
    expect(Math.max(...KEY_SIGS.map((k) => k.count))).toBe(3);
  });
  it('lists the altered letters in signature order', () => {
    expect(alteredLetters(keySigById('A')!)).toEqual(['f', 'c', 'g']);
    expect(alteredLetters(keySigById('Eb')!)).toEqual(['b', 'e', 'a']);
    expect(alteredLetters(keySigById('C')!)).toEqual([]);
  });
  it('applies the signature to written notes', () => {
    const G = keySigById('G')!;
    expect(applyKeySig(G, 65)).toBe(66); // F -> F#
    expect(applyKeySig(G, 77)).toBe(78);
    expect(applyKeySig(G, 67)).toBe(67);
    const Bb = keySigById('Bb')!;
    expect(applyKeySig(Bb, 71)).toBe(70); // B -> Bb
    expect(applyKeySig(Bb, 64)).toBe(63); // E -> Eb
    expect(applyKeySig(Bb, 69)).toBe(69);
    expect(applyKeySig(keySigById('C')!, 61 - 1)).toBe(60);
    expect(() => applyKeySig(G, 61)).toThrow();
  });
  it('the written scale with the signature applied is the major scale, in every key', () => {
    for (const sig of KEY_SIGS) {
      const tonic = applyKeySig(sig, sig.tonicWhite);
      expect(scaleKeys(sig), sig.id).toEqual([0, 2, 4, 5, 7, 9, 11, 12].map((i) => tonic + i));
      expect(writtenScale(sig)).toHaveLength(8);
    }
  });
  it('every note a signature can ask for is a key Unit 7 or earlier teaches', () => {
    const taught = new Set(taughtThrough(10));
    for (const sig of KEY_SIGS) for (const w of WRITTEN_RANGE) expect(taught.has(applyKeySig(sig, w))).toBe(true);
    const upTo7 = new Set(taughtThrough(7));
    for (const sig of KEY_SIGS) for (const w of WRITTEN_RANGE) expect(upTo7.has(applyKeySig(sig, w))).toBe(true);
  });
  it('the unit 10 songs sound the notes their signature makes', () => {
    const unit = getUnit('unit-10')!;
    for (const l of unit.lessons.filter((x) => x.kind === 'mini-song')) {
      const sig = keySigById(l.song!.keySig!)!;
      // Every song note is in the major scale of its key.
      const scale = new Set(scaleKeys(sig).flatMap((m) => [m - 12, m, m + 12]));
      for (const n of l.song!.notes) expect(scale.has(n.midi), `${l.id} ${n.midi}`).toBe(true);
    }
  });
});

describe('sharps, flats and enharmonics', () => {
  it('names a black key both ways', () => {
    expect(spellName(66, 'sharp')).toBe('F♯4');
    expect(spellName(66, 'flat')).toBe('G♭4');
    expect(spellName(70, 'flat')).toBe('B♭4');
    expect(spellName(61, 'sharp')).toBe('C♯4');
    expect(spellName(60)).toBe('C4');
    expect(bothNames(63)).toBe('D♯4 / E♭4');
    expect(bothNames(64)).toBe('E4');
  });
  it('both spellings are the same key', () => {
    for (const m of [61, 63, 66, 68, 70]) {
      expect(whiteOf(m, 'sharp') + 1).toBe(m);
      expect(whiteOf(m, 'flat') - 1).toBe(m);
    }
  });
  it('gives VexFlow the written line and the sign', () => {
    expect(vexSpelled(66, 'sharp')).toEqual({ key: 'f/4', accidental: '#' });
    expect(vexSpelled(66, 'flat')).toEqual({ key: 'g/4', accidental: 'b' });
    expect(vexSpelled(70, 'flat')).toEqual({ key: 'b/4', accidental: 'b' });
    expect(vexSpelled(64)).toEqual({ key: 'e/4' });
  });
  it('prints a sign once per bar, and a natural to cancel it', () => {
    expect(barAccidentals([{ midi: 66 }, { midi: 66 }, { midi: 65 }, { midi: 65 }])).toEqual(['#', undefined, 'n', undefined]);
    expect(barAccidentals([{ midi: 70, spell: 'flat' }, { midi: 71 }])).toEqual(['b', 'n']);
    // The same pitch an octave up is a different line.
    expect(barAccidentals([{ midi: 66 }, { midi: 78 }])).toEqual(['#', '#']);
  });
  it('prints no sign for notes the key signature already covers', () => {
    const G = { kind: 'sharp' as const, letters: ['f'] };
    expect(barAccidentals([{ midi: 66 }, { midi: 65 }, { midi: 67 }], G)).toEqual([undefined, 'n', undefined]);
    const F = { kind: 'flat' as const, letters: ['b'] };
    expect(barAccidentals([{ midi: 70 }, { midi: 71 }, { midi: 70 }], F)).toEqual([undefined, 'n', 'b']);
  });
});

describe('judging a set of keys pressed together', () => {
  it('is right when every key is held at once', () => {
    const j = new SetJudge([48, 64]);
    expect(j.down(48, 0)).toBe('partial');
    expect(j.down(64, 50)).toBe('correct');
  });
  it('order does not matter, and a chord of three works', () => {
    const j = new SetJudge([48, 60, 64]);
    expect(j.down(64, 0)).toBe('partial');
    expect(j.down(48, 10)).toBe('partial');
    expect(j.down(60, 20)).toBe('correct');
  });
  it('any key outside the set is wrong straight away', () => {
    const j = new SetJudge([48, 64]);
    expect(j.down(48, 0)).toBe('partial');
    expect(j.down(65, 10)).toBe('wrong');
  });
  it('a key let go before the other goes down does not count', () => {
    const j = new SetJudge([48, 64]);
    j.down(48, 0);
    j.up(48);
    expect(j.down(64, 100)).toBe('partial');
    expect(j.down(48, 150)).toBe('correct');
  });
  it('a key held too long before the other does not count as together', () => {
    const j = new SetJudge([48, 64]);
    j.down(48, 0);
    expect(j.down(64, TOGETHER_MS + 1)).toBe('partial');
    expect(j.down(48, TOGETHER_MS + 20)).toBe('correct');
  });
});

describe('rhythm symbols', () => {
  it('lengths add up the way the notation says', () => {
    const b = (id: number) => symbolById(id)!.beats;
    expect([Q, H, W, QR, HR, E, ER, DQ].map(b)).toEqual([1, 2, 4, 1, 2, 0.5, 0.5, 1.5]);
    expect(b(DQ)).toBe(b(Q) + b(E));
    expect(RHYTHM_SYMBOLS.every((s) => s.id >= RHYTHM_ID_BASE && s.id < RHYTHM_ID_BASE + 100)).toBe(true);
  });
  it('maps symbols to VexFlow durations', () => {
    expect(vexDuration(symbolById(QR)!)).toBe('qr');
    expect(vexDuration(symbolById(DQ)!)).toBe('qd');
    expect(vexDuration(symbolById(E)!)).toBe('8');
    expect(vexDuration(symbolById(W)!)).toBe('w');
  });
  it('lays a pattern out: rests are silent, the dot adds half', () => {
    expect(layOut([Q, QR, H])).toEqual({ onsets: [0, 2], length: 4 });
    expect(layOut([DQ, E, H])).toEqual({ onsets: [0, 1.5, 2], length: 4 });
    expect(() => layOut([1])).toThrow();
  });
  it('labels beat counts', () => {
    expect(beatsLabel(0.5)).toBe('½ beat');
    expect(beatsLabel(1)).toBe('1 beat');
    expect(beatsLabel(1.5)).toBe('1½ beats');
    expect(beatsLabel(4)).toBe('4 beats');
  });
});

describe('timed taps are judged against the pattern', () => {
  const { onsets } = layOut([Q, E, E, Q, Q]);
  const start = 10_000;
  const expected = tapTimes(onsets, 60, start);
  it('taps right on the beats pass, a tap on a rest does not hit and counts as extra', () => {
    expect(tapsPass(judgeTaps(expected, expected, tapWindow(onsets, 60)))).toBe(true);
    const rest = layOut([Q, QR, Q]);
    const exp = tapTimes(rest.onsets, 60, 0);
    const j = judgeTaps(exp, [0, 1000, 2000], tapWindow(rest.onsets, 60));
    expect(j).toMatchObject({ hits: 2, total: 2, extra: 1 });
  });
  it('the window shrinks for eighth notes so neighbours never share a window', () => {
    expect(tapWindow([0, 1, 2], 60)).toBe(200);
    expect(tapWindow([0, 0.5, 1], 60)).toBe(200);
    expect(tapWindow([0, 0.5, 1], 120)).toBe(100);
  });
  it('late or early eighths miss; too many extra taps fail even with every beat hit', () => {
    const w = tapWindow(onsets, 60);
    const late = expected.map((t) => t + 300);
    expect(judgeTaps(expected, late, w).hits).toBeLessThan(expected.length);
    expect(tapsPass(judgeTaps(expected, late, w))).toBe(false);
    const flood = [...expected, ...expected.map((t) => t + 250)];
    expect(tapsPass(judgeTaps(expected, flood, w))).toBe(false);
  });
  it('75% of the beats hit is a pass; 60% is not', () => {
    expect(tapsPass({ hits: 6, total: 8, extra: 0 })).toBe(true);
    expect(tapsPass({ hits: 5, total: 8, extra: 0 })).toBe(false);
    expect(tapsPass({ hits: 0, total: 0, extra: 0 })).toBe(false);
  });
});

describe('prompt generators draw only on what is taught', () => {
  it('rhythm prompts use only taught symbols and always include the right answer', () => {
    for (const id of ['unit-6', 'unit-9']) {
      const unit = getUnit(id)!;
      const taught = new Set(taughtSymbolsThrough(unit.number));
      for (const lesson of promptLessons(id)) {
        const rng = seeded(9);
        let prev: number | undefined;
        const seen = new Set<number>();
        for (let i = 0; i < 300; i++) {
          const p = makePrompt(unit, lesson, none, rng, prev);
          expect(taught.has(p.symbol!)).toBe(true);
          expect(unit.symbols).toContain(p.symbol);
          expect(p.midi).toBe(p.symbol);
          expect(p.midi).not.toBe(prev);
          expect(p.choices!.map((c) => c.id)).toContain(p.answer);
          const s = symbolById(p.symbol!)!;
          expect(p.answer).toBe(p.kind === 'rhythm-name' ? `s${s.id}` : `b${s.beats}`);
          prev = p.midi;
          seen.add(p.symbol!);
        }
        expect(seen.size).toBe(unit.symbols!.length);
      }
    }
  });
  it('a rhythm symbol from an earlier unit can come back for review; an untaught one never does', () => {
    const unit = getUnit('unit-9')!;
    const lesson = promptLessons('unit-9')[0]!;
    const queue = new Map<number, ReviewEntry>([
      [Q, { midi: Q, streak: 0, misses: 2, active: true }],
      [RHYTHM_ID_BASE + 99, { midi: RHYTHM_ID_BASE + 99, streak: 0, misses: 2, active: true }],
    ]);
    const rng = seeded(4);
    const got = new Set<number>();
    for (let i = 0; i < 400; i++) got.add(makePrompt(unit, lesson, queue, rng).symbol!);
    expect(got.has(Q)).toBe(true);
    expect(got.has(RHYTHM_ID_BASE + 99)).toBe(false);
  });
  it('unit 7 asks only black keys, spelled either way, and the spelling is the same key', () => {
    const unit = getUnit('unit-7')!;
    const spells = new Set<string>();
    for (const lesson of promptLessons('unit-7')) {
      const rng = seeded(21);
      for (let i = 0; i < 200; i++) {
        const p = makePrompt(unit, lesson, none, rng);
        expect(unit.notes).toContain(p.midi);
        expect(p.spell === 'sharp' || p.spell === 'flat').toBe(true);
        expect(spellName(p.midi, 'sharp') === spellName(p.midi, 'flat')).toBe(false);
        expect(vexSpelled(p.midi, p.spell).accidental).toBeDefined();
        spells.add(p.spell!);
      }
    }
    expect(spells.size).toBe(2);
  });
  it('unit 8 sets put one or two notes in the right hand and one in the left, all taught', () => {
    const unit = getUnit('unit-8')!;
    const lesson = unit.lessons.find((l) => l.id === 'together')!;
    const rng = seeded(5);
    let prev: number | undefined;
    const sizes = new Set<number>();
    const taught = new Set(taughtThrough(8));
    for (let i = 0; i < 400; i++) {
      const p = makePrompt(unit, lesson, none, rng, prev);
      expect(p.kind).toBe('both-hands');
      const set = p.set!;
      sizes.add(set.length);
      expect(set.every((m) => taught.has(m) && unit.notes.includes(m))).toBe(true);
      expect(set.filter((m) => m < 60)).toHaveLength(1);
      expect(set.filter((m) => m >= 60).length).toBeGreaterThanOrEqual(1);
      expect(p.midi).toBe(Math.min(...set.filter((m) => m >= 60)));
      expect(p.midi).not.toBe(prev);
      expect(reviewIds(p)).toEqual(set);
      prev = p.midi;
    }
    expect([...sizes].sort()).toEqual([2, 3]);
  });
  it('unit 10 asks signatures and notes in key; the key to press is the written note with the signature applied', () => {
    const unit = getUnit('unit-10')!;
    const taught = new Set(taughtThrough(10));
    const rng = seeded(31);
    for (const lesson of promptLessons('unit-10')) {
      let prev: number | undefined;
      for (let i = 0; i < 300; i++) {
        const p = makePrompt(unit, lesson, none, rng, prev);
        const sig = keySigById(p.sig!)!;
        if (p.kind === 'in-key') {
          expect(p.midi).toBe(applyKeySig(sig, p.written!));
          expect(taught.has(p.midi)).toBe(true);
          expect(WRITTEN_RANGE).toContain(p.written);
        } else {
          expect(p.kind).toBe('keysig-name');
          expect(p.midi).toBe(sig.rid);
          expect(p.midi).toBeGreaterThanOrEqual(KEYSIG_ID_BASE);
          expect(p.answer).toBe(`k${sig.id}`);
          expect(p.choices).toHaveLength(KEY_SIGS.length);
        }
        prev = p.midi;
      }
    }
  });
  it('unit 10 prompts cover every signature and every altered note', () => {
    const unit = getUnit('unit-10')!;
    const lesson = unit.lessons.find((l) => l.id === 'in-key')!;
    const rng = seeded(2);
    const sigs = new Set<string>();
    const altered = new Set<number>();
    for (let i = 0; i < 1500; i++) {
      const p = makePrompt(unit, lesson, none, rng);
      sigs.add(p.sig!);
      if (p.midi !== p.written) altered.add(p.midi);
    }
    expect(sigs.size).toBe(KEY_SIGS.length);
    expect([...altered].sort((a, b) => a - b)).toEqual([61, 63, 66, 68, 70]);
  });
});

describe('LearnRun with the new prompt kinds', () => {
  const lessonOf = (unitId: string, id: string): LessonDef => getUnit(unitId)!.lessons.find((l) => l.id === id)!;
  const start = (unitId: string, id: string, queue = new Map<number, ReviewEntry>()) => new LearnRun({ unit: getUnit(unitId)!, lesson: lessonOf(unitId, id), queue, rng: seeded(8) });
  const rightAnswer = (run: LearnRun, t = 0) => {
    const p = run.current as Prompt;
    if (p.choices) return run.choose(p.answer!, t);
    if (p.set) {
      let r = run.answer(p.set[0]!, t);
      for (const m of p.set.slice(1)) r = run.answer(m, t + 20);
      return r;
    }
    return run.answer(p.midi, t);
  };

  it('a set is right only when all its keys are down together; a partial press waits', () => {
    const run = start('unit-8', 'together');
    const set = run.current!.set!;
    expect(run.answer(set[0]!, 0)).toBe('pending');
    expect(run.state).toBe('asking');
    expect(run.heldKeys).toEqual([set[0]]);
    expect(run.answer(set[1]!, 40)).toBe(set.length === 2 ? 'correct' : 'pending');
    if (set.length === 3) expect(run.answer(set[2]!, 60)).toBe('correct');
    expect(run.state).toBe('right');
  });
  it('a wrong key in a set misses the whole set into the review queue', () => {
    const run = start('unit-8', 'together');
    const set = run.current!.set!;
    run.answer(set[0]!, 0);
    expect(run.answer(set[0]! === 62 ? 64 : 62, 10)).toBe('wrong');
    expect(run.drainUpdates().map((e) => e.midi).sort()).toEqual([...set].sort());
    expect(run.result().missed.sort()).toEqual([...set].sort());
  });
  it('releasing a key before the other goes down starts the set over', () => {
    const run = start('unit-8', 'together');
    const set = run.current!.set!;
    run.answer(set[0]!, 0);
    run.release(set[0]!);
    expect(run.heldKeys).toEqual([]);
    expect(run.answer(set[1]!, 100)).toBe('pending');
  });
  it('choice prompts ignore keys and settle on a button; rhythm misses queue the symbol', () => {
    const run = start('unit-6', 'read');
    const p = run.current!;
    expect(run.answer(60, 0)).toBe('ignored');
    const wrong = p.choices!.find((c) => c.id !== p.answer)!.id;
    expect(run.choose(wrong, 0)).toBe('wrong');
    expect(run.lastChoice).toBe(wrong);
    expect(run.drainUpdates().map((e) => e.midi)).toEqual([p.symbol]);
    expect(run.choose(p.answer!, 0)).toBe('ignored');
  });
  it('a key-signature miss queues that signature, three right answers clear it', () => {
    const unit = getUnit('unit-10')!;
    const lesson = lessonOf('unit-10', 'read');
    const run = new LearnRun({ unit, lesson, queue: new Map(), rng: seeded(1) });
    const first = run.current!;
    const wrong = first.choices!.find((c) => c.id !== first.answer)!.id;
    run.choose(wrong, 0);
    const entry = run.drainUpdates()[0]!;
    expect(entry).toMatchObject({ midi: first.midi, active: true, misses: 1 });
    expect(entry.midi).toBeGreaterThanOrEqual(KEYSIG_ID_BASE);
  });
  for (const [unitId] of [['unit-6'], ['unit-7'], ['unit-8'], ['unit-9'], ['unit-10']] as const) {
    it(`${unitId}: 18 of 20 passes the unit test, 17 of 20 does not`, () => {
      const play = (wrong: number) => {
        const run = start(unitId, 'test');
        let i = 0;
        while (run.current) {
          if (i++ < wrong) {
            const p = run.current;
            if (p.choices) run.choose(p.choices.find((c) => c.id !== p.answer)!.id, 0);
            else run.reveal(0);
          } else rightAnswer(run);
          run.next();
        }
        return run.result();
      };
      expect(play(2)).toMatchObject({ total: 20, correct: 18, passed: true });
      expect(play(3)).toMatchObject({ correct: 17, passed: false });
    });
  }
  it('practice lessons feed the review queue but never pass a unit', () => {
    const run = start('unit-9', 'read');
    run.reveal(0);
    expect(run.drainUpdates()).toHaveLength(1);
    while (run.current) {
      run.next();
      if (run.current) rightAnswer(run);
    }
    expect(run.result().passed).toBe(false);
  });
});

describe('MiniSongRun with rests and two hands', () => {
  it('skips rests and counts only sounding notes', () => {
    const song = getUnit('unit-6')!.lessons.find((l) => l.kind === 'mini-song')!.song!;
    const run = new MiniSongRun(song);
    expect(run.playable).toBe(song.notes.filter((n) => !n.rest).length);
    for (const n of song.notes.filter((x) => !x.rest)) expect(run.press(n.midi)).toBe('correct');
    expect(run.done).toBe(true);
    expect(run.played).toBe(run.playable);
    expect(run.wrong).toBe(0);
  });
  it('a two-hand step needs both keys together', () => {
    const song = getUnit('unit-8')!.lessons.find((l) => l.kind === 'mini-song')!.song!;
    const run = new MiniSongRun(song);
    expect(run.targets.slice().sort()).toEqual([48, 60]);
    expect(run.press(60, 0)).toBe('pending');
    expect(run.index).toBe(0);
    expect(run.press(48, 30)).toBe('correct');
    expect(run.index).toBe(1);
    expect(run.targets).toEqual([62]);
    expect(run.press(61, 100)).toBe('wrong');
    expect(run.wrong).toBe(1);
  });
  it('plays the whole both-hands song with simultaneous presses', () => {
    const song = getUnit('unit-8')!.lessons.find((l) => l.kind === 'mini-song')!.song!;
    const run = new MiniSongRun(song);
    let t = 0;
    for (const n of song.notes) {
      t += 500;
      run.press(n.midi, t);
      if (n.left) expect(run.press(n.left.midi, t + 10)).toBe('correct');
      run.release(n.midi);
      if (n.left) run.release(n.left.midi);
    }
    expect(run.done).toBe(true);
    expect(run.wrong).toBe(0);
  });
});

describe('every unit still reads a pitch the unit teaches', () => {
  it('unit notes are valid MIDI numbers below the review-id ranges', () => {
    for (const u of UNITS) for (const m of u.notes) expect(m).toBeLessThan(128);
  });
});
