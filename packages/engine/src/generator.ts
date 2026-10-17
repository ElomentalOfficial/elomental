import { countClues, gridToString, type Grid } from './grid.ts';
import { grade } from './grader.ts';
import { createRng, randomSeed, type Rng } from './rng.ts';
import { countSolutions, randomSolvedGrid } from './solver.ts';
import type { TechniqueId, TechniqueLevel } from './techniques.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
/**
 * Layout of the givens. 'varied' (the default) picks one per puzzle, mostly
 * free-form with some of the classic symmetric shapes, so puzzles don't all
 * share the same mirrored look.
 */
export type Symmetry = 'none' | 'rotational' | 'mirror' | 'diagonal' | 'varied';
type Layout = Exclude<Symmetry, 'varied'>;

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
  /**
   * Ranked: aim for a puzzle whose rating is close to this (the player's Elo).
   * Takes over from `profile`; see generateRated.
   */
  targetRating?: number;
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
  if (options.targetRating !== undefined) return generateRated(options, options.targetRating);
  const profile: DifficultyProfile = options.profile ? PROFILES[options.profile] : DIFFICULTIES[options.difficulty];
  const seed = options.seed ?? randomSeed();
  const maxAttempts = options.maxAttempts ?? 1000;
  const rng = createRng(seed);
  const symmetry = pickLayout(options.symmetry, rng);

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

/** A ranked puzzle is on target when its rating is within this of the goal... */
export const RATING_WINDOW = 100;
/** ...and the window widens by this much every WIDEN_EVERY attempts that miss. */
const WIDEN_BY = 50;
const WIDEN_EVERY = 60;
const RATED_ATTEMPTS = 300;
/** Rounds of giving clues back to a puzzle that came out too hard, and cells tried per round. */
const GIVE_BACK_ROUNDS = 8;
const GIVE_BACK_TRIES = 3;

/**
 * Carving shape for a target rating: the technique levels the target can
 * need, so carves land on or above it (a puzzle that comes out too hard gets
 * clues back). See estimateRating for the rating bands.
 */
export function ratedProfile(target: number): DifficultyProfile {
  if (target < 260) return { minLevel: 1, maxLevel: 1, minClues: 30 };
  if (target < 650) return { minLevel: 1, maxLevel: 2, minClues: 24 };
  if (target < 1150) return { minLevel: 1, maxLevel: 3, minClues: 22 };
  return { minLevel: 1, maxLevel: 4, minClues: 17 };
}

/** The Ranked tier a rating falls in (the server stores it; it sets Stardust and the too-fast floor). */
export function difficultyForRating(rating: number): Difficulty {
  if (rating < 300) return 'easy';
  if (rating < 750) return 'medium';
  return 'hard';
}

/**
 * Ranked: carves puzzles until one's rating lands within RATING_WINDOW of the
 * target, widening the window as attempts run out. If nothing lands (a target
 * beyond what the techniques can rate), the closest puzzle found is used.
 * Deterministic for a given seed and target.
 */
