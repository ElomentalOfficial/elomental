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
   * The lowest share of its possible evidence that any run of consecutive
   * placements kept (1 when too short to judge): a solve that's honest for a
   * while and copied for the rest still shows its copied part.
   */
  worstStretch: number;
  /** The most leaps within any run of consecutive placements (copying comes in runs; slips don't). */
  leapBurst: number;
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
/**
 * Copied when some run of WINDOW placements kept less than this share of the
 * evidence it could have shown (an honest start, then the rest copied).
 * Only runs that could show at least WINDOW_POTENTIAL are judged.
 */
const COPIED_STRETCH = 0.2;
/** …and only with at least this many leaps in that run: a slip or two never makes a run look copied. */
const COPIED_BURST = 5;
const WINDOW = 20;
const WINDOW_POTENTIAL = 6;
const JUDGEABLE_POTENTIAL = 8;
const COPIED_SHARE = 0.3;
/** Technique steps tried for a square that isn't a single yet (someone using a pair or a wing right there). */
const EXTRA_STEPS = 3;
/**
 * A square that only becomes a single after another one is placed counts as
 * worked out if that other one follows within this many placements (two
 * squares spotted together and typed in either order).
 */
const UNLOCK_WITHIN = 2;

/** Digits that fit nowhere else: naked and hidden singles on a candidate grid. */
export function singles(state: SolverState): Map<number, number> {
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
 * Can `cell` be `digit` right now? It must be a single. If there are none, the
 * person is stuck and works with techniques (the notes they'd write persist
 * in `state`). If there are singles elsewhere, a few technique steps are still
 * allowed for this square, in case they were working on it.
 */
function workable(state: SolverState, cell: number, digit: number, maxLevel: TechniqueLevel): boolean {
  if (singles(state).get(cell) === digit) return true;
  if (singles(state).size === 0) {
    // Stuck: eliminate until something opens up; those eliminations stay (they're the notes).
    while (singles(state).size === 0 && easiestElimination(state, maxLevel));
    return singles(state).get(cell) === digit;
  }
  const trial = copyState(state);
  for (let i = 0; i < EXTRA_STEPS && easiestElimination(trial, maxLevel); i++) {
    if (singles(trial).get(cell) === digit) return true;
  }
  return false;
}

/**
 * The singles that would make `cell` a single once placed: a person who types
 * `cell` first must have seen it through one of these, and places that one
 * next. (Someone copying a solved grid seldom does.)
 */
function unlockers(state: SolverState, cell: number, digit: number): Set<number> {
  const found = new Set<number>();
  for (const [c, d] of singles(state)) {
    const next = copyState(state);
    place(next, c, d);
    if (singles(next).get(cell) === digit) found.add(c);
  }
  return found;
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
      worstStretch: -Infinity,
      leapBurst: 0,
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
  /** Placements that become worked out if one of `unlock` is placed by placement number `until`. */
  let pending: { index: number; unlock: Set<number>; until: number; worked: number; leapt: number; telling: boolean }[] = [];
  // Per placement: what it earned, and what it could have (for the window below).
  const earned: number[] = [];
  const possible: number[] = [];
  const count = (index: number, weight: number) => {
    evidence += weight;
    earned[index] = weight;
  };
  const leapt: boolean[] = [];
  const settle = (p: (typeof pending)[number], worked: boolean) => {
    count(p.index, worked ? p.worked : p.leapt);
    if (!worked) {
      leapt[p.index] = true;
      leaps++;
      if (p.telling) tellingLeaps++;
    }
  };
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
    let empty = 0;
    for (const v of state.values) if (!v) empty++;
    // Counted before `workable`, which may write notes into the state when stuck.
    const before = singles(state).size;
    const ok = workable(state, cell, digit, maxLevel);
    const open = Math.min(Math.max(before, singles(state).size), empty);
    const isTelling = open * 2 <= empty;
    if (isTelling) telling++;
    // A person picks among the `open` workable squares (now and then not);
    // a copier picks any of the `empty` ones.
    const worked = Math.log(((1 - HUMAN_LEAP_RATE) * empty) / Math.max(open, 1));
    const leapt = empty > open ? Math.log((HUMAN_LEAP_RATE * empty) / (empty - open)) : 0;
    potential += worked;
    const index = placements - 1;
    possible[index] = worked;
    // Not a single yet, but one placement away: decided by whether that placement follows.
    const unlock = ok ? null : unlockers(state, cell, digit);
    place(state, cell, digit);
    // This placement may be the one an earlier square was waiting for.
    const still: typeof pending = [];
    for (const p of pending) {
      if (p.unlock.has(cell)) settle(p, true);
      else if (placements >= p.until) settle(p, false);
      else still.push(p);
    }
    pending = still;
    const entry = { index, unlock: unlock ?? new Set<number>(), until: placements + UNLOCK_WITHIN, worked, leapt, telling: isTelling };
    if (ok) count(index, worked);
    else if (unlock?.size) pending.push(entry);
    else settle(entry, false);
    previous = cell;
  }
  for (const p of pending) settle(p, false);
  // The worst stretch: the lowest share any run of WINDOW placements kept of what it could have shown.
  // And the most leaps in any run of WINDOW placements; `copiedRun` when one run is both.
  let worstStretch = 1;
  let leapBurst = 0;
  let copiedRun = false;
  let got = 0;
  let could = 0;
  let burst = 0;
  for (let i = 0; i < placements; i++) {
    got += earned[i];
    could += possible[i];
    if (leapt[i]) burst++;
    if (i >= WINDOW) {
      got -= earned[i - WINDOW];
      could -= possible[i - WINDOW];
      if (leapt[i - WINDOW]) burst--;
    }
    leapBurst = Math.max(leapBurst, burst);
    if (i >= WINDOW - 1 && could >= WINDOW_POTENTIAL) {
      worstStretch = Math.min(worstStretch, got / could);
      if (burst >= COPIED_BURST && got < COPIED_STRETCH * could) copiedRun = true;
    }
  }
  const leapRatio = placements ? leaps / placements : 0;
  const readingOrder = placements > 1 ? inOrder / (placements - 1) : 0;
  const copied =
    evidence <= COPIED_EVIDENCE ||
    copiedRun ||
    (potential >= JUDGEABLE_POTENTIAL && evidence < COPIED_SHARE * potential);
  return {
    placements,
    leaps,
    leapRatio,
    telling,
    tellingLeaps,
    evidence,
    worstStretch,
    leapBurst,
    potential,
    readingOrder,
    copied,
    reason: copied ? `${leaps} of ${placements} squares placed before they could be worked out` : null,
  };
}
