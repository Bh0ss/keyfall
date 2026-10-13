import { SAMPLE_RATE } from './types';

/** The model's windowing. Kept free of TF.js so the UI can predict the window count without loading the engine. */
export const FFT_HOP = 256;
export const FRAMES_PER_SECOND = Math.floor(SAMPLE_RATE / FFT_HOP);
export const WINDOW_SAMPLES = SAMPLE_RATE * 2 - FFT_HOP;
export const OVERLAP_FRAMES = 30;
export const OVERLAP_SAMPLES = OVERLAP_FRAMES * FFT_HOP;
export const HOP_SAMPLES = WINDOW_SAMPLES - OVERLAP_SAMPLES;

/** How many model windows a recording of `samples` samples takes (the runner pads half an overlap of silence in front). */
export function windowCount(samples: number): number {
  return Math.max(1, Math.ceil((OVERLAP_SAMPLES / 2 + samples - WINDOW_SAMPLES) / HOP_SAMPLES) + 1);
}
