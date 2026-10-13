/**
 * Which transcriber the Add song screen uses. Production: the worker. With ?debug=1 an e2e test may install the fake
 * (`window.__keyfall.useFakeTranscriber`), which is the only way anything but the real worker is ever returned.
 */
import { workerTranscriber, type Transcriber } from './client';

/** A projected total over this many seconds shows the "Try anyway" card. */
export const DEFAULT_PACE_LIMIT_SEC = 120;

let fake: { transcribe: Transcriber; paceLimitSec: number } | null = null;

export const currentTranscriber = (): Transcriber => fake?.transcribe ?? workerTranscriber();
export const currentPaceLimitSec = (): number => fake?.paceLimitSec ?? DEFAULT_PACE_LIMIT_SEC;

export function installFakeTranscriber(transcribe: Transcriber, paceLimitSec = DEFAULT_PACE_LIMIT_SEC): void {
  fake = { transcribe, paceLimitSec };
}
export function removeFakeTranscriber(): void {
  fake = null;
}
