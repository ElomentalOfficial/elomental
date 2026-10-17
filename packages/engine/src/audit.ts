import { PEERS, UNITS, bit, lowestDigit, popcount, type Grid } from './grid.ts';
import { applyStep, createSolverState } from './grader.ts';
import { solve } from './solver.ts';
import { TECHNIQUES, type SolverState, type TechniqueLevel } from './techniques.ts';

/**
 * Was a square solved by working it out, or copied from a solved grid?
 *
 * A person can only fill a square once it can be worked out from what's on
 * the board (and in their notes). They place the singles they can see, and
 * reach for a harder technique only when there are none. Someone typing
 * answers from a solver fills squares that can't be found yet. The audit
 * replays the placements the way a person would solve and counts the leaps.
 */

/** One entry on the board: `digit` 0 clears the square. `at` is ms since the start. */
export interface Move {
  cell: number;
  digit: number;
  at: number;
}

export interface SolveAudit {
  /** Correct digits placed (wrong ones fade by themselves and are mistakes, not placements). */
  placements: number;
  /** Placements that couldn't be worked out yet when they were made. */
  leaps: number;
  leapRatio: number;
  /**
   * Placements made while at most half the empty squares could be worked out.
   * Late in a solve nearly every square is a single, so copying looks normal
   * there; these are the moves that tell the two apart.
   */
  telling: number;
  /** Leaps among the telling placements. */
  tellingLeaps: number;
  /**
   * Weight of evidence (log-likelihood): positive means worked out, negative
   * means copied. A move into one of the few squares that can be worked out
   * points to a person; a move into one that can't, to copying; late moves,
   * when everything is workable, count for almost nothing.
   */
  evidence: number;
  /**
   * The evidence the same solve would show had every move been workable.
   * Small on easy puzzles (nearly every square is workable at any moment), so
   * those can't be judged and are never called copied.
   */
  potential: number;
  /** Share of placements that went into the next empty square in reading order. */
  readingOrder: number;
  copied: boolean;
  /** Why it was called copied (for the review flag). */
  reason: string | null;
}

/** How often the model person places a square they can't work out yet (a guess, a slip). Generous on purpose. */
const HUMAN_LEAP_RATE = 0.15;
/**
 * Copied when the evidence is clearly negative, or when the puzzle offered
 * enough to judge (potential) and the solve kept too little of it.
 * Calibrated on simulated solves (test/audit.test.ts).
 */
const COPIED_EVIDENCE = -8;
const JUDGEABLE_POTENTIAL = 8;
const COPIED_SHARE = 0.4;
/** Technique steps tried for a square that isn't a single yet (someone using a pair or a wing right there). */
const EXTRA_STEPS = 3;

/** Digits that fit nowhere else: naked and hidden singles on a candidate grid. */
function singles(state: SolverState): Map<number, number> {
  const found = new Map<number, number>();
  for (let c = 0; c < 81; c++) {
    if (state.values[c] === 0 && popcount(state.cands[c]) === 1) found.set(c, lowestDigit(state.cands[c]));
  }
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      let spot = -1;
      let count = 0;
      for (const c of unit) {
        if (state.values[c] === 0 && state.cands[c] & bit(d)) {
          spot = c;
          count++;
        }
      }
      if (count === 1) found.set(spot, d);
    }
  }
  return found;
}

function place(state: SolverState, cell: number, digit: number): void {
  state.values[cell] = digit;
  state.cands[cell] = 0;
  for (const p of PEERS[cell]) state.cands[p] &= ~bit(digit);
}

const copyState = (state: SolverState): SolverState => ({ values: Uint8Array.from(state.values), cands: Uint16Array.from(state.cands) });

/**
 * What a person can fill right now: the singles, plus the singles those
 * reveal (a quick solver types two squares spotted together in either order).
 */
export function frontier(state: SolverState): Map<number, number> {
  const now = singles(state);
  const next = copyState(state);
  for (const [c, d] of now) place(next, c, d);
  const found = new Map(now);
  for (const [c, d] of singles(next)) if (!found.has(c)) found.set(c, d);
  return found;
}

