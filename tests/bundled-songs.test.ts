import { describe, expect, it } from 'vitest';
import { getSong, getSongs } from '../src/songs/catalog';
import { parseMusicXml } from '../src/songs/musicxml';
import { isSongUnlocked } from '../src/learn/unlocks';

const EXPECTED: { id: string; level: number | 'expert'; hands: 'right' | 'both'; unlockedBy?: string; minBars: number }[] = [
  { id: 'mary-had-a-little-lamb', level: 1, hands: 'right', minBars: 4 },
  { id: 'twinkle-twinkle-little-star', level: 1, hands: 'right', minBars: 4 },
  { id: 'ode-to-joy', level: 2, hands: 'right', unlockedBy: 'unit-2', minBars: 16 },
  { id: 'jingle-bells', level: 2, hands: 'right', unlockedBy: 'unit-3', minBars: 16 },
  { id: 'when-the-saints-go-marching-in', level: 3, hands: 'both', unlockedBy: 'unit-4', minBars: 12 },
  { id: 'minuet-in-g', level: 4, hands: 'both', unlockedBy: 'unit-6', minBars: 64 },
  { id: 'greensleeves', level: 4, hands: 'both', unlockedBy: 'unit-7', minBars: 30 },
  { id: 'fur-elise-opening', level: 5, hands: 'both', unlockedBy: 'unit-8', minBars: 50 },
  { id: 'canon-in-d', level: 5, hands: 'both', unlockedBy: 'unit-9', minBars: 30 },
  { id: 'clair-de-lune', level: 'expert', hands: 'both', unlockedBy: 'advanced', minBars: 60 },
  { id: 'chopin-nocturne-op72-1', level: 'expert', hands: 'both', unlockedBy: 'advanced', minBars: 57 },
  { id: 'row-row-row-your-boat', level: 1, hands: 'right', minBars: 8 },
  { id: 'london-bridge', level: 1, hands: 'right', minBars: 8 },
  { id: 'frere-jacques', level: 1, hands: 'right', minBars: 8 },
  { id: 'yankee-doodle', level: 1, hands: 'right', minBars: 5 },
  { id: 'oh-susanna', level: 1, hands: 'right', minBars: 9 },
  { id: 'happy-birthday', level: 1, hands: 'right', minBars: 9 },
  { id: 'amazing-grace', level: 2, hands: 'both', minBars: 16 },
  { id: 'brahms-lullaby', level: 2, hands: 'both', minBars: 17 },
  { id: 'auld-lang-syne', level: 2, hands: 'both', minBars: 32 },
  { id: 'scarborough-fair', level: 2, hands: 'both', minBars: 17 },
  { id: 'bach-musette-in-d', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 40 },
  { id: 'tchaikovsky-old-french-song', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 33 },
  { id: 'schumann-melody-op68-1', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 24 },
  { id: 'schumann-happy-farmer', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 21 },
  { id: 'burgmuller-arabesque', level: 5, hands: 'both', unlockedBy: 'unit-9', minBars: 33 },
  { id: 'bach-prelude-in-c', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 35 },
  { id: 'clementi-sonatina-op36-1-mvt1', level: 4, hands: 'both', unlockedBy: 'unit-5', minBars: 76 },
  { id: 'joplin-the-entertainer', level: 5, hands: 'both', unlockedBy: 'unit-9', minBars: 152 },
];

