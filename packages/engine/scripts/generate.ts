/**
 * Batch-generates graded puzzles as JSON Lines, ready to import into the
 * puzzles table.
 *
 *   npm run generate -- --difficulty hard --count 50 --seed batch-001 --out hard.jsonl
 */
import { createWriteStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { DIFFICULTIES, generatePuzzle, type Difficulty, type Symmetry } from '../src/index.ts';

const { values } = parseArgs({
  options: {
    difficulty: { type: 'string', short: 'd', default: 'medium' },
    count: { type: 'string', short: 'n', default: '10' },
    seed: { type: 'string', short: 's' },
    symmetry: { type: 'string', default: 'varied' },
    out: { type: 'string', short: 'o' },
  },
});

const difficulty = values.difficulty as Difficulty;
if (!(difficulty in DIFFICULTIES)) throw new Error(`--difficulty must be one of: ${Object.keys(DIFFICULTIES).join(', ')}`);
const symmetry = values.symmetry as Symmetry;
const LAYOUTS: Symmetry[] = ['varied', 'none', 'rotational', 'mirror', 'diagonal'];
if (!LAYOUTS.includes(symmetry)) throw new Error(`--symmetry must be one of: ${LAYOUTS.join(', ')}`);
const count = Number(values.count);
if (!Number.isInteger(count) || count < 1) throw new Error('--count must be a positive integer');

const out = values.out ? createWriteStream(values.out) : process.stdout;
const clues: number[] = [];
const ratings: number[] = [];
const attempts: number[] = [];
const hardest: Record<string, number> = {};
const started = performance.now();

for (let i = 0; i < count; i++) {
  const puzzle = generatePuzzle({ difficulty, symmetry, seed: values.seed ? `${values.seed}:${i}` : undefined });
  out.write(JSON.stringify(puzzle) + '\n');
  clues.push(puzzle.clues);
  ratings.push(puzzle.rating);
  attempts.push(puzzle.attempts);
  hardest[puzzle.hardest ?? 'none'] = (hardest[puzzle.hardest ?? 'none'] ?? 0) + 1;
  if (values.out) process.stderr.write(`\r${i + 1}/${count}`);
}

const elapsed = performance.now() - started;
const summary = (xs: number[]) =>
  `min ${Math.min(...xs)} / avg ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)} / max ${Math.max(...xs)}`;
process.stderr.write(
  [
    '',
    `${count} ${difficulty} puzzles in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / count).toFixed(0)} ms each)`,
    `clues     ${summary(clues)}`,
    `rating    ${summary(ratings)}`,
    `attempts  ${summary(attempts)}`,
    `hardest   ${Object.entries(hardest)
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id} ${n}`)
      .join(', ')}`,
    '',
  ].join('\n'),
);
if (values.out) out.end();
