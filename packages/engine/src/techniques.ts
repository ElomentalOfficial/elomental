import {
  ALL_DIGITS,
  BOXES,
  BOX_OF,
  COL_OF,
  ROW_OF,
  UNITS,
  bit,
  digitsOf,
  isPeer,
  lowestDigit,
  popcount,
} from './grid.ts';

/**
 * Human solving techniques. Each `find` looks for one application of its
 * technique on the current candidate grid and returns it as a Step, or null.
 * Every technique here is a sound deduction, so a puzzle that these alone
 * can finish has exactly one solution and never requires guessing.
 */

export type TechniqueId =
  | 'fullHouse'
  | 'hiddenSingle'
  | 'nakedSingle'
  | 'pointing'
  | 'claiming'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'xyWing'
  | 'nakedQuad'
  | 'hiddenQuad'
  | 'swordfish'
  | 'xyzWing'
  | 'jellyfish';

/** 1 = singles (easy), 2 = intersections and subsets (medium), 3 = fish and wings (hard). */
export type TechniqueLevel = 1 | 2 | 3;

export interface SolverState {
  values: Uint8Array;
  /** Candidate bitmask per cell; 0 for filled cells. */
  cands: Uint16Array;
}

/** [cell, digit] */
export type CellDigit = [number, number];

export interface Step {
  technique: TechniqueId;
  placements: CellDigit[];
  eliminations: CellDigit[];
  /** The unit (0-8 rows, 9-17 columns, 18-26 boxes) the deduction is about, when there is one. */
  unit?: number;
  /** The cells that form the pattern (pair, wing, fish...), for explaining the step. */
  pattern?: number[];
  /** The digits the pattern is about. */
  digits?: number[];
}

type StepContext = Pick<Step, 'unit' | 'pattern' | 'digits'>;

export interface Technique {
  id: TechniqueId;
  name: string;
  level: TechniqueLevel;
  /** Relative difficulty; the grader always tries the lowest weight first. */
  weight: number;
  find(state: SolverState): Step | null;
}

const placement = (technique: TechniqueId, cell: number, digit: number, unit?: number): Step => ({
  technique,
  placements: [[cell, digit]],
  eliminations: [],
  ...(unit === undefined ? {} : { unit }),
});

const elimination = (technique: TechniqueId, eliminations: CellDigit[], context: StepContext = {}): Step | null =>
  eliminations.length ? { technique, placements: [], eliminations, ...context } : null;

/** Empty cells among `cells` that still have `digit` as a candidate. */
function withCandidate(state: SolverState, cells: number[], digit: number): number[] {
  const b = bit(digit);
  return cells.filter((c) => state.values[c] === 0 && state.cands[c] & b);
}

function placedMask(state: SolverState, unit: number[]): number {
  let mask = 0;
  for (const c of unit) if (state.values[c]) mask |= bit(state.values[c]);
  return mask;
}

function* combinations<T>(items: readonly T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield prefix.slice();
    return;
  }
  for (let i = start; i <= items.length - (size - prefix.length); i++) {
    prefix.push(items[i]);
    yield* combinations(items, size, i + 1, prefix);
    prefix.pop();
  }
}

// --- Level 1: singles ------------------------------------------------------

function findFullHouse(state: SolverState): Step | null {
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    let empty = -1;
    let count = 0;
    for (const c of unit) {
      if (state.values[c] === 0) {
        empty = c;
        count++;
      }
    }
    if (count === 1) return placement('fullHouse', empty, lowestDigit(ALL_DIGITS & ~placedMask(state, unit)), u);
  }
  return null;
}

function findHiddenSingle(state: SolverState): Step | null {
  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const placed = placedMask(state, unit);
    for (let d = 1; d <= 9; d++) {
      if (placed & bit(d)) continue;
      const cells = withCandidate(state, unit, d);
      if (cells.length === 1) return placement('hiddenSingle', cells[0], d, u);
    }
  }
  return null;
}

function findNakedSingle(state: SolverState): Step | null {
  for (let c = 0; c < 81; c++) {
    if (state.values[c] === 0 && popcount(state.cands[c]) === 1) {
      return placement('nakedSingle', c, lowestDigit(state.cands[c]));
    }
  }
  return null;
}

// --- Level 2: intersections and subsets ------------------------------------

/** A digit confined to one row/column inside a box is removed from the rest of that line. */
function findPointing(state: SolverState): Step | null {
  for (let b = 0; b < 9; b++) {
    for (let d = 1; d <= 9; d++) {
      const cells = withCandidate(state, BOXES[b], d);
      if (cells.length < 2) continue;
      const row = ROW_OF[cells[0]];
      const col = COL_OF[cells[0]];
      let line: number[] | null = null;
      if (cells.every((c) => ROW_OF[c] === row)) line = UNITS[row];
      else if (cells.every((c) => COL_OF[c] === col)) line = UNITS[9 + col];
      if (!line) continue;
      const step = elimination(
        'pointing',
        withCandidate(state, line, d)
          .filter((c) => BOX_OF[c] !== b)
          .map((c): CellDigit => [c, d]),
        { unit: 18 + b, pattern: cells, digits: [d] },
      );
      if (step) return step;
    }
  }
  return null;
}

