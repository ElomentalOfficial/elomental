/**
 * The account level's maths, mirroring the server's private.solve_xp, private.xp_level and
 * private.plates_at (migrations account_level, level_plates), kept free of the page so tests can
 * load it (test/level.test.ts).
 */

/** XP for a rated win: Easy 10, Medium 20, Hard 30 (Casual, Clash, square codes), the Daily 30, Ranked 40. */
export function solveXp(mode: string, difficulty: string): number {
  if (mode === 'daily') return 30;
  if (mode === 'ranked') return 40;
  return difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 30;
}

/** XP to reach level L: 10 x L x (L - 1) up to level 100, then 2,000 a level. */
export const xpTotal = (l: number): number => (l <= 100 ? 10 * l * (l - 1) : 99_000 + 2_000 * (l - 100));

/** The level a total reaches, the XP into it, and what the next one needs (L to L+1: min(20 x L, 2000)). */
export function xpLevel(total: number): { level: number; into: number; need: number } {
  const t = Math.max(0, Math.floor(total || 0));
  let level: number;
  if (t >= 99_000) level = 100 + Math.floor((t - 99_000) / 2_000);
  else {
    level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.4 * t)) / 2));
    while (xpTotal(level + 1) <= t) level++;
    while (level > 1 && xpTotal(level) > t) level--;
  }
  return { level, into: t - xpTotal(level), need: Math.min(20 * level, 2_000) };
}

/** The levels that bring a name plate (plates.ts PLATES, in order; Starforged at the top). */
export const PLATE_LEVELS = [5, 10, 15, 25, 35, 50, 65, 80, 100] as const;

/** How many plates a level has unlocked (0 to 9). */
export const platesAt = (level: number): number => PLATE_LEVELS.filter((l) => l <= level).length;
