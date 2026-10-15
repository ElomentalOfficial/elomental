import { countClues, gridToString, type Grid } from './grid.ts';
import { grade } from './grader.ts';
import { createRng, randomSeed, type Rng } from './rng.ts';
import { randomSolvedGrid } from './solver.ts';
import type { TechniqueId, TechniqueLevel } from './techniques.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Symmetry = 'none' | 'rotational';

export interface DifficultyProfile {
  /** The puzzle must need at least one technique of this level. */
  minLevel: TechniqueLevel;
  /** The puzzle must be solvable using techniques up to this level. */
  maxLevel: TechniqueLevel;
  /** Never carve below this many givens. */
  minClues: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: { minLevel: 1, maxLevel: 1, minClues: 36 },
  medium: { minLevel: 2, maxLevel: 2, minClues: 28 },
  hard: { minLevel: 3, maxLevel: 3, minClues: 22 },
};

export interface GenerateOptions {
  difficulty: Difficulty;
  /** Same seed, same puzzle. Random when omitted. */
  seed?: string;
  symmetry?: Symmetry;
  maxAttempts?: number;
}

export interface GeneratedPuzzle {
  puzzle: string;
  solution: string;
  difficulty: Difficulty;
  clues: number;
  level: number;
  hardest: TechniqueId | null;
  score: number;
  rating: number;
  counts: Partial<Record<TechniqueId, number>>;
  seed: string;
  /** Full grids tried before one matched the profile. */
  attempts: number;
}

export function generatePuzzle(options: GenerateOptions): GeneratedPuzzle {
  const profile = DIFFICULTIES[options.difficulty];
  const seed = options.seed ?? randomSeed();
  const symmetry = options.symmetry ?? 'rotational';
  const maxAttempts = options.maxAttempts ?? 1000;
  const rng = createRng(seed);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = randomSolvedGrid(rng);
    const puzzle = carve(solution, profile, symmetry, rng);
    const result = grade(puzzle, { maxLevel: profile.maxLevel });
    if (!result.solved || result.level < profile.minLevel) continue;
    return {
      puzzle: gridToString(puzzle),
      solution: gridToString(solution),
      difficulty: options.difficulty,
      clues: countClues(puzzle),
      level: result.level,
      hardest: result.hardest,
      score: result.score,
      rating: result.rating,
      counts: result.counts,
      seed,
      attempts: attempt,
    };
  }
  throw new Error(`No ${options.difficulty} puzzle found in ${maxAttempts} attempts (seed ${seed})`);
}

/**
 * Removes givens in random order, keeping a removal only while the puzzle
 * stays solvable with the profile's techniques. Since those techniques never
 * guess, staying solvable also proves the solution is unique.
 */
function carve(solution: Grid, profile: DifficultyProfile, symmetry: Symmetry, rng: Rng): Grid {
  const puzzle = Uint8Array.from(solution);
  // With rotational symmetry, cell c is always removed together with 80 - c.
  const cells = Array.from({ length: symmetry === 'rotational' ? 41 : 81 }, (_, i) => i);
  let clues = 81;
  for (const cell of rng.shuffle(cells)) {
    const group = symmetry === 'rotational' && cell !== 40 ? [cell, 80 - cell] : [cell];
    if (clues - group.length < profile.minClues) continue;
    for (const c of group) puzzle[c] = 0;
    if (grade(puzzle, { maxLevel: profile.maxLevel }).solved) clues -= group.length;
    else for (const c of group) puzzle[c] = solution[c];
  }
  return puzzle;
}
