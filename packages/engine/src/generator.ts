import { countClues, gridToString, parseGrid, type Grid } from './grid.ts';
import { grade } from './grader.ts';
import { MASTER_BANK } from './masterBank.ts';
import { createRng, randomSeed, type Rng } from './rng.ts';
import { countSolutions, randomSolvedGrid, solve } from './solver.ts';
import { TECHNIQUE_BY_ID, type TechniqueId, type TechniqueLevel } from './techniques.ts';
import { applyTransform, randomTransform } from './transform.ts';

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
  /** At least this many steps beyond singles. */
  minAdvancedSteps?: number;
  /** At least / at most this many steps that use a technique of maxLevel (a Ranked stage's new family). */
  minTopSteps?: number;
  maxTopSteps?: number;
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
  /** Ranked: the stage the player's Elo plays at (RANKED_STAGES). Takes over from targetRating. */
  rankedStage?: number;
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
  /** Ranked by stage: the stage dealt (lower than asked only if the asked one found nothing). */
  stage?: number;
}

export function generatePuzzle(options: GenerateOptions): GeneratedPuzzle {
  if (options.rankedStage !== undefined) return generateStaged(options, options.rankedStage);
  if (options.targetRating !== undefined) return generateRated(options, options.targetRating);
  const profile: DifficultyProfile = options.profile ? PROFILES[options.profile] : DIFFICULTIES[options.difficulty];
  const seed = options.seed ?? randomSeed();
  const maxAttempts = options.maxAttempts ?? 1000;
  const puzzle = generateProfiled(options, profile, seed, createRng(seed), maxAttempts);
  if (!puzzle) throw new Error(`No ${options.difficulty} puzzle found in ${maxAttempts} attempts (seed ${seed})`);
  return puzzle;
}

/** Carves until a puzzle fits the profile; null if none does in maxAttempts. */
function generateProfiled(options: GenerateOptions, profile: DifficultyProfile, seed: string, rng: Rng, maxAttempts: number): GeneratedPuzzle | null {
  const symmetry = pickLayout(options.symmetry, rng);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solution = randomSolvedGrid(rng);
    const puzzle = carve(solution, profile, symmetry, rng);
    const result = grade(puzzle, { maxLevel: profile.maxLevel, techniques: profile.techniques });
    if (!result.solved || !fits(result.level, result.counts, profile)) continue;
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
  return null;
}

/** Whether a graded puzzle has the shape a profile asks for (beyond being solvable with its techniques). */
function fits(level: number, counts: Partial<Record<TechniqueId, number>>, profile: DifficultyProfile): boolean {
  if (level < profile.minLevel) return false;
  const advanced = advancedSteps(counts);
  if (profile.maxAdvancedSteps !== undefined && advanced > profile.maxAdvancedSteps) return false;
  if (profile.minAdvancedSteps !== undefined && advanced < profile.minAdvancedSteps) return false;
  if (profile.requires && !profile.requires.some((id) => counts[id])) return false;
  if (profile.minTopSteps !== undefined || profile.maxTopSteps !== undefined) {
    const top = topSteps(counts, profile.maxLevel);
    if (top < (profile.minTopSteps ?? 0) || top > (profile.maxTopSteps ?? Infinity)) return false;
  }
  return true;
}

const topSteps = (counts: Partial<Record<TechniqueId, number>>, level: TechniqueLevel): number =>
  Object.entries(counts).reduce((sum, [id, n]) => sum + (TECHNIQUE_BY_ID[id as TechniqueId].level === level ? (n ?? 0) : 0), 0);

const PAIRS = ['nakedPair', 'hiddenPair'] as const;
const SUBSETS = [...PAIRS, 'nakedTriple', 'hiddenTriple'] as const;
const LEVEL_2 = [...SINGLES, 'pointing', 'claiming', ...SUBSETS] as const;

export interface RankedStage {
  /** N1 … E2: rank initial and step (docs/review/elo-ladder-2026-10-21-economy.md §3.2). */
  id: string;
  /** The Elo it starts at. */
  from: number;
  /** The engine rating it stands for: par, the server's rating clamp and the Easy/Medium/Hard label go by it. */
  rating: number;
  /** How its squares are carved; none for E2, which comes from MASTER_BANK. */
  profile?: DifficultyProfile;
  /** The first stage whose squares can need this technique family (a one-time note on the result). */
  introduces?: 'pointing' | 'pairs' | 'wings' | 'chains' | 'finned';
}

