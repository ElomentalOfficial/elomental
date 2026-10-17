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
  | 'jellyfish'
  | 'finnedXWing'
  | 'skyscraper'
  | 'twoStringKite'
  | 'emptyRectangle'
  | 'wWing'
  | 'remotePairs'
  | 'simpleColouring'
  | 'xChain'
  | 'xyChain'
  | 'alsXz'
  | 'finnedSwordfish'
  | 'finnedJellyfish';

/**
 * 1 = singles (easy), 2 = intersections and subsets (medium), 3 = fish and wings (hard),
 * 4 = links, chains and the lighter finned fish (expert, top of Ranked),
 * 5 = big finned fish (master, the very top of Ranked only).
 */
export type TechniqueLevel = 1 | 2 | 3 | 4 | 5;

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

/**
 * Finned X-Wing (2), Swordfish (3), Jellyfish (4): a fish whose base lines have
 * a few extra spots for the digit (the fin), all inside one box. Either a fin
 * square holds the digit, or the fish holds and clears its cover lines. Both
 * ways the digit is gone from the squares that are in the fin's box and on a
 * cover line (outside the base lines). Sashimi fish (a base line whose only
 * spot in the cover sits next to the fin) are covered too.
 */
function finnedFish(id: TechniqueId, size: number) {
  return (state: SolverState): Step | null => {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      for (const rowBased of [true, false]) {
        const cellAt = (line: number, cross: number) => (rowBased ? line * 9 + cross : cross * 9 + line);
        const lineOf = (c: number) => (rowBased ? ROW_OF[c] : COL_OF[c]);
        const crossOf = (c: number) => (rowBased ? COL_OF[c] : ROW_OF[c]);
        const bases: { line: number; spots: number }[] = [];
        for (let line = 0; line < 9; line++) {
          let spots = 0;
          for (let cross = 0; cross < 9; cross++) {
            const c = cellAt(line, cross);
            if (state.values[c] === 0 && state.cands[c] & b) spots |= 1 << cross;
          }
          // A fin lives in one box, so a base line has at most 3 spots beyond its share of the cover.
          const n = popcount(spots);
          if (n >= 2 && n <= size + 3) bases.push({ line, spots });
        }
        if (bases.length < size) continue;
        for (const combo of combinations(bases, size)) {
          let union = 0;
          for (const base of combo) union |= base.spots;
          // 1-3 crosses beyond the cover; none means a plain fish (fish() finds it).
          const extra = popcount(union) - size;
          if (extra < 1 || extra > 3) continue;
          const crosses = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((x) => union & (1 << x));
          const baseLines = combo.map((base) => base.line);
          for (const coverCrosses of combinations(crosses, size)) {
            let cover = 0;
            for (const x of coverCrosses) cover |= 1 << x;
            // Every base line must take part in the cover, or it isn't a fish at all.
            if (!combo.every((base) => base.spots & cover)) continue;
            const fins: number[] = [];
            for (const base of combo) {
              for (let x = 0; x < 9; x++) if (base.spots & ~cover & (1 << x)) fins.push(cellAt(base.line, x));
            }
            const box = BOX_OF[fins[0]];
            if (!fins.every((c) => BOX_OF[c] === box)) continue;
            const eliminations = withCandidate(state, BOXES[box], d)
              .filter((c) => cover & (1 << crossOf(c)) && !baseLines.includes(lineOf(c)))
              .map((c): CellDigit => [c, d]);
            const pattern: number[] = [];
            for (const base of combo) {
              for (let x = 0; x < 9; x++) if (base.spots & (1 << x)) pattern.push(cellAt(base.line, x));
            }
            const step = elimination(id, eliminations, { pattern, digits: [d] });
            if (step) return step;
          }
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

// --- Level 4: links and chains ---------------------------------------------
//
// A strong link on digit d is a unit where d fits in exactly two cells: if one
// of them isn't d, the other is. A weak link is two cells that see each other:
// if one is d, the other isn't. Chains alternate the two.

/** The pairs of cells that are the only two places for `digit` in some unit. */
function strongLinks(state: SolverState, digit: number): { a: number; b: number; unit: number }[] {
  const links: { a: number; b: number; unit: number }[] = [];
  const seen = new Set<number>();
  for (let u = 0; u < UNITS.length; u++) {
    const cells = withCandidate(state, UNITS[u], digit);
    if (cells.length !== 2 || seen.has(cells[0] * 81 + cells[1])) continue;
    seen.add(cells[0] * 81 + cells[1]);
    links.push({ a: cells[0], b: cells[1], unit: u });
  }
  return links;
}

const isRow = (u: number) => u < 9;
const isCol = (u: number) => u >= 9 && u < 18;

/**
 * Two strong links on one digit whose near ends see each other: one of the far
 * ends must be the digit, so any cell seeing both far ends can't be.
 * Skyscraper: both links in rows (or both in columns), near ends sharing a column (row).
 * Two-String Kite: a row link and a column link, near ends sharing a box.
 */
function turbot(id: TechniqueId, fits: (u1: number, u2: number, a1: number, b1: number) => boolean) {
  return (state: SolverState): Step | null => {
    for (let d = 1; d <= 9; d++) {
      const links = strongLinks(state, d);
      for (const [l1, l2] of combinations(links, 2)) {
        for (const [a1, a2] of [[l1.a, l1.b], [l1.b, l1.a]]) {
          for (const [b1, b2] of [[l2.a, l2.b], [l2.b, l2.a]]) {
            if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
            if (!fits(l1.unit, l2.unit, a1, b1)) continue;
            const step = elimination(id, seenByAll(state, bit(d), [a2, b2], [a1, a2, b1, b2]), {
              pattern: [a2, a1, b1, b2],
              digits: [d],
            });
            if (step) return step;
          }
        }
      }
    }
    return null;
  };
}

const skyscraperFits = (u1: number, u2: number, a1: number, b1: number) =>
  (isRow(u1) && isRow(u2) && COL_OF[a1] === COL_OF[b1]) || (isCol(u1) && isCol(u2) && ROW_OF[a1] === ROW_OF[b1]);

const kiteFits = (u1: number, u2: number, a1: number, b1: number) =>
  ((isRow(u1) && isCol(u2)) || (isCol(u1) && isRow(u2))) && BOX_OF[a1] === BOX_OF[b1];

/**
 * Empty Rectangle: in a box, the digit only fits along one row and one column
 * of it (a cross, using both arms). A line outside the box has just two spots
 * for the digit, one of them (near) in line with the cross. If near holds the
 * digit, the box's digit is pushed onto the cross's other line; if it doesn't,
 * the far end holds it. Either way the square where the far end's line meets
 * the cross's other line can't hold the digit.
 */
function findEmptyRectangle(state: SolverState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(state, d).filter((l) => l.unit < 18);
    if (!links.length) continue;
    for (let box = 0; box < 9; box++) {
      const cells = withCandidate(state, BOXES[box], d);
      if (cells.length < 2) continue;
      const top = ROW_OF[BOXES[box][0]];
      const left = COL_OF[BOXES[box][0]];
      const inBoxRows = (r: number) => r >= top && r < top + 3;
      const inBoxCols = (c: number) => c >= left && c < left + 3;
      for (let r = top; r < top + 3; r++) {
        for (let c = left; c < left + 3; c++) {
          if (!cells.every((x) => ROW_OF[x] === r || COL_OF[x] === c)) continue;
          // Only one arm used: that's plain pointing, not an empty rectangle.
          if (cells.every((x) => ROW_OF[x] === r) || cells.every((x) => COL_OF[x] === c)) continue;
          for (const link of links) {
            for (const [near, far] of [
              [link.a, link.b],
              [link.b, link.a],
            ]) {
              let target: number;
              if (isCol(link.unit)) {
                // Column link beside the box: near on the cross's row, far below/above the box.
                if (inBoxCols(COL_OF[near]) || ROW_OF[near] !== r || inBoxRows(ROW_OF[far])) continue;
                target = ROW_OF[far] * 9 + c;
              } else {
                // Row link above/below the box: near on the cross's column, far beside the box.
                if (inBoxRows(ROW_OF[near]) || COL_OF[near] !== c || inBoxCols(COL_OF[far])) continue;
                target = r * 9 + COL_OF[far];
              }
              if (state.values[target] !== 0 || !(state.cands[target] & bit(d))) continue;
              return {
                technique: 'emptyRectangle',
                placements: [],
                eliminations: [[target, d]],
                // No `unit`: the hint highlights the box and the line beside it together.
                pattern: [...cells, near, far],
                digits: [d],
              };
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Two cells {x,y} that don't see each other, joined by a strong link on x (one
 * end sees each cell): they can't both be x, so one is y, and anything seeing
 * both can't be y.
 */
function findWWing(state: SolverState): Step | null {
  const bivalue = cellsWithCount(state, 2);
  const links = Array.from({ length: 10 }, (_, d) => (d ? strongLinks(state, d) : []));
  for (const [a, b] of combinations(bivalue, 2)) {
    if (state.cands[a] !== state.cands[b] || isPeer(a, b)) continue;
    const [x1, x2] = digitsOf(state.cands[a]);
    for (const [x, y] of [[x1, x2], [x2, x1]]) {
      for (const link of links[x]) {
        for (const [p, q] of [[link.a, link.b], [link.b, link.a]]) {
          if (p === a || p === b || q === a || q === b || !isPeer(p, a) || !isPeer(q, b)) continue;
          const step = elimination('wWing', seenByAll(state, bit(y), [a, b], [a, b]), {
            pattern: [a, p, q, b],
            digits: [y, x],
          });
          if (step) return step;
        }
      }
    }
  }
  return null;
}

/**
 * 2-colours `nodes` along `edges`: neighbours get opposite colours. Returns
 * each connected group with a colour per cell, skipping any group that can't
 * be coloured (which a consistent grid never produces).
 */
function colourGroups(nodes: number[], edges: (c: number) => number[]): Map<number, 0 | 1>[] {
  const groups: Map<number, 0 | 1>[] = [];
  const done = new Set<number>();
  for (const start of nodes) {
    if (done.has(start)) continue;
    const colour = new Map<number, 0 | 1>([[start, 0]]);
    const queue = [start];
    let consistent = true;
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      done.add(c);
      for (const n of edges(c)) {
        const want = colour.get(c) === 0 ? 1 : 0;
        if (!colour.has(n)) {
          colour.set(n, want);
          queue.push(n);
        } else if (colour.get(n) !== want) consistent = false;
      }
    }
    if (consistent) groups.push(colour);
  }
  return groups;
}

/** Empty cells outside `group` with any of `mask` that see a cell of each colour. */
function seesBothColours(state: SolverState, group: Map<number, 0 | 1>, mask: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < 81; c++) {
    if (state.values[c] !== 0 || !(state.cands[c] & mask) || group.has(c)) continue;
    let seen = 0;
    for (const [g, colour] of group) if (isPeer(c, g)) seen |= 1 << colour;
    if (seen === 3) out.push(c);
  }
  return out;
}

/**
 * Cells holding only the same two digits, each seeing the next: along the
 * chain they alternate, so a cell seeing one of each colour can be neither.
 */
function findRemotePairs(state: SolverState): Step | null {
  const bivalue = cellsWithCount(state, 2);
  const groups = colourGroups(bivalue, (c) =>
    bivalue.filter((n) => n !== c && state.cands[n] === state.cands[c] && isPeer(c, n)),
  );
  for (const group of groups) {
    if (group.size < 4) continue;
    const mask = state.cands[group.keys().next().value!];
    const eliminations: CellDigit[] = [];
    for (const c of seesBothColours(state, group, mask)) {
      for (const d of digitsOf(state.cands[c] & mask)) eliminations.push([c, d]);
    }
    const step = elimination('remotePairs', eliminations, { pattern: [...group.keys()], digits: digitsOf(mask) });
    if (step) return step;
  }
  return null;
}

/**
 * Strong links on one digit joined into a network and coloured alternately:
 * one colour is all true, the other all false. Two same-coloured cells that
 * see each other make that colour false; a cell seeing both colours is out.
 */
function findSimpleColouring(state: SolverState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const links = strongLinks(state, d);
    const adjacent = new Map<number, number[]>();
    for (const { a, b } of links) {
      adjacent.set(a, [...(adjacent.get(a) ?? []), b]);
      adjacent.set(b, [...(adjacent.get(b) ?? []), a]);
    }
    for (const group of colourGroups([...adjacent.keys()], (c) => adjacent.get(c)!)) {
      if (group.size < 4) continue;
      const pattern = [...group.keys()];
      // Colour wrap: a colour that sees itself is false everywhere.
      for (const colour of [0, 1] as const) {
        const cells = pattern.filter((c) => group.get(c) === colour);
        if (cells.some((c, i) => cells.slice(i + 1).some((o) => isPeer(c, o)))) {
          return elimination('simpleColouring', cells.map((c): CellDigit => [c, d]), { pattern, digits: [d] });
        }
      }
      // Colour trap: a cell seeing both colours.
      const step = elimination(
        'simpleColouring',
        seesBothColours(state, group, bit(d)).map((c): CellDigit => [c, d]),
        { pattern, digits: [d] },
      );
      if (step) return step;
    }
  }
  return null;
}

/** Walks `prev` links back from `end` to the chain's start (whose prev is -1). */
function tracePath(end: number, prev: (key: number, step: number) => number): number[] {
  const path: number[] = [];
  for (let key = end, i = 0; key !== -1; key = prev(key, i++)) path.push(key);
  return path.reverse();
}

/**
 * Single-digit chain alternating strong and weak links, starting and ending
 * with a strong link: if the start isn't d, the end is. So one of the two ends
 * is d, and any cell seeing both can't be. Found by breadth-first search, so
 * the shortest chain comes first.
 */
function findXChain(state: SolverState): Step | null {
  for (let d = 1; d <= 9; d++) {
    const b = bit(d);
    const cells = withCandidate(state, Array.from({ length: 81 }, (_, c) => c), d);
    if (cells.length < 4) continue;
    const strong = new Map<number, number[]>();
    for (const { a, b: c } of strongLinks(state, d)) {
      strong.set(a, [...(strong.get(a) ?? []), c]);
      strong.set(c, [...(strong.get(c) ?? []), a]);
    }
    for (const start of strong.keys()) {
      // offPrev: reached as "not d" (after a weak link); onPrev: as "d" (after a strong link).
      const offPrev = new Map<number, number>([[start, -1]]);
      const onPrev = new Map<number, number>();
      const queue: [number, boolean][] = [[start, false]];
      for (let i = 0; i < queue.length; i++) {
        const [cell, on] = queue[i];
        if (on) {
          for (const next of cells) {
            if (next === cell || offPrev.has(next) || !isPeer(cell, next)) continue;
            offPrev.set(next, cell);
            queue.push([next, false]);
          }
          continue;
        }
        for (const next of strong.get(cell) ?? []) {
          if (onPrev.has(next)) continue;
          onPrev.set(next, cell);
          queue.push([next, true]);
          // At least two strong links: one alone is just pointing / claiming.
          if (next === start || offPrev.get(cell) === -1) continue;
          const pattern = tracePath(next, (c, i) => (i % 2 === 0 ? onPrev.get(c)! : offPrev.get(c)!));
          const eliminations: CellDigit[] = [];
          for (const c of cells) {
            if (c !== start && c !== next && state.cands[c] & b && isPeer(c, start) && isPeer(c, next)) {
              eliminations.push([c, d]);
            }
          }
          const step = elimination('xChain', eliminations, { pattern, digits: [d] });
          if (step) return step;
        }
      }
    }
  }
  return null;
}

/**
 * Chain of two-candidate cells, each seeing the next and sharing a digit with
 * it: if the first cell isn't z, the forced digits run down the chain until
 * the last cell is z. So one end is z, and any cell seeing both can't be.
 */
function findXyChain(state: SolverState): Step | null {
  const bivalue = cellsWithCount(state, 2);
  const neighbours = new Map(bivalue.map((c) => [c, bivalue.filter((n) => n !== c && isPeer(c, n))]));
  for (const start of bivalue) {
    for (const z of digitsOf(state.cands[start])) {
      // State key: cell * 10 + the digit the cell is forced to be.
      const first = start * 10 + lowestDigit(state.cands[start] & ~bit(z));
      const prev = new Map<number, number>([[first, -1]]);
      const queue = [first];
      for (let i = 0; i < queue.length; i++) {
        const cell = Math.floor(queue[i] / 10);
        const value = queue[i] % 10;
        for (const next of neighbours.get(cell)!) {
          if (!(state.cands[next] & bit(value))) continue;
          const forced = lowestDigit(state.cands[next] & ~bit(value));
          const key = next * 10 + forced;
          if (prev.has(key)) continue;
          prev.set(key, queue[i]);
          queue.push(key);
          if (forced !== z || next === start) continue;
          const pattern = tracePath(key, (k) => prev.get(k)!).map((k) => Math.floor(k / 10));
          const step = elimination('xyChain', seenByAll(state, bit(z), [start, next], [start, next]), {
            pattern,
            digits: [z],
          });
          if (step) return step;
        }
      }
    }
  }
  return null;
}

// Cell sets as three 27-bit words, for the ALS search's many intersections.
type Bits = [number, number, number];
const EMPTY_BITS = (): Bits => [0, 0, 0];
const addBit = (s: Bits, c: number) => {
  s[(c / 27) | 0] |= 1 << c % 27;
};
const PEER_BITS: Bits[] = Array.from({ length: 81 }, (_, c) => {
  const s = EMPTY_BITS();
  for (let p = 0; p < 81; p++) if (p !== c && isPeer(c, p)) addBit(s, p);
  return s;
});
const ALL_BITS: Bits = [(1 << 27) - 1, (1 << 27) - 1, (1 << 27) - 1];
const andBits = (a: Bits, b: Bits): Bits => [a[0] & b[0], a[1] & b[1], a[2] & b[2]];
const anyBits = (s: Bits) => (s[0] | s[1] | s[2]) !== 0;
const subsetBits = (a: Bits, b: Bits) => (a[0] & ~b[0]) === 0 && (a[1] & ~b[1]) === 0 && (a[2] & ~b[2]) === 0;
function bitsToCells(s: Bits): number[] {
  const cells: number[] = [];
  for (let c = 0; c < 81; c++) if (s[(c / 27) | 0] & (1 << c % 27)) cells.push(c);
  return cells;
}

interface Als {
  cells: number[];
  set: Bits;
  mask: number;
  /** Per digit: the ALS cells holding it, and the cells that see all of those. */
  has: Bits[];
  sees: Bits[];
}

/** Almost-locked sets: N cells in one unit holding N+1 digits between them (up to 4 cells). */
function findAlses(state: SolverState): Als[] {
  const alses: Als[] = [];
  const seen = new Set<string>();
  for (const unit of UNITS) {
    const empty = unit.filter((c) => state.values[c] === 0);
    for (let size = 1; size <= Math.min(4, empty.length - 1); size++) {
      for (const cells of combinations(empty, size)) {
        let mask = 0;
        for (const c of cells) mask |= state.cands[c];
        if (popcount(mask) !== size + 1) continue;
        const key = cells.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const set = EMPTY_BITS();
        for (const c of cells) addBit(set, c);
        const has: Bits[] = [];
        const sees: Bits[] = [];
        for (const d of digitsOf(mask)) {
          has[d] = EMPTY_BITS();
          sees[d] = ALL_BITS;
          for (const c of cells) {
            if (!(state.cands[c] & bit(d))) continue;
            addBit(has[d], c);
            sees[d] = andBits(sees[d], PEER_BITS[c]);
          }
        }
        alses.push({ cells, set, mask, has, sees });
      }
    }
  }
  return alses;
}

/**
 * Two almost-locked sets sharing a digit x whose every copy in one sees every
 * copy in the other (so x can be in at most one of them, and the other set
 * becomes locked). Then for another shared digit z, one of the two sets holds
 * z, and any cell seeing every z in both can't be z.
 */
function findAlsXz(state: SolverState): Step | null {
  const alses = findAlses(state);
  const candBits: Bits[] = [];
  for (let d = 1; d <= 9; d++) {
    candBits[d] = EMPTY_BITS();
    for (let c = 0; c < 81; c++) if (state.values[c] === 0 && state.cands[c] & bit(d)) addBit(candBits[d], c);
  }
  for (let i = 0; i < alses.length; i++) {
    const a = alses[i];
    for (let j = i + 1; j < alses.length; j++) {
      const b = alses[j];
      const common = a.mask & b.mask;
      if (popcount(common) < 2 || anyBits(andBits(a.set, b.set))) continue;
      for (const x of digitsOf(common)) {
        if (!subsetBits(b.has[x], a.sees[x])) continue;
        for (const z of digitsOf(common & ~bit(x))) {
          const targets = andBits(andBits(a.sees[z], b.sees[z]), candBits[z]);
          for (let w = 0; w < 3; w++) targets[w] &= ~(a.set[w] | b.set[w]);
          if (!anyBits(targets)) continue;
          return elimination('alsXz', bitsToCells(targets).map((c): CellDigit => [c, z]), {
            pattern: [...a.cells, ...b.cells],
            digits: [z, x],
          });
        }
      }
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
  { id: 'finnedXWing', name: 'Finned X-Wing', level: 4, weight: 20.5, find: finnedFish('finnedXWing', 2) },
  { id: 'skyscraper', name: 'Skyscraper', level: 4, weight: 21, find: turbot('skyscraper', skyscraperFits) },
  { id: 'twoStringKite', name: 'Two-String Kite', level: 4, weight: 21.5, find: turbot('twoStringKite', kiteFits) },
  { id: 'emptyRectangle', name: 'Empty Rectangle', level: 4, weight: 21.8, find: findEmptyRectangle },
  { id: 'wWing', name: 'W-Wing', level: 4, weight: 22, find: findWWing },
  { id: 'remotePairs', name: 'Remote Pairs', level: 4, weight: 23, find: findRemotePairs },
  { id: 'simpleColouring', name: 'Simple Colouring', level: 4, weight: 24, find: findSimpleColouring },
  { id: 'xChain', name: 'X-Chain', level: 4, weight: 26, find: findXChain },
  { id: 'xyChain', name: 'XY-Chain', level: 4, weight: 28, find: findXyChain },
  { id: 'alsXz', name: 'ALS-XZ', level: 4, weight: 30, find: findAlsXz },
  { id: 'finnedSwordfish', name: 'Finned Swordfish', level: 5, weight: 32, find: finnedFish('finnedSwordfish', 3) },
  { id: 'finnedJellyfish', name: 'Finned Jellyfish', level: 5, weight: 34, find: finnedFish('finnedJellyfish', 4) },
];

export const TECHNIQUE_BY_ID = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t])) as Record<TechniqueId, Technique>;
