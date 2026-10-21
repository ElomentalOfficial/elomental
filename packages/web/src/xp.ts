/**
 * The account level's maths, mirroring the server's private.solve_xp and private.xp_level
 * (migration account_level), kept free of the page so tests can load it (test/level.test.ts).
 */

/** XP for a rated win: Easy 10, Medium 20, Hard 30 (Casual, Clash, square codes), the Daily 30, Ranked 40. */
export function solveXp(mode: string, difficulty: string): number {
  if (mode === 'daily') return 30;
  if (mode === 'ranked') return 40;
  return difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 30;
}

/** The level a total reaches, the XP into it, and what the next one needs (L to L+1 costs 50 x L). */
export function xpLevel(total: number): { level: number; into: number; need: number } {
  const t = Math.max(0, Math.floor(total || 0));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * t) / 25)) / 2));
  while (25 * (level + 1) * level <= t) level++;
  while (level > 1 && 25 * level * (level - 1) > t) level--;
  return { level, into: t - 25 * level * (level - 1), need: 50 * level };
}