/** Applies the easiest elimination available; false when none is left. */
function easiestElimination(state: SolverState, maxLevel: TechniqueLevel): boolean {
  for (const t of TECHNIQUES) {
    if (t.level < 2 || t.level > maxLevel) continue;
    const step = t.find(state);
    if (step) {
      applyStep(state, step);
      return true;
    }
  }
  return false;
}

/**
 * Can `cell` be `digit` from here? Singles first. If there are none, the
 * person is stuck and works with techniques (the notes they'd write persist
 * in `state`). If there are singles elsewhere, a few technique steps are still
 * allowed for this square, in case they were working on it.
 */
function workable(state: SolverState, cell: number, digit: number, maxLevel: TechniqueLevel): boolean {
  if (frontier(state).get(cell) === digit) return true;
  if (singles(state).size === 0) {
    // Stuck: eliminate until something opens up; those eliminations stay (they're the notes).
    while (singles(state).size === 0 && easiestElimination(state, maxLevel));
    return frontier(state).get(cell) === digit;
  }
  const trial = copyState(state);
  for (let i = 0; i < EXTRA_STEPS && easiestElimination(trial, maxLevel); i++) {
    if (frontier(trial).get(cell) === digit) return true;
  }
  return false;
}

export function auditSolve(givens: Grid, moves: readonly Move[], maxLevel: TechniqueLevel = 5): SolveAudit {
  const solution = solve(givens);
  if (!solution) {
    return {
      placements: 0,
      leaps: 0,
      leapRatio: 0,
      telling: 0,
      tellingLeaps: 0,
      evidence: -Infinity,
      potential: 0,
      readingOrder: 0,
      copied: true,
      reason: 'givens have no solution',
    };
  }
  let evidence = 0;
  let potential = 0;
  let state = createSolverState(givens);
  let placements = 0;
  let leaps = 0;
  let telling = 0;
  let tellingLeaps = 0;
  let inOrder = 0;
  let previous = -1;
  for (const { cell, digit } of moves) {
    if (!Number.isInteger(cell) || cell < 0 || cell > 80 || givens[cell]) continue;
    if (digit === 0) {
      // A cleared square: start the notes over from the board.
      if (state.values[cell]) {
        const board = Uint8Array.from(state.values);
        board[cell] = 0;
        state = createSolverState(board);
      }
      continue;
    }
    if (digit !== solution[cell] || state.values[cell] === digit) continue;
    placements++;
    if (previous >= 0) {
      let nextEmpty = -1;
      for (let c = previous + 1; c < 81 && nextEmpty < 0; c++) if (!state.values[c]) nextEmpty = c;
      if (nextEmpty === cell) inOrder++;
    }
    const leap = !workable(state, cell, digit, maxLevel);
    let empty = 0;
    for (const v of state.values) if (!v) empty++;
    const open = Math.min(frontier(state).size, empty);
    if (open * 2 <= empty) {
      telling++;
      if (leap) tellingLeaps++;
    }
    // A person picks among the `open` workable squares (now and then not);
    // a copier picks any of the `empty` ones.
    const worked = Math.log(((1 - HUMAN_LEAP_RATE) * empty) / Math.max(open, 1));
    potential += worked;
    if (!leap) evidence += worked;
    else if (empty > open) evidence += Math.log((HUMAN_LEAP_RATE * empty) / (empty - open));
    if (leap) leaps++;
    place(state, cell, digit);
    previous = cell;
  }
  const leapRatio = placements ? leaps / placements : 0;
  const readingOrder = placements > 1 ? inOrder / (placements - 1) : 0;
  const copied =
    evidence <= COPIED_EVIDENCE || (potential >= JUDGEABLE_POTENTIAL && evidence < COPIED_SHARE * potential);
  return {
    placements,
    leaps,
    leapRatio,
    telling,
    tellingLeaps,
    evidence,
    potential,
    readingOrder,
    copied,
    reason: copied ? `${leaps} of ${placements} squares placed before they could be worked out` : null,
  };
}
