/** A Sudoku grid: 81 cells in row-major order, 0 = empty. */
export type Grid = Uint8Array;

/** Candidate bitmask with bits 1..9 set. Bit 0 is unused so digit d maps to bit d. */
export const ALL_DIGITS = 0b1111111110;

const NINE = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export const ROW_OF = Uint8Array.from({ length: 81 }, (_, c) => Math.floor(c / 9));
export const COL_OF = Uint8Array.from({ length: 81 }, (_, c) => c % 9);
export const BOX_OF = Uint8Array.from({ length: 81 }, (_, c) => Math.floor(ROW_OF[c] / 3) * 3 + Math.floor(COL_OF[c] / 3));

export const ROWS: number[][] = NINE.map((r) => NINE.map((c) => r * 9 + c));
export const COLS: number[][] = NINE.map((c) => NINE.map((r) => r * 9 + c));
export const BOXES: number[][] = NINE.map((b) =>
  NINE.map((i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3) * 3 + (i % 3)),
);
/** All 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: number[][] = [...ROWS, ...COLS, ...BOXES];

/** The 20 cells sharing a row, column or box with each cell. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, c) => {
  const peers = new Set([...ROWS[ROW_OF[c]], ...COLS[COL_OF[c]], ...BOXES[BOX_OF[c]]]);
  peers.delete(c);
  return [...peers];
});

const peerMatrix = new Uint8Array(81 * 81);
for (let c = 0; c < 81; c++) for (const p of PEERS[c]) peerMatrix[c * 81 + p] = 1;

export const isPeer = (a: number, b: number): boolean => peerMatrix[a * 81 + b] === 1;

export const bit = (digit: number): number => 1 << digit;

export function popcount(mask: number): number {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

export function digitsOf(mask: number): number[] {
  const digits: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) digits.push(d);
  return digits;
}

/** The smallest digit in a mask; for single-bit masks, the digit itself. */
export const lowestDigit = (mask: number): number => 31 - Math.clz32(mask & -mask);

/** Parses 81 characters; `0` or `.` mark empty cells and whitespace is ignored. */
export function parseGrid(text: string): Grid {
  const chars = text.replace(/\s/g, '');
  if (chars.length !== 81) throw new Error(`Expected 81 cells, got ${chars.length}`);
  const grid = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = chars[i];
    if (ch === '.' || ch === '0') continue;
    if (ch < '1' || ch > '9') throw new Error(`Invalid character "${ch}" at cell ${i}`);
    grid[i] = ch.charCodeAt(0) - 48;
  }
  return grid;
}

/** Serializes to 81 digits with `0` for empty cells (the storage format). */
export const gridToString = (grid: Grid): string => Array.from(grid).join('');

export function countClues(grid: Grid): number {
  let n = 0;
  for (const d of grid) if (d) n++;
  return n;
}

/** True when every cell is filled and no row, column or box repeats a digit. */
export function isValidSolution(grid: Grid): boolean {
  if (grid.length !== 81) return false;
  for (const unit of UNITS) {
    let seen = 0;
    for (const c of unit) {
      const d = grid[c];
      if (d < 1 || d > 9 || seen & bit(d)) return false;
      seen |= bit(d);
    }
  }
  return true;
}

/** True when every given in `puzzle` matches the digit in `solution`. */
export function matchesGivens(puzzle: Grid, solution: Grid): boolean {
  for (let c = 0; c < 81; c++) if (puzzle[c] && puzzle[c] !== solution[c]) return false;
  return true;
}
