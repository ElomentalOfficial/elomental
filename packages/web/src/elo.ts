/**
 * Ranked's Elo maths, mirroring the server (migration ranked_ladder: elo_delta, elo_k,
 * elo_loss_multiplier, ranked_opponent). No browser imports, so the database tests can check
 * the two agree (supabase/tests/ladder.mjs). profile.ts re-exports what screens use.
 */

/** Below this rating (all of Novice), losing a Ranked game costs nothing. */
export const PROTECTED_BELOW = 300;

/** The highest Elo a Ranked game is priced at: above it gains fade, so the best settle near it. */
const MAX_OPPONENT = 1600;

/**
 * Who a Ranked game is priced against: an even match with your own Elo, up to 1600.
 * Mirrors private.ranked_opponent.
 */
export function rankedOpponent(elo: number): number {
  return Math.min(Math.round(elo), MAX_OPPONENT);
}

/** K by Elo, straight lines between these points: bigger gains while learning, small at the top. */
const K_CURVE: [number, number][] = [
  [100, 40],
  [600, 32],
  [1000, 24],
  [1450, 18],
  [1600, 14],
  [2000, 10],
];

/** What a loss costs relative to the stake once Novice is behind you: so a settled player wins about 3 in 5. */
const LOSS_CURVE: [number, number][] = [
  [300, 0.75],
  [500, 1.5],
  [1600, 1.75],
];

/** Straight lines between the points; flat before the first and after the last. */
export function along(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/**
 * Puzzle-as-opponent Elo, mirroring elo_delta on the server (signed-in players
 * get theirs from there). Losses are free while protected, then cost more the
 * higher the player (LOSS_CURVE).
 */
export function eloDelta(player: number, puzzle: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((puzzle - player) / 200));
  const k = along(K_CURVE, player);
  if (won) return Math.round(k * (1 - expected));
  if (player < PROTECTED_BELOW) return 0;
  return -Math.round(k * expected * along(LOSS_CURVE, player));
}