/**
 * Ranked squares by stage, not by rating: the player's Elo picks a stage and the stage fixes the
 * square's shape. Each rank is one technique family, and its last stage brings in one step of
 * the next rank's. Mirrors private.ranked_stage / private.stage_rating on the server.
 */
export const RANKED_STAGES: readonly RankedStage[] = [
  // Novice: singles, plenty of givens
  { id: 'N1', from: 0, rating: 150, profile: { minLevel: 1, maxLevel: 1, minClues: 38 } },
  { id: 'N2', from: 200, rating: 160, profile: { minLevel: 1, maxLevel: 1, minClues: 34 } },
  // Apprentice: leaner singles, then pointing and claiming
  { id: 'A1', from: 300, rating: 175, profile: { minLevel: 1, maxLevel: 1, minClues: 30 } },
  {
    id: 'A2', from: 400, rating: 310, introduces: 'pointing',
    profile: { minLevel: 2, maxLevel: 2, minClues: 30, techniques: [...SINGLES, 'pointing', 'claiming'], maxAdvancedSteps: 1 },
  },
  {
    id: 'A3', from: 500, rating: 360,
    profile: { minLevel: 2, maxLevel: 2, minClues: 28, techniques: [...SINGLES, 'pointing', 'claiming'], minAdvancedSteps: 2, maxAdvancedSteps: 3 },
  },
  // Adept: pairs, then triples; its last stage brings in one X-Wing or XY-Wing
  {
    id: 'D1', from: 600, rating: 420, introduces: 'pairs',
    profile: { minLevel: 2, maxLevel: 2, minClues: 28, techniques: [...SINGLES, 'pointing', 'claiming', ...PAIRS], requires: PAIRS, maxAdvancedSteps: 4 },
  },
  { id: 'D2', from: 700, rating: 500, profile: { minLevel: 2, maxLevel: 2, minClues: 26, requires: SUBSETS, maxAdvancedSteps: 5 } },
  { id: 'D3', from: 800, rating: 600, profile: { minLevel: 2, maxLevel: 2, minClues: 24, requires: SUBSETS, minAdvancedSteps: 3 } },
  {
    id: 'D4', from: 900, rating: 780, introduces: 'wings',
    profile: { minLevel: 3, maxLevel: 3, minClues: 24, techniques: [...LEVEL_2, 'xWing', 'xyWing'], maxTopSteps: 1 },
  },
  // Archmage: fish and wings; its last stage brings in one chain
  { id: 'M1', from: 1000, rating: 950, profile: { minLevel: 3, maxLevel: 3, minClues: 22, maxTopSteps: 2 } },
  { id: 'M2', from: 1150, rating: 1100, profile: { minLevel: 3, maxLevel: 3, minClues: 22, minTopSteps: 2 } },
  { id: 'M3', from: 1300, rating: 1350, introduces: 'chains', profile: { minLevel: 4, maxLevel: 4, minClues: 20, maxTopSteps: 1 } },
  // Elomental: chains, then the big finned fish
  { id: 'E1', from: 1450, rating: 1500, profile: { minLevel: 4, maxLevel: 4, minClues: 17 } },
  { id: 'E2', from: 1600, rating: 1750, introduces: 'finned' },
];

/** The stage an Elo plays at (0 = N1). */
export function rankedStage(elo: number): number {
  let i = 0;
  while (i < RANKED_STAGES.length - 1 && elo >= RANKED_STAGES[i + 1].from) i++;
  return i;
}

/** Carves tried for the asked stage, and for each stage below it falls back to. */
const STAGE_ATTEMPTS = 500;
const FALLBACK_ATTEMPTS = 150;
/** A1: singles only, found on the first carve; falling back never goes past it. */
const SURE_STAGE = 2;

/**
 * Ranked by stage. A stage that finds nothing in STAGE_ATTEMPTS falls back to the one below
 * (FALLBACK_ATTEMPTS), then to SURE_STAGE: never harder than asked, and few enough carves that
 * the audit's regeneration stays inside the Edge Function's CPU limit. E2 comes from
 * MASTER_BANK, else carving at its rating. Deterministic for a given seed and stage, so the
 * server's audit deals the same square.
 */
