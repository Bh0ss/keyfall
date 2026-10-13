import { describe, expect, it } from 'vitest';
import { ImportError, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_AUDIO_SECONDS_PHONE } from '../src/import/limits';
import { DESKTOP_CAPS, PHONE_CAPS, checkAudioFile, checkPcm, decodeAudio, toMono, type Decoder } from '../src/transcribe/decode';
import { SAMPLE_RATE } from '../src/transcribe/types';

const file = (name: string, size: number, bytes = new ArrayBuffer(8)) => ({ name, size, arrayBuffer: async () => bytes });
const tone = (seconds: number, amp = 0.5) => Float32Array.from({ length: Math.round(seconds * SAMPLE_RATE) }, (_, i) => amp * Math.sin(i / 10));
const decoderOf = (channels: Float32Array[], sampleRate = SAMPLE_RATE): Decoder => async () => ({ channels, sampleRate });

describe('checkAudioFile', () => {
  it('accepts m4a, mp3 and wav in any case', () => {
    for (const n of ['a.m4a', 'B.MP3', 'c.Wav', 'my.song.wav']) expect(() => checkAudioFile(n, 1000, DESKTOP_CAPS)).not.toThrow();
  });
  it('rejects other extensions, no extension and path tricks, with a message a player can read', () => {
    for (const n of ['a.mid', 'a.flac', 'a.wav.exe', 'wav', '', 'a.mp3/']) {
      expect(() => checkAudioFile(n, 1000, DESKTOP_CAPS), n).toThrow(ImportError);
    }
    expect(() => checkAudioFile('a.flac', 10, DESKTOP_CAPS)).toThrow(/m4a, mp3 or wav/);
  });
  it('rejects empty and oversize files before anything is read', () => {
    expect(() => checkAudioFile('a.wav', 0, DESKTOP_CAPS)).toThrow(/empty/);
    expect(() => checkAudioFile('a.wav', MAX_AUDIO_BYTES, DESKTOP_CAPS)).not.toThrow();
    expect(() => checkAudioFile('a.wav', MAX_AUDIO_BYTES + 1, DESKTOP_CAPS)).toThrow(/64 MB/);
  });
});

describe('toMono', () => {
  it('returns a single channel as is and averages several', () => {
    const l = Float32Array.of(1, 0.5, -1);
    expect(toMono([l])).toBe(l);
    const mono = toMono([l, Float32Array.of(0, 0.5, 1), Float32Array.of(0.5, 0.5, 0)]);
    [(1 + 0 + 0.5) / 3, 0.5, 0].forEach((v, k) => expect(mono[k]).toBeCloseTo(v, 6));
  });
  it('rejects no channels and mismatched lengths', () => {
    expect(() => toMono([])).toThrow(ImportError);
    expect(() => toMono([new Float32Array(3), new Float32Array(4)])).toThrow(ImportError);
  });
});

describe('checkPcm', () => {
  it('rejects zero length and silence', () => {
    expect(() => checkPcm(new Float32Array(0), DESKTOP_CAPS)).toThrow(/no sound/);
    expect(() => checkPcm(new Float32Array(SAMPLE_RATE), DESKTOP_CAPS)).toThrow(/silent/);
    expect(() => checkPcm(new Float32Array(SAMPLE_RATE).fill(5e-5), DESKTOP_CAPS)).toThrow(/silent/);
  });
  it('rejects non-finite samples', () => {
    const bad = tone(1);
    bad[10] = NaN;
    expect(() => checkPcm(bad, DESKTOP_CAPS)).toThrow(ImportError);
  });
  it('holds the duration cap, shorter on a phone', () => {
    const n = (s: number) => ({ length: Math.round(s * SAMPLE_RATE) });
    const longTone = (s: number) => new Float32Array(n(s).length).fill(0.3);
    expect(() => checkPcm(longTone(MAX_AUDIO_SECONDS), DESKTOP_CAPS)).not.toThrow();
    expect(() => checkPcm(longTone(MAX_AUDIO_SECONDS + 1), DESKTOP_CAPS)).toThrow(/6 minutes/);
    expect(() => checkPcm(longTone(MAX_AUDIO_SECONDS_PHONE + 1), PHONE_CAPS)).toThrow(/4 minutes/);
    expect(() => checkPcm(longTone(MAX_AUDIO_SECONDS_PHONE), PHONE_CAPS)).not.toThrow();
  });
});

describe('decodeAudio', () => {
  it('returns mono pcm at the model rate and its length in seconds', async () => {
    const r = await decodeAudio(file('a.wav', 100), DESKTOP_CAPS, decoderOf([tone(2), tone(2, 0.1)]));
    expect(r.seconds).toBeCloseTo(2, 3);
    expect(r.pcm.length).toBe(2 * SAMPLE_RATE);
  });
  it('maps a decoder failure to a readable ImportError', async () => {
    const boom: Decoder = async () => { throw new DOMException('Unable to decode audio data', 'EncodingError'); };
    await expect(decodeAudio(file('a.mp3', 100), DESKTOP_CAPS, boom)).rejects.toThrow(ImportError);
    await expect(decodeAudio(file('a.mp3', 100), DESKTOP_CAPS, boom)).rejects.toThrow(/could not read/i);
  });
  it('does not read a file that fails the size or extension check', async () => {
    let read = false;
    const f = { name: 'a.flac', size: 10, arrayBuffer: async () => { read = true; return new ArrayBuffer(1); } };
    await expect(decodeAudio(f, DESKTOP_CAPS, decoderOf([tone(1)]))).rejects.toThrow(ImportError);
    expect(read).toBe(false);
  });
  it('refuses audio that did not come back at the model rate', async () => {
    await expect(decodeAudio(file('a.wav', 100), DESKTOP_CAPS, decoderOf([tone(1)], 44100))).rejects.toThrow(ImportError);
  });
  it('applies the duration cap after decoding', async () => {
    await expect(decodeAudio(file('a.wav', 100), PHONE_CAPS, decoderOf([new Float32Array(Math.round(241 * SAMPLE_RATE)).fill(0.2)]))).rejects.toThrow(/4 minutes/);
  });
});
