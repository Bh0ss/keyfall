import { describe, expect, it } from 'vitest';
import { KEY_CHOICES, buildReview, keyLabel } from '../src/audioImport/review';
import { ImportError } from '../src/import/limits';
import { bundledSong } from './fixtures/audio';
import { eventsOf } from './fixtures/events';

const events = eventsOf(bundledSong('ode-to-joy'), 30);
const base = { version: 'beginner', bpm: null, key: null, trimSec: null } as const;
const meta = { title: 'Ode', composer: 'Someone' };

describe('buildReview', () => {
  it('arranges, writes MusicXML and reads it back through the importer', async () => {
    const r = await buildReview(events, base, meta);
    expect(new TextDecoder().decode(r.bytes.slice(0, 5))).toBe('<?xml');
    expect(r.fileName).toBe('Ode.musicxml');
    expect(r.analysis.format).toBe('musicxml');
    expect(r.analysis.bpm).toBe(r.arrangement.bpm);
    expect(r.analysis.groups).toHaveLength(2);
  });

  it('a tempo choice re-arranges at that tempo without new events', async () => {
    const a = await buildReview(events, base, meta);
    const b = await buildReview(events, { ...base, bpm: 90 }, meta);
    expect(b.arrangement.bpm).toBe(90);
    expect(b.arrangement.estimatedBpm).toBe(a.arrangement.estimatedBpm);
  });

  it('a key choice and a version choice reach the arrangement', async () => {
    const a = await buildReview(events, base, meta);
    const b = await buildReview(events, { ...base, version: 'full', key: { tonic: (a.arrangement.key.tonic + 7) % 12, mode: 'minor' } }, meta);
    expect(b.arrangement.key.mode).toBe('minor');
    expect(b.arrangement.notes.length).not.toBe(a.arrangement.notes.length);
  });

  it('a trim keeps only the notes inside it', async () => {
    const whole = await buildReview(events, base, meta);
    const part = await buildReview(events, { ...base, trimSec: [0, 6] }, meta);
    expect(part.arrangement.bars).toBeLessThan(whole.arrangement.bars);
  });

  it('a trim with nothing in it is an ImportError the screen can show', async () => {
    await expect(buildReview(events, { ...base, trimSec: [500, 600] }, meta)).rejects.toBeInstanceOf(ImportError);
  });

  it('is deterministic', async () => {
    const a = await buildReview(events, base, meta);
    const b = await buildReview(events, base, meta);
    expect(Array.from(b.bytes)).toEqual(Array.from(a.bytes));
  });
});

describe('key choices', () => {
  it('lists 12 major and 12 minor keys with plain names', () => {
    expect(KEY_CHOICES).toHaveLength(24);
    expect(keyLabel({ tonic: 0, mode: 'major' })).toBe('C major');
    expect(keyLabel({ tonic: 9, mode: 'minor' })).toBe('A minor');
    expect(keyLabel({ tonic: 3, mode: 'major' })).toBe('E flat major');
    expect(keyLabel({ tonic: 6, mode: 'minor' })).toBe('F sharp minor');
  });
});
