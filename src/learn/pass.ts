/** A unit passes at 90% over 20 prompts. */
export const PASS_PROMPTS = 20;
export const PASS_PERCENT = 90;

/** Whole numbers only, so 18 of 20 is exactly 90% and passes. */
export function passes(correct: number, total: number): boolean {
  return total >= PASS_PROMPTS && correct * 100 >= total * PASS_PERCENT;
}
