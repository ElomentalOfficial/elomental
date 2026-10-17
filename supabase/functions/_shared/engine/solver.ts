import { ALL_DIGITS, BOX_OF, COL_OF, ROW_OF, bit, digitsOf, popcount, type Grid } from './grid.ts';
import type { Rng } from './rng.ts';

/**
 * Brute-force backtracking solver (most-constrained cell first). It is the
 * source of truth for "does this grid have exactly one solution" and is what
 * the server uses to check submissions. It knows nothing about human
 * techniques; grading lives in grader.ts.
 */

interface SearchState {
  grid: Grid;
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
}

function createState(puzzle: Grid): SearchState | null {
  const state: SearchState = {
    grid: Uint8Array.from(puzzle),
    rows: new Uint16Array(9),
    cols: new Uint16Array(9),
    boxes: new Uint16Array(9),
  };
  for (let c = 0; c < 81; c++) {
    const d = state.grid[c];
    if (!d) continue;
    const b = bit(d);
    if ((state.rows[ROW_OF[c]] | state.cols[COL_OF[c]] | state.boxes[BOX_OF[c]]) & b) return null;
    state.rows[ROW_OF[c]] |= b;
    state.cols[COL_OF[c]] |= b;
    state.boxes[BOX_OF[c]] |= b;
  }
  return state;
}

function search(state: SearchState, limit: number, rng: Rng | undefined, onSolution: (grid: Grid) => void): number {
  const { grid, rows, cols, boxes } = state;
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    const mask = ALL_DIGITS & ~(rows[ROW_OF[c]] | cols[COL_OF[c]] | boxes[BOX_OF[c]]);
    const n = popcount(mask);
    if (n === 0) return 0;
    if (n < bestCount) {
      best = c;
      bestMask = mask;
      bestCount = n;
      if (n === 1) break;
    }
  }
  if (best === -1) {
    onSolution(grid);
    return 1;
  }

  const digits = digitsOf(bestMask);
  if (rng) rng.shuffle(digits);
  const r = ROW_OF[best];
  const k = COL_OF[best];
  const x = BOX_OF[best];
  let found = 0;
  for (const d of digits) {
    const b = bit(d);
    grid[best] = d;
    rows[r] |= b;
    cols[k] |= b;
    boxes[x] |= b;
    found += search(state, limit - found, rng, onSolution);
    grid[best] = 0;
    rows[r] &= ~b;
    cols[k] &= ~b;
    boxes[x] &= ~b;
    if (found >= limit) break;
  }
  return found;
}

/** Counts solutions, stopping as soon as `limit` is reached. */
export function countSolutions(puzzle: Grid, limit = 2): number {
  const state = createState(puzzle);
  return state ? search(state, limit, undefined, () => {}) : 0;
}

export const hasUniqueSolution = (puzzle: Grid): boolean => countSolutions(puzzle, 2) === 1;

/** The first solution found, or null if there is none. */
export function solve(puzzle: Grid): Grid | null {
  const state = createState(puzzle);
  if (!state) return null;
  let result = null as Grid | null;
  search(state, 1, undefined, (grid) => (result = Uint8Array.from(grid)));
  return result;
}

/** A random complete, valid grid. */
export function randomSolvedGrid(rng: Rng): Grid {
  const state = createState(new Uint8Array(81))!;
  let result = null as Grid | null;
  search(state, 1, rng, (grid) => (result = Uint8Array.from(grid)));
  return result!;
}