function generateStaged(options: GenerateOptions, stage: number): GeneratedPuzzle {
  const seed = options.seed ?? randomSeed();
  const rng = createRng(seed);
  const asked = Math.min(Math.max(Math.trunc(stage), 0), RANKED_STAGES.length - 1);
  const tries: [number, number][] = [[asked, options.maxAttempts ?? STAGE_ATTEMPTS]];
  if (asked - 1 > SURE_STAGE) tries.push([asked - 1, FALLBACK_ATTEMPTS]);
  if (asked > SURE_STAGE) tries.push([SURE_STAGE, STAGE_ATTEMPTS]);
  for (const [s, budget] of tries) {
    const { profile, rating } = RANKED_STAGES[s];
    if (!profile) return { ...(fromMasterBank(options, rating, seed, rng) ?? generateRated(options, rating, rng)), stage: s };
    const puzzle = generateProfiled(options, profile, seed, rng, budget);
    if (puzzle) return { ...puzzle, stage: s };
  }
  throw new Error(`No Ranked puzzle for stage ${stage} (seed ${seed})`);
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
  if (target < MASTER_RATING) return { minLevel: 1, maxLevel: 4, minClues: 17 };
  return { minLevel: 1, maxLevel: 5, minClues: 17 };
}

/** From this rating Ranked may need level 5 (Finned Swordfish, Finned Jellyfish). */
export const MASTER_RATING = 1600;

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
function generateRated(options: GenerateOptions, target: number, given?: Rng): GeneratedPuzzle {
  const profile = ratedProfile(target);
  const seed = options.seed ?? randomSeed();
  const maxAttempts = options.maxAttempts ?? RATED_ATTEMPTS;
  const rng = given ?? createRng(seed);
  // Above CARVE_REACH carving rarely gets near the target, so the bank goes first.
  if (profile.maxLevel === 5 && (target >= CARVE_REACH || rng.next() < MASTER_SHARE)) {
    const master = fromMasterBank(options, target, seed, rng);
    if (master) return master;
  }
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
  // Carving fell well short of a very high target: one more go at the bank.
  if (profile.maxLevel === 5 && Math.abs(best.rating - target) > MASTER_REACH) {
    const master = fromMasterBank(options, target, seed, rng);
    if (master) return master;
  }
  return { ...best, attempts };
}

/** At level-5 targets, the share of Ranked puzzles that come from MASTER_BANK... */
const MASTER_SHARE = 0.5;
/** ...and from this target up, every one that the bank can match. */
const CARVE_REACH = 3500;
/** A bank puzzle is used only if its rating (after the transform) is within this of the target. */
const MASTER_REACH = 250;
/** Bank entries considered: the transform can move a rating by several hundred either way. */
const MASTER_POOL = 900;
/** Transforms tried before giving up on the bank for this puzzle. */
const MASTER_TRIES = 12;

/**
 * Level 5 from the bank: carving almost never needs a big finned fish, so
 * those puzzles are found offline (scripts/build-master-bank.ts). Each is
 * shown through a random transform, so no two players see the same grid.
 * The grader can take a different path through a transformed grid and rate
 * it quite differently, so each try is graded again and kept only if it lands
 * near the target. Null when no try does.
 */
function fromMasterBank(options: GenerateOptions, target: number, seed: string, rng: Rng): GeneratedPuzzle | null {
  const pool = MASTER_BANK.filter((p) => Math.abs(p.rating - target) <= MASTER_POOL);
  if (!pool.length) return null;
  for (let i = 0; i < MASTER_TRIES; i++) {
    const pick = pool[Math.floor(rng.next() * pool.length)];
    const puzzle = applyTransform(parseGrid(pick.puzzle), randomTransform(rng));
    const result = grade(puzzle);
    if (Math.abs(result.rating - target) <= MASTER_REACH) return masterPuzzle(options, puzzle, result, seed);
  }
  return null;
}

function masterPuzzle(options: GenerateOptions, puzzle: Grid, result: ReturnType<typeof grade>, seed: string): GeneratedPuzzle {
  const solution = solve(puzzle)!;
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
    attempts: 1,
  };
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
