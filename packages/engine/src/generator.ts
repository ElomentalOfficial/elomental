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
  /** Only these techniques may be needed (on top of maxLevel). */
  techniques?: readonly TechniqueId[];
  /** At most this many steps beyond singles, so a "bit harder" puzzle stays a bit harder. */
  maxAdvancedSteps?: number;
  /** At least one of these techniques must be needed. */
  requires?: readonly TechniqueId[];
}

/** Ranked tiers (and the original three levels). */
export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: { minLevel: 1, maxLevel: 1, minClues: 36 },
  medium: { minLevel: 2, maxLevel: 2, minClues: 28 },
  hard: { minLevel: 3, maxLevel: 3, minClues: 22 },
};

const SINGLES = ['fullHouse', 'hiddenSingle', 'nakedSingle'] as const;

/**
 * Gentler shapes for the modes people play to relax (Casual, Clash, Daily).
 * Ranked keeps DIFFICULTIES and scales on its own.
 */
export const PROFILES = {
  ...DIFFICULTIES,
  /** Singles only, lots of givens: a relaxed solve. */
  casualEasy: { minLevel: 1, maxLevel: 1, minClues: 38 },
  /** Singles only but fewer givens: more scanning, still no techniques to learn. */
  singlesLean: { minLevel: 1, maxLevel: 1, minClues: 32 },
  /** Mostly singles plus a few pointing / claiming steps; no pairs or triples. */
  casualMedium: {
    minLevel: 2,
    maxLevel: 2,
    minClues: 32,
    techniques: [...SINGLES, 'pointing', 'claiming'],
    maxAdvancedSteps: 4,
  },
  /** Always needs a pair or triple (plus pointing); never expert techniques. */
  casualHard: {
    minLevel: 2,
    maxLevel: 2,
    minClues: 28,
    requires: ['nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple'],
  },
} satisfies Record<string, DifficultyProfile>;

export type ProfileId = keyof typeof PROFILES;

export interface GenerateOptions {
  difficulty: Difficulty;
  /** Generation shape; defaults to the difficulty's ranked tier. */
  profile?: ProfileId;
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
  const profile: DifficultyProfile = options.profile ? PROFILES[options.profile] : DIFFICULTIES[options.difficulty];
  const seed = options.seed ?? randomSeed();
  const symmetry = options.symmetry ?? 'rotational';
  const maxAttempts = options.maxAttempts ?? 1000;
  const rng = createRng(seed);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = randomSolvedGrid(rng);
    const puzzle = carve(solution, profile, symmetry, rng);
    const result = grade(puzzle, { maxLevel: profile.maxLevel, techniques: profile.techniques });
    if (!result.solved || result.level < profile.minLevel) continue;
    if (profile.maxAdvancedSteps !== undefined && advancedSteps(result.counts) > profile.maxAdvancedSteps) continue;
    if (profile.requires && !profile.requires.some((id) => result.counts[id])) continue;
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

const advancedSteps = (counts: Partial<Record<TechniqueId, number>>): number =>
  Object.entries(counts).reduce((sum, [id, n]) => sum + ((SINGLES as readonly string[]).includes(id) ? 0 : (n ?? 0)), 0);

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
    if (grade(puzzle, { maxLevel: profile.maxLevel, techniques: profile.techniques }).solved) clues -= group.length;
    else for (const c of group) puzzle[c] = solution[c];
  }
  return puzzle;
}
