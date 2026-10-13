import {
  AUDIO_EXTENSIONS,
  ImportError,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_AUDIO_SECONDS_PHONE,
  SILENCE_PEAK,
} from '../import/limits';
import { SAMPLE_RATE } from './types';

export interface AudioCaps {
  maxBytes: number;
  maxSeconds: number;
}

export const DESKTOP_CAPS: AudioCaps = { maxBytes: MAX_AUDIO_BYTES, maxSeconds: MAX_AUDIO_SECONDS };
export const PHONE_CAPS: AudioCaps = { maxBytes: MAX_AUDIO_BYTES, maxSeconds: MAX_AUDIO_SECONDS_PHONE };

/** The slice of File that decoding needs (so tests need no DOM). */
export interface AudioSource {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Decoded channels, already resampled by the decoder to SAMPLE_RATE. */
export type Decoder = (bytes: ArrayBuffer) => Promise<{ channels: Float32Array[]; sampleRate: number }>;

const minutes = (seconds: number) => `${Math.round(seconds / 60)} minutes`;

/** Look at the name and size only, before a byte is read. */
export function checkAudioFile(name: string, size: number, caps: AudioCaps): void {
  const ext = /\.[^./\\]+$/.exec(name.toLowerCase())?.[0];
  if (!ext || !(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ImportError('That file type is not supported. Use an m4a, mp3 or wav recording.');
  }
  if (size <= 0) throw new ImportError('That file is empty.');
  if (size > caps.maxBytes) throw new ImportError(`That file is too big. The limit is ${Math.round(caps.maxBytes / 1024 / 1024)} MB.`);
}

/** Average any number of channels into one. A single channel is returned as is. */
export function toMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) throw new ImportError('That recording has no sound in it.');
  if (channels.some((c) => c.length !== first.length)) throw new ImportError('Keyfall could not read that recording.');
  if (channels.length === 1) return first;
  const mono = new Float32Array(first.length);
  for (const c of channels) for (let i = 0; i < c.length; i++) mono[i]! += c[i]!;
  const k = 1 / channels.length;
  for (let i = 0; i < mono.length; i++) mono[i]! *= k;
  return mono;
}

/** Reject empty, silent, corrupt or too-long audio after decoding. */
export function checkPcm(pcm: Float32Array, caps: AudioCaps): void {
  if (pcm.length === 0) throw new ImportError('That recording has no sound in it.');
  if (pcm.length / SAMPLE_RATE > caps.maxSeconds) {
    throw new ImportError(`That recording is too long. The limit is ${minutes(caps.maxSeconds)}.`);
  }
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.abs(pcm[i]!);
    if (!Number.isFinite(v)) throw new ImportError('Keyfall could not read that recording.');
    if (v > peak) peak = v;
  }
  if (peak < SILENCE_PEAK) throw new ImportError('That recording is silent.');
}

/**
 * The browser's own decoder is the only parser; no container format is read here. An OfflineAudioContext at the
 * model rate hands the audio back already resampled. Not available in a worker, so this runs on the main thread.
 */
export const browserDecoder: Decoder = async (bytes) => {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(bytes);
  return { channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), sampleRate: buf.sampleRate };
};

/**
 * File to mono 22050 Hz samples. The file and its bytes are dropped on return; nothing is kept anywhere.
 * Every failure is an ImportError with copy for the player.
 */
export async function decodeAudio(
  file: AudioSource,
  caps: AudioCaps = DESKTOP_CAPS,
  decoder: Decoder = browserDecoder,
): Promise<{ pcm: Float32Array; seconds: number }> {
  checkAudioFile(file.name, file.size, caps);
  let decoded: Awaited<ReturnType<Decoder>>;
  try {
    decoded = await decoder(await file.arrayBuffer());
  } catch {
    throw new ImportError('Keyfall could not read that recording. Try another file.');
  }
  if (decoded.sampleRate !== SAMPLE_RATE) throw new ImportError('Keyfall could not read that recording.');
  const pcm = toMono(decoded.channels);
  checkPcm(pcm, caps);
  return { pcm, seconds: pcm.length / SAMPLE_RATE };
}