/** A digit confined to one box inside a row/column is removed from the rest of that box. */
function findClaiming(state: SolverState): Step | null {
  for (let u = 0; u < 18; u++) {
    const line = UNITS[u];
    for (let d = 1; d <= 9; d++) {
      const cells = withCandidate(state, line, d);
      if (cells.length < 2) continue;
      const box = BOX_OF[cells[0]];
      if (!cells.every((c) => BOX_OF[c] === box)) continue;
      const step = elimination(
        'claiming',
        withCandidate(state, BOXES[box], d)
          .filter((c) => !line.includes(c))
          .map((c): CellDigit => [c, d]),
        { unit: u, pattern: cells, digits: [d] },
      );
      if (step) return step;
    }
  }
  return null;
}

/** N cells in a unit whose candidates together are exactly N digits. */
function nakedSubset(id: TechniqueId, size: number) {
  return (state: SolverState): Step | null => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u];
      const cells = unit.filter((c) => {
        const n = state.values[c] === 0 ? popcount(state.cands[c]) : 0;
        return n >= 2 && n <= size;
      });
      if (cells.length < size) continue;
      for (const combo of combinations(cells, size)) {
        let union = 0;
        for (const c of combo) union |= state.cands[c];
        if (popcount(union) !== size) continue;
        const eliminations: CellDigit[] = [];
        for (const c of unit) {
          if (state.values[c] !== 0 || combo.includes(c)) continue;
          for (const d of digitsOf(state.cands[c] & union)) eliminations.push([c, d]);
        }
        const step = elimination(id, eliminations, { unit: u, pattern: combo, digits: digitsOf(union) });
        if (step) return step;
      }
    }
    return null;
  };
}

/** N digits in a unit that only fit in the same N cells: those cells lose every other candidate. */
function hiddenSubset(id: TechniqueId, size: number) {
  return (state: SolverState): Step | null => {
    for (let u = 0; u < UNITS.length; u++) {
      const unit = UNITS[u];
      const placed = placedMask(state, unit);
      // For each open digit: a 9-bit mask of the unit positions where it can go.
      const spots: { digit: number; where: number }[] = [];
      for (let d = 1; d <= 9; d++) {
        if (placed & bit(d)) continue;
        let where = 0;
        unit.forEach((c, i) => {
          if (state.values[c] === 0 && state.cands[c] & bit(d)) where |= 1 << i;
        });
        const n = popcount(where);
        if (n >= 2 && n <= size) spots.push({ digit: d, where });
      }
      if (spots.length < size) continue;
      for (const combo of combinations(spots, size)) {
        let where = 0;
        let digits = 0;
        for (const s of combo) {
          where |= s.where;
          digits |= bit(s.digit);
        }
        if (popcount(where) !== size) continue;
        const eliminations: CellDigit[] = [];
        for (let i = 0; i < 9; i++) {
          if (!(where & (1 << i))) continue;
          const c = unit[i];
          for (const d of digitsOf(state.cands[c] & ~digits)) eliminations.push([c, d]);
        }
        const pattern = unit.filter((_, i) => where & (1 << i));
        const step = elimination(id, eliminations, { unit: u, pattern, digits: digitsOf(digits) });
        if (step) return step;
      }
    }
    return null;
  };
}

// --- Level 3: fish and wings -----------------------------------------------

/** X-Wing (2), Swordfish (3), Jellyfish (4): a digit in N rows confined to N columns, or vice versa. */
function fish(id: TechniqueId, size: number) {
  return (state: SolverState): Step | null => {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      for (const rowBased of [true, false]) {
        const cellAt = (line: number, cross: number) => (rowBased ? line * 9 + cross : cross * 9 + line);
        const bases: { line: number; cover: number }[] = [];
        for (let line = 0; line < 9; line++) {
          let cover = 0;
          for (let cross = 0; cross < 9; cross++) {
            const c = cellAt(line, cross);
            if (state.values[c] === 0 && state.cands[c] & b) cover |= 1 << cross;
          }
          const n = popcount(cover);
          if (n >= 2 && n <= size) bases.push({ line, cover });
        }
        if (bases.length < size) continue;
        for (const combo of combinations(bases, size)) {
          let cover = 0;
          for (const base of combo) cover |= base.cover;
          if (popcount(cover) !== size) continue;
          const baseLines = combo.map((base) => base.line);
          const eliminations: CellDigit[] = [];
          for (let cross = 0; cross < 9; cross++) {
            if (!(cover & (1 << cross))) continue;
            for (let line = 0; line < 9; line++) {
              if (baseLines.includes(line)) continue;
              const c = cellAt(line, cross);
              if (state.values[c] === 0 && state.cands[c] & b) eliminations.push([c, d]);
            }
          }
          const pattern: number[] = [];
          for (const line of baseLines) {
            for (let cross = 0; cross < 9; cross++) {
              const c = cellAt(line, cross);
              if (state.values[c] === 0 && state.cands[c] & b) pattern.push(c);
            }
          }
          const step = elimination(id, eliminations, { pattern, digits: [d] });
          if (step) return step;
        }
      }
    }
    return null;
  };
}

