/** Keys must go down within this long of each other to count as pressed together. */
export const TOGETHER_MS = 600;

export type SetResult = 'wrong' | 'partial' | 'correct';

/**
 * Judges a set of keys pressed together (two hands, or a chord). The set is right when every target key is
 * held at once, each pressed within TOGETHER_MS of the last. Any key outside the set is wrong straight away.
 */
export class SetJudge {
  private readonly held = new Map<number, number>();

  constructor(
    readonly targets: readonly number[],
    private readonly windowMs = TOGETHER_MS,
  ) {}

  down(midi: number, nowMs = 0): SetResult {
    if (!this.targets.includes(midi)) return 'wrong';
    for (const [m, t] of this.held) if (nowMs - t > this.windowMs) this.held.delete(m);
    this.held.set(midi, nowMs);
    return this.targets.every((t) => this.held.has(t)) ? 'correct' : 'partial';
  }

  up(midi: number): void {
    this.held.delete(midi);
  }

  reset(): void {
    this.held.clear();
  }

  /** Target keys currently counted as held. */
  get heldKeys(): number[] {
    return [...this.held.keys()];
  }
}