function generateRated(options: GenerateOptions, target: number): GeneratedPuzzle {
  const profile = ratedProfile(target);
  const seed = options.seed ?? randomSeed();
  const maxAttempts = options.maxAttempts ?? RATED_ATTEMPTS;
  const rng = createRng(seed);
  const symmetry = pickLayout(options.symmetry, rng);
  let best: GeneratedPuzzle | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const window = RATING_WINDOW + WIDEN_BY * Math.floor((attempt - 1) / WIDEN_EVERY);
    const solution = randomSolvedGrid(rng);
    const carved = carve(solution, profile, symmetry, rng);
    const graded = grade(carved, { maxLevel: profile.maxLevel, recordSteps: true });
    if (!graded.solved) continue;
    const { puzzle, result } = giveBack(carved, solution, graded, target + window, profile, symmetry, rng);
    const miss = Math.abs(result.rating - target);
    if (!best || miss < Math.abs(best.rating - target)) {
      best = {
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
    if (miss <= window) break;
  }
  if (!best) throw new Error(`No puzzle near rating ${target} in ${maxAttempts} attempts (seed ${seed})`);
  return { ...best, attempts };
}

/**
 * Makes a too-hard puzzle easier until its rating is at most `ceiling`: each
 * round tries a few cells from the first step that needed the hardest
 * technique (its pattern and the squares it cleared) and gives back the clue
 * that brings the rating closest to the ceiling without going under it by
 * more than needed. Adding clues keeps the solution unique.
 */
function giveBack(
  carved: Grid,
  solution: Grid,
  graded: ReturnType<typeof grade>,
  ceiling: number,
  profile: DifficultyProfile,
  symmetry: Layout,
  rng: Rng,
): { puzzle: Grid; result: ReturnType<typeof grade> } {
  let puzzle = carved;
  let result = graded;
  for (let round = 0; round < GIVE_BACK_ROUNDS && result.rating > ceiling; round++) {
    const step = result.steps.find((s) => s.technique === result.hardest)!;
    const cells = rng.shuffle([...new Set([...(step.pattern ?? []), ...step.eliminations.map(([c]) => c)])]);
    let next: { puzzle: Grid; result: ReturnType<typeof grade> } | null = null;
    for (const cell of cells.slice(0, GIVE_BACK_TRIES)) {
      const candidate = Uint8Array.from(puzzle);
      for (const c of orbit(cell, symmetry)) candidate[c] = solution[c];
      const r = grade(candidate, { maxLevel: profile.maxLevel, recordSteps: true });
      // Prefer the smallest drop that still gets under the ceiling, else the biggest drop.
      const better =
        !next ||
        (r.rating <= ceiling
          ? next.result.rating > ceiling || r.rating > next.result.rating
          : next.result.rating > ceiling && r.rating < next.result.rating);
      if (better) next = { puzzle: candidate, result: r };
    }
    if (!next || next.result.rating >= result.rating) break;
    ({ puzzle, result } = next);
  }
  return { puzzle, result };
}

const advancedSteps = (counts: Partial<Record<TechniqueId, number>>): number =>
  Object.entries(counts).reduce((sum, [id, n]) => sum + ((SINGLES as readonly string[]).includes(id) ? 0 : (n ?? 0)), 0);

/**
 * 'varied': about half free-form, the rest split between the classic shapes
 * (rotational, mirrored left-right, mirrored on the diagonal).
 */
function pickLayout(requested: Symmetry | undefined, rng: Rng): Layout {
  if (requested && requested !== 'varied') return requested;
  const roll = rng.next();
  if (roll < 0.5) return 'none';
  if (roll < 0.7) return 'rotational';
  if (roll < 0.85) return 'mirror';
  return 'diagonal';
}

/** The cells removed together with `cell` under a layout (itself included). */
function orbit(cell: number, layout: Layout): number[] {
  const r = Math.floor(cell / 9);
  const c = cell % 9;
  const partner =
    layout === 'rotational' ? 80 - cell : layout === 'mirror' ? r * 9 + (8 - c) : layout === 'diagonal' ? c * 9 + r : cell;
  return partner === cell ? [cell] : [cell, partner];
}

/**
 * Removes givens in random order, keeping a removal only while the puzzle
 * stays solvable with the profile's techniques. Since those techniques never
 * guess, staying solvable also proves the solution is unique.
 *
 * Like a human setter, it keeps every digit among the givens (at least two
 * of each when the profile has room), so no number is missing from the start.
 */
function carve(solution: Grid, profile: DifficultyProfile, symmetry: Layout, rng: Rng): Grid {
  const puzzle = Uint8Array.from(solution);
  const minPerDigit = profile.minClues >= 24 ? 2 : 1;
  const perDigit = new Array(10).fill(9);
  const done = new Uint8Array(81);
  let clues = 81;
  for (const cell of rng.shuffle(Array.from({ length: 81 }, (_, i) => i))) {
    if (done[cell]) continue;
    const group = orbit(cell, symmetry);
    for (const c of group) done[c] = 1;
    if (clues - group.length < profile.minClues) continue;
    const take = new Array(10).fill(0);
    for (const c of group) take[solution[c]]++;
    if (take.some((n, d) => n && perDigit[d] - n < minPerDigit)) continue;
    for (const c of group) puzzle[c] = 0;
    // Expert grading is slow when it gets stuck; a second solution rules the removal out faster.
    const unique = profile.maxLevel < 3 || countSolutions(puzzle) === 1;
    if (unique && grade(puzzle, { maxLevel: profile.maxLevel, techniques: profile.techniques }).solved) {
      clues -= group.length;
      for (const c of group) perDigit[solution[c]]--;
    } else for (const c of group) puzzle[c] = solution[c];
  }
  return puzzle;
}
