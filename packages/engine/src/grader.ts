import { ALL_DIGITS, PEERS, bit, type Grid } from './grid.ts';
import { TECHNIQUES, type SolverState, type Step, type TechniqueId, type TechniqueLevel } from './techniques.ts';

/**
 * Grades a puzzle by solving it the way a person would: at every step it
 * applies the easiest technique that makes progress. Difficulty comes from
 * which techniques were needed and how often, not from the clue count.
 */

export interface GradeOptions {
  /** Only use techniques up to this level. Defaults to 4 (all). */
  maxLevel?: TechniqueLevel;
  /** Only use these techniques (on top of maxLevel). Defaults to all. */
  techniques?: readonly TechniqueId[];
  /** Keep every step (for hints, replays and soundness tests). */
  recordSteps?: boolean;
}

export interface GradeResult {
  /** False when the allowed techniques got stuck before the grid was full. */
  solved: boolean;
  /** Hardest technique used, or null if no step was taken. */
  hardest: TechniqueId | null;
  level: 0 | TechniqueLevel;
  /** Total effort: the sum of technique weights over every step. */
  score: number;
  /** Starting Elo-style rating for ranked play; recalibrated from real results later. */
  rating: number;
  counts: Partial<Record<TechniqueId, number>>;
  steps: Step[];
}

export function createSolverState(puzzle: Grid): SolverState {
  const values = Uint8Array.from(puzzle);
  const cands = new Uint16Array(81);
  for (let c = 0; c < 81; c++) {
    if (values[c]) continue;
    let used = 0;
    for (const p of PEERS[c]) used |= bit(values[p]);
    cands[c] = ALL_DIGITS & ~used;
  }
  return { values, cands };
}

export function applyStep(state: SolverState, step: Step): void {
  for (const [c, d] of step.placements) {
    state.values[c] = d;
    state.cands[c] = 0;
    for (const p of PEERS[c]) state.cands[p] &= ~bit(d);
  }
  for (const [c, d] of step.eliminations) state.cands[c] &= ~bit(d);
}

export interface Hint {
  cell: number;
  digit: number;
  technique: TechniqueId;
  /** For Full House / Hidden Single: the unit the placement is found in. */
  unit?: number;
  /** Elimination steps (pairs, wings, ...) that had to happen first, in order. */
  prior: Step[];
}

/**
 * The next cell a person would fill and the technique that finds it, using
 * only the digits currently on the board. Elimination steps (pairs, wings,
 * ...) are applied until one of them unlocks a placement, and returned in
 * `prior` so the hint can be explained step by step.
 */
export function nextPlacement(puzzle: Grid, maxLevel: TechniqueLevel = 4): Hint | null {
  const state = createSolverState(puzzle);
  const techniques = TECHNIQUES.filter((t) => t.level <= maxLevel);
  const prior: Step[] = [];
  for (;;) {
    let step: Step | null = null;
    for (const t of techniques) {
      step = t.find(state);
      if (step) break;
    }
    if (!step) return null;
    if (step.placements.length) {
      const [cell, digit] = step.placements[0];
      return { cell, digit, technique: step.technique, unit: step.unit, prior };
    }
    prior.push(step);
    applyStep(state, step);
  }
}

/**
 * Seed rating. The hardest technique sets the floor; every step beyond
 * singles adds its weight again, so a puzzle that needs many hard steps rates
 * above one that needs a single harder one, and the bands overlap instead of
 * leaving gaps. Roughly: singles 145-190, intersections and subsets 300-650,
 * fish and wings 700-1350, links and chains 1150 and up with no ceiling.
 */
function estimateRating(hardestWeight: number, advancedEffort: number): number {
  return Math.round(100 + 45 * hardestWeight + 6 * advancedEffort);
}

export function grade(puzzle: Grid, options: GradeOptions = {}): GradeResult {
  const maxLevel = options.maxLevel ?? 4;
  const allowed = options.techniques;
  const techniques = TECHNIQUES.filter((t) => t.level <= maxLevel && (!allowed || allowed.includes(t.id)));
  const state = createSolverState(puzzle);
  const counts: Partial<Record<TechniqueId, number>> = {};
  const steps: Step[] = [];
  let remaining = 0;
  for (const d of state.values) if (!d) remaining++;

  let hardest: (typeof TECHNIQUES)[number] | null = null;
  let score = 0;
  let advancedEffort = 0;

  while (remaining > 0) {
    let step: Step | null = null;
    let used: (typeof TECHNIQUES)[number] | null = null;
    for (const t of techniques) {
      step = t.find(state);
      if (step) {
        used = t;
        break;
      }
    }
    if (!step || !used) break;

    applyStep(state, step);
    remaining -= step.placements.length;
    counts[used.id] = (counts[used.id] ?? 0) + 1;
    score += used.weight;
    if (used.level > 1) advancedEffort += used.weight;
    if (!hardest || used.weight > hardest.weight) hardest = used;
    if (options.recordSteps) steps.push(step);
  }

  return {
    solved: remaining === 0,
    hardest: hardest?.id ?? null,
    level: hardest?.level ?? 0,
    score,
    rating: estimateRating(hardest?.weight ?? 0, advancedEffort),
    counts,
    steps,
  };
}