describe('bundled songs', () => {
  it('lists the ten spec songs plus the requested additions (Nocturne and 18 more, 29 in all), with levels, hands and unlocks', () => {
    expect(getSongs().map((s) => s.id)).toEqual(EXPECTED.map((e) => e.id));
    for (const e of EXPECTED) {
      const s = getSong(e.id)!;
      expect({ level: s.level, hands: s.hands, unlockedBy: s.unlockedBy }).toEqual({ level: e.level, hands: e.hands, unlockedBy: e.unlockedBy });
      expect(s.source).toBe('bundled');
      expect(s.musicXml).toContain('score-partwise');
      expect(Math.max(...s.notes.map((n) => n.measure))).toBeGreaterThanOrEqual(e.minBars);
    }
  });

  it.each(EXPECTED.map((e) => e.id))('%s: sane notes, no same-hand same-pitch overlap, plays to a finite end', (id) => {
    const s = getSong(id)!;
    expect(s.bpm).toBeGreaterThan(30);
    expect(s.notes.length).toBeGreaterThan(20);
    const lastEnd = Math.max(...s.notes.map((n) => n.startBeat + n.durationBeats));
    expect(Number.isFinite(lastEnd)).toBe(true);
    for (const n of s.notes) {
      expect(n.midi).toBeGreaterThanOrEqual(21);
      expect(n.midi).toBeLessThanOrEqual(108);
      expect(n.durationBeats).toBeGreaterThan(0);
      expect(n.measure).toBeGreaterThanOrEqual(1);
    }
    // One hand never sounds the same key twice at once (the Nocturne has one engraved unison between the hands in bar 17).
    const byPitch = new Map<string, typeof s.notes>();
    for (const n of s.notes) {
      const k = `${n.hand}${n.midi}`;
      (byPitch.get(k) ?? byPitch.set(k, []).get(k)!).push(n);
    }
    for (const list of byPitch.values()) {
      list.sort((a, b) => a.startBeat - b.startBeat);
      for (let i = 1; i < list.length; i++) expect(list[i]!.startBeat).toBeGreaterThanOrEqual(list[i - 1]!.startBeat + list[i - 1]!.durationBeats - 1e-6);
    }
  });

  it('new songs: open ones need nothing; Unit 5 songs need Unit 5 for Beginners and are open to Advanced by rule; The Entertainer is open to Advanced by rule', () => {
    const none = new Set<string>();
    const u5 = new Set(['unit-5']);
    for (const e of EXPECTED.filter((x) => !x.unlockedBy)) {
      for (const lvl of ['beginner', 'advanced'] as const) expect(isSongUnlocked(getSong(e.id)!, none, lvl), e.id).toBe(true);
    }
    for (const e of EXPECTED.filter((x) => x.unlockedBy === 'unit-5')) {
      expect(isSongUnlocked(getSong(e.id)!, none, 'beginner'), e.id).toBe(false);
      expect(isSongUnlocked(getSong(e.id)!, none, 'advanced'), e.id).toBe(true);
      expect(isSongUnlocked(getSong(e.id)!, u5, 'beginner'), e.id).toBe(true);
    }
    expect(isSongUnlocked(getSong('burgmuller-arabesque')!, none, 'advanced')).toBe(true);
    expect(isSongUnlocked(getSong('burgmuller-arabesque')!, none, 'beginner')).toBe(false);
    const ent = getSong('joplin-the-entertainer')!;
    expect(isSongUnlocked(ent, none, 'advanced')).toBe(true);
    expect(isSongUnlocked(ent, none, 'beginner')).toBe(false);
    expect(isSongUnlocked(ent, new Set(['unit-9']), 'beginner')).toBe(true);
  });

  it('levels 1 to 3 carry a finger number on every note', () => {
    for (const s of getSongs().filter((x) => typeof x.level === 'number' && x.level <= 3)) {
      expect(s.notes.filter((n) => n.finger === undefined), s.id).toEqual([]);
    }
  });

  it('written-out repeats: the Minuet plays its A and B sections twice (64 bars of 3/4)', () => {
    const s = getSong('minuet-in-g')!;
    expect(s.timeSignature).toEqual([3, 4]);
    const bar = (m: number) => s.notes.filter((n) => n.measure === m).map((n) => `${n.hand}${n.midi}`);
    expect(bar(1)).toEqual(bar(17));
    expect(bar(33)).toEqual(bar(49));
    expect(Math.max(...s.notes.map((n) => n.measure))).toBe(64);
  });

  it('Nocturne: last chord is E3 G#3 E4 in the right hand over E2 in the left, grace notes are not scored', () => {
    const s = getSong('chopin-nocturne-op72-1')!;
    const last = s.notes.filter((n) => n.measure === 57);
    expect(last.filter((n) => n.hand === 'right').map((n) => n.midi).sort()).toEqual([52, 56, 64]);
    expect(last.filter((n) => n.hand === 'left').map((n) => n.midi)).toEqual([40]);
    expect(s.notes.length).toBe(1080);
  });

  it('Advanced profiles open Units 6 to 9 songs, Clair de Lune and the Nocturne; Beginners do not', () => {
    const none = new Set<string>();
    for (const id of ['minuet-in-g', 'greensleeves', 'fur-elise-opening', 'canon-in-d', 'clair-de-lune', 'chopin-nocturne-op72-1']) {
      expect(isSongUnlocked(getSong(id)!, none, 'advanced'), id).toBe(true);
      expect(isSongUnlocked(getSong(id)!, none, 'beginner'), id).toBe(false);
    }
    expect(isSongUnlocked(getSong('when-the-saints-go-marching-in')!, none, 'advanced')).toBe(false);
    expect(isSongUnlocked(getSong('when-the-saints-go-marching-in')!, new Set(['unit-4']), 'beginner')).toBe(true);
  });
});

describe('loader: triplets, voices and ties across bars', () => {
  const xml = `<score-partwise><part id="P1">
    <measure number="1">
      <attributes><divisions>24</divisions><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice><staff>1</staff><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>24</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>72</duration></backup>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>72</duration><voice>2</voice><staff>1</staff></note>
      <backup><duration>72</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>72</duration><tie type="start"/><voice>5</voice><staff>2</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>72</duration><tie type="start"/><voice>5</voice><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>24</duration><tie type="stop"/><voice>5</voice><staff>2</staff></note>
      <note><chord/><pitch><step>E</step><octave>3</octave></pitch><duration>24</duration><tie type="stop"/><voice>5</voice><staff>2</staff></note>
      <note><rest/><duration>48</duration><voice>5</voice><staff>2</staff></note>
    </measure>
  </part></score-partwise>`;
  const s = parseMusicXml(xml, { id: 't', level: 5 });
  it('triplet notes last two thirds of a beat', () => {
    const t = s.notes.filter((n) => n.hand === 'right' && n.midi >= 72 && n.midi <= 76);
    expect(t.map((n) => [n.startBeat, n.durationBeats])).toEqual([[0, 0.666667], [0.666667, 0.666667], [1.333333, 0.666667]]);
  });
  it('two voices on one staff keep their own timelines', () => {
    expect(s.notes.find((n) => n.midi === 67)).toMatchObject({ startBeat: 0, durationBeats: 3, hand: 'right' });
    expect(s.notes.find((n) => n.midi === 79)).toMatchObject({ startBeat: 2, durationBeats: 1 });
  });
  it('a tied chord across the bar line becomes one long note per pitch in the left hand', () => {
    const left = s.notes.filter((n) => n.hand === 'left');
    expect(left.map((n) => [n.midi, n.startBeat, n.durationBeats, n.measure])).toEqual([[48, 0, 4, 1], [52, 0, 4, 1]]);
  });
});
