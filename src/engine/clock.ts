export const beatsToMs = (beats: number, bpm: number): number => (beats * 60000) / bpm;
export const msToBeats = (ms: number, bpm: number): number => (ms * bpm) / 60000;

/**
 * Song clock. Time is passed in explicitly (performance.now() in the app,
 * plain numbers in tests); the requestAnimationFrame loop lives in the UI.
 */
export class Clock {
  private base = 0;
  private anchor = 0;
  private active = false;

  constructor(
    readonly bpm: number,
    private speed = 1,
  ) {}

  get running(): boolean {
    return this.active;
  }

  beatAt(nowMs: number): number {
    return this.active ? this.base + msToBeats((nowMs - this.anchor) * this.speed, this.bpm) : this.base;
  }

  resume(nowMs: number): void {
    if (this.active) return;
    this.anchor = nowMs;
    this.active = true;
  }

  pause(nowMs: number): void {
    if (!this.active) return;
    this.base = this.beatAt(nowMs);
    this.active = false;
  }

  seek(beat: number, nowMs: number): void {
    this.base = beat;
    this.anchor = nowMs;
  }

  setSpeed(speed: number, nowMs: number): void {
    this.base = this.beatAt(nowMs);
    this.anchor = nowMs;
    this.speed = speed;
  }
}