function cellsWithCount(state: SolverState, count: number): number[] {
  const cells: number[] = [];
  for (let c = 0; c < 81; c++) if (state.values[c] === 0 && popcount(state.cands[c]) === count) cells.push(c);
  return cells;
}

/** Empty cells (other than `exclude`) holding candidate `z` that see every cell in `seen`. */
function seenByAll(state: SolverState, z: number, seen: number[], exclude: number[]): CellDigit[] {
  const out: CellDigit[] = [];
  const digit = lowestDigit(z);
  for (let c = 0; c < 81; c++) {
    if (state.values[c] !== 0 || !(state.cands[c] & z) || exclude.includes(c)) continue;
    if (seen.every((s) => isPeer(c, s))) out.push([c, digit]);
  }
  return out;
}

/** Pivot {x,y} sees pincers {x,z} and {y,z}: anything seeing both pincers can't be z. */
function findXyWing(state: SolverState): Step | null {
  const bivalue = cellsWithCount(state, 2);
  for (const pivot of bivalue) {
    const pm = state.cands[pivot];
    for (const a of bivalue) {
      if (a === pivot || !isPeer(pivot, a)) continue;
      const am = state.cands[a];
      const shared = am & pm;
      if (popcount(shared) !== 1) continue;
      const z = am & ~pm;
      const bm = (pm & ~shared) | z;
      for (const b of bivalue) {
        if (b === a || b === pivot || !isPeer(pivot, b) || state.cands[b] !== bm) continue;
        const step = elimination('xyWing', seenByAll(state, z, [a, b], [pivot, a, b]), {
          pattern: [pivot, a, b],
          digits: [lowestDigit(z)],
        });
        if (step) return step;
      }
    }
  }
  return null;
}

/** Pivot {x,y,z} sees pincers {x,z} and {y,z}: anything seeing all three can't be z. */
function findXyzWing(state: SolverState): Step | null {
  const bivalue = cellsWithCount(state, 2);
  for (const pivot of cellsWithCount(state, 3)) {
    const pm = state.cands[pivot];
    const pincers = bivalue.filter((c) => isPeer(pivot, c) && (state.cands[c] & ~pm) === 0);
    for (const [a, b] of combinations(pincers, 2)) {
      if (state.cands[a] === state.cands[b]) continue;
      const z = state.cands[a] & state.cands[b];
      const step = elimination('xyzWing', seenByAll(state, z, [pivot, a, b], [pivot, a, b]), {
        pattern: [pivot, a, b],
        digits: [lowestDigit(z)],
      });
      if (step) return step;
    }
  }
  return null;
}

/** Ordered by weight: the grader always applies the easiest technique available. */
export const TECHNIQUES: readonly Technique[] = [
  { id: 'fullHouse', name: 'Full House', level: 1, weight: 0.5, find: findFullHouse },
  { id: 'hiddenSingle', name: 'Hidden Single', level: 1, weight: 1, find: findHiddenSingle },
  { id: 'nakedSingle', name: 'Naked Single', level: 1, weight: 2, find: findNakedSingle },
  { id: 'pointing', name: 'Pointing', level: 2, weight: 4, find: findPointing },
  { id: 'claiming', name: 'Claiming', level: 2, weight: 4, find: findClaiming },
  { id: 'nakedPair', name: 'Naked Pair', level: 2, weight: 5, find: nakedSubset('nakedPair', 2) },
  { id: 'hiddenPair', name: 'Hidden Pair', level: 2, weight: 6, find: hiddenSubset('hiddenPair', 2) },
  { id: 'nakedTriple', name: 'Naked Triple', level: 2, weight: 8, find: nakedSubset('nakedTriple', 3) },
  { id: 'hiddenTriple', name: 'Hidden Triple', level: 2, weight: 9, find: hiddenSubset('hiddenTriple', 3) },
  { id: 'xWing', name: 'X-Wing', level: 3, weight: 12, find: fish('xWing', 2) },
  { id: 'xyWing', name: 'XY-Wing', level: 3, weight: 14, find: findXyWing },
  { id: 'nakedQuad', name: 'Naked Quad', level: 3, weight: 15, find: nakedSubset('nakedQuad', 4) },
  { id: 'hiddenQuad', name: 'Hidden Quad', level: 3, weight: 16, find: hiddenSubset('hiddenQuad', 4) },
  { id: 'swordfish', name: 'Swordfish', level: 3, weight: 17, find: fish('swordfish', 3) },
  { id: 'xyzWing', name: 'XYZ-Wing', level: 3, weight: 18, find: findXyzWing },
  { id: 'jellyfish', name: 'Jellyfish', level: 3, weight: 20, find: fish('jellyfish', 4) },
];

export const TECHNIQUE_BY_ID = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t])) as Record<TechniqueId, Technique>;
