/** Badge catalog and the rules that award them. Pure functions over a snapshot of progress. */

export interface BadgeDef {
  id: string;
  name: string;
  /** How to earn it, one short sentence. */
  blurb: string;
  group: 'play' | 'learn' | 'streak' | 'level';
}

/** Structural subset of AttemptRecord. */
export interface BadgeAttempt {
  songId: string;
  stars: number;
  accuracy: number;
  hits: number;
  total: number;
  longestStreak: number;
  mode: 'wait' | 'practice' | 'full' | 'expert';
  loop: { from: number; to: number } | null;
}

export interface BadgeInput {
  attempts: readonly BadgeAttempt[];
  learn: readonly { unitId: string; passed: boolean }[];
  longestStreakDays: number;
  level: number;
  songLevel: (songId: string) => 1 | 2 | 3 | 4 | 5 | 'expert' | undefined;
  imported: (songId: string) => boolean;
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'first-song', name: 'Opening Night', blurb: 'Finish any song.', group: 'play' },
  { id: 'three-stars', name: 'Full Marks', blurb: 'Earn 3 stars on a song.', group: 'play' },
  { id: 'flawless', name: 'Flawless', blurb: 'Finish a song with every note right.', group: 'play' },
  { id: 'hot-streak', name: 'Hot Streak', blurb: 'Hit 30 notes in a row.', group: 'play' },
  { id: 'repertoire', name: 'Repertoire', blurb: 'Finish 10 different songs.', group: 'play' },
  { id: 'expert-finisher', name: 'Expert Finisher', blurb: 'Finish a run in Expert mode.', group: 'play' },
  { id: 'tough-piece', name: 'Tough Piece', blurb: 'Finish a level 5 or Expert song.', group: 'play' },
  { id: 'own-music', name: 'Your Own Music', blurb: 'Finish a song you imported.', group: 'play' },
  { id: 'star-collector', name: 'Star Collector', blurb: 'Collect 30 stars across your best runs.', group: 'play' },
  { id: 'learn-first-unit', name: 'First Steps', blurb: 'Pass your first Learn unit.', group: 'learn' },
  { id: 'learn-half', name: 'Halfway There', blurb: 'Pass 5 Learn units.', group: 'learn' },
  { id: 'learn-graduate', name: 'Graduate', blurb: 'Pass Units 1 to 8, 10 and 11.', group: 'learn' },
  { id: 'streak-3', name: 'Warming Up', blurb: 'Practice 3 days in a row.', group: 'streak' },
  { id: 'streak-7', name: 'One Full Week', blurb: 'Practice 7 days in a row.', group: 'streak' },
  { id: 'streak-30', name: 'Devoted', blurb: 'Practice 30 days in a row.', group: 'streak' },
  { id: 'level-5', name: 'Level 5', blurb: 'Reach level 5.', group: 'level' },
  { id: 'level-10', name: 'Level 10', blurb: 'Reach level 10.', group: 'level' },
];

const finished = (a: BadgeAttempt) => a.loop === null;

// The ten core units, by stable id. "Moving around the keyboard" (unit-11, v1.1) is a bonus unit, so the badge profiles already earned stays earned.
const ALL_UNITS = Array.from({ length: 10 }, (_, i) => `unit-${i + 1}`);

type Rule = (i: BadgeInput, done: readonly BadgeAttempt[]) => boolean;

function passedUnits(i: BadgeInput): Set<string> {
  return new Set(i.learn.filter((u) => u.passed).map((u) => u.unitId));
}

function bestStarTotal(done: readonly BadgeAttempt[]): number {
  const best = new Map<string, number>();
  for (const a of done) best.set(a.songId, Math.max(best.get(a.songId) ?? 0, a.stars));
  let sum = 0;
  for (const s of best.values()) sum += s;
  return sum;
}

const RULES: Record<string, Rule> = {
  'first-song': (_, d) => d.length > 0,
  'three-stars': (_, d) => d.some((a) => a.stars >= 3),
  flawless: (_, d) => d.some((a) => a.accuracy >= 1 && a.total >= 8),
  'hot-streak': (_, d) => d.some((a) => a.longestStreak >= 30),
  repertoire: (_, d) => new Set(d.map((a) => a.songId)).size >= 10,
  'expert-finisher': (_, d) => d.some((a) => a.mode === 'expert'),
  'tough-piece': (i, d) => d.some((a) => {
    const lv = i.songLevel(a.songId);
    return lv === 5 || lv === 'expert';
  }),
  'own-music': (i, d) => d.some((a) => i.imported(a.songId)),
  'star-collector': (_, d) => bestStarTotal(d) >= 30,
  'learn-first-unit': (i) => passedUnits(i).size >= 1,
  'learn-half': (i) => passedUnits(i).size >= 5,
  'learn-graduate': (i) => {
    const p = passedUnits(i);
    return ALL_UNITS.every((u) => p.has(u));
  },
  'streak-3': (i) => i.longestStreakDays >= 3,
  'streak-7': (i) => i.longestStreakDays >= 7,
  'streak-30': (i) => i.longestStreakDays >= 30,
  'level-5': (i) => i.level >= 5,
  'level-10': (i) => i.level >= 10,
};

/** Every badge whose condition currently holds, in catalog order. Looped runs never count. */
export function earnedBadgeIds(input: BadgeInput): string[] {
  const done = input.attempts.filter(finished);
  return BADGES.filter((b) => RULES[b.id]!(input, done)).map((b) => b.id);
}

export function badgeById(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id);
}