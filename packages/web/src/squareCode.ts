import { CODE_ALPHABET } from './clash.ts';

/**
 * Square codes: every puzzle gets a short code (K7P2-QX9M) that a friend can
 * enter to play the exact same square. The server keeps the puzzle behind each
 * code (migration square_codes), so codes outlive changes to the generator.
 * The import box also takes a standard 81-digit sudoku string (0 or . for
 * empty squares), as other apps share them.
 */

const SQUARE_CODE_LENGTH = 8;

/** K7P2QX9M → K7P2-QX9M */
export const formatSquareCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

type SquareInput = { kind: 'code'; code: string } | { kind: 'grid'; givens: string } | { kind: 'partial'; length: number };

/**
 * What was typed or pasted: a square code (with or without the dash, any case,
 * even inside a longer message), an 81-digit grid, or not enough yet.
 */
export function readSquareInput(text: string): SquareInput {
  const grid = text.replace(/\s/g, '').replace(/\./g, '0');
  if (/^[0-9]{81}$/.test(grid)) return { kind: 'grid', givens: grid };
  const word = text.toUpperCase().match(/\b[A-Z0-9]{4}-?[A-Z0-9]{4}\b/)?.[0];
  const code = (word ?? text.toUpperCase())
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('');
  if (code.length === SQUARE_CODE_LENGTH) return { kind: 'code', code };
  return { kind: 'partial', length: code.length };
}
