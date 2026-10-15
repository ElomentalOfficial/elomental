import type { Grid } from './grid.ts';
import type { Rng } from './rng.ts';

/**
 * Validity-preserving shuffles: relabel digits, permute bands/stacks and the
 * rows/columns inside them, optionally transpose. That is about 1.2 trillion
 * variants per puzzle, all with identical difficulty, so ranked players can
 * each get a different-looking grid and can't share or look up answers.
 */
export interface Transform {
  /** digits[old] = new; index 0 stays 0 (empty). */
  digits: number[];
  /** Output row r reads source row rows[r]. */
  rows: number[];
  /** Output column c reads source column cols[c]. */
  cols: number[];
  transpose: boolean;
}

function linePermutation(rng: Rng): number[] {
  const order: number[] = [];
  for (const band of rng.shuffle([0, 1, 2])) {
    for (const line of rng.shuffle([0, 1, 2])) order.push(band * 3 + line);
  }
  return order;
}

export function randomTransform(rng: Rng): Transform {
  return {
    digits: [0, ...rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])],
    rows: linePermutation(rng),
    cols: linePermutation(rng),
    transpose: rng.next() < 0.5,
  };
}

export function applyTransform(grid: Grid, t: Transform): Grid {
  const out = new Uint8Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const sr = t.rows[r];
      const sc = t.cols[c];
      out[r * 9 + c] = t.digits[grid[t.transpose ? sc * 9 + sr : sr * 9 + sc]];
    }
  }
  return out;
}
