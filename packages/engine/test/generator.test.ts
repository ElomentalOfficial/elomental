import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIFFICULTIES,
  countClues,
  countSolutions,
  generatePuzzle,
  grade,
  isValidSolution,
  matchesGivens,
  parseGrid,
  solve,
  type Difficulty,
} from '../src/index.ts';

const SAMPLES: Record<Difficulty, number> = { easy: 5, medium: 4, hard: 3 };

for (const difficulty of Object.keys(SAMPLES) as Difficulty[]) {
  test(`${difficulty} puzzles are unique and match their profile`, () => {
    const profile = DIFFICULTIES[difficulty];
    for (let i = 0; i < SAMPLES[difficulty]; i++) {
      const generated = generatePuzzle({ difficulty, seed: `gen-${difficulty}-${i}` });
      const puzzle = parseGrid(generated.puzzle);
      const solution = parseGrid(generated.solution);

      assert.ok(isValidSolution(solution));
      assert.ok(matchesGivens(puzzle, solution));
      assert.equal(countSolutions(puzzle), 1);
      assert.deepEqual(solve(puzzle), solution);

      assert.equal(generated.clues, countClues(puzzle));
      assert.ok(generated.clues >= profile.minClues, `${generated.clues} clues < ${profile.minClues}`);
      assert.ok(generated.level >= profile.minLevel && generated.level <= profile.maxLevel);
      // Grading with every technique available must not find an easier path.
      assert.equal(grade(puzzle).level, generated.level);

      for (let c = 0; c < 81; c++) assert.equal(puzzle[c] === 0, puzzle[80 - c] === 0, 'rotational symmetry');
    }
  });
}

const SINGLES = ['fullHouse', 'hiddenSingle', 'nakedSingle'];
const PAIRS_TRIPLES = ['nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple'];
const advanced = (counts: Record<string, number | undefined>) =>
  Object.entries(counts).filter(([id]) => !SINGLES.includes(id));

test('casual and daily profiles stay gentle', () => {
  for (let i = 0; i < 4; i++) {
    const easy = generatePuzzle({ difficulty: 'easy', profile: 'casualEasy', seed: `ce-${i}` });
    assert.ok(easy.clues >= 38);
    assert.equal(advanced(easy.counts).length, 0, 'casual easy is singles only');

    const lean = generatePuzzle({ difficulty: 'easy', profile: 'singlesLean', seed: `sl-${i}` });
    assert.ok(lean.clues >= 32);
    assert.equal(advanced(lean.counts).length, 0, 'lean daily is singles only');

    const medium = generatePuzzle({ difficulty: 'medium', profile: 'casualMedium', seed: `cm-${i}` });
    const steps = advanced(medium.counts);
    assert.ok(medium.clues >= 32);
    assert.ok(steps.length > 0, 'casual medium needs at least one pointing/claiming step');
    assert.ok(steps.every(([id]) => id === 'pointing' || id === 'claiming'), JSON.stringify(medium.counts));
    assert.ok(steps.reduce((n, [, c]) => n + (c ?? 0), 0) <= 4);

    const hard = generatePuzzle({ difficulty: 'hard', profile: 'casualHard', seed: `ch-${i}` });
    assert.ok(hard.level === 2, 'casual hard never needs expert techniques');
    assert.ok(advanced(hard.counts).some(([id]) => PAIRS_TRIPLES.includes(id)), 'casual hard needs a pair or triple');
    assert.equal(countSolutions(parseGrid(hard.puzzle)), 1);
  }
});

test('the same seed always produces the same puzzle', () => {
  const a = generatePuzzle({ difficulty: 'medium', seed: 'repeat' });
  const b = generatePuzzle({ difficulty: 'medium', seed: 'repeat' });
  assert.deepEqual(a, b);
});

test('symmetry none still produces valid puzzles', () => {
  const generated = generatePuzzle({ difficulty: 'easy', seed: 'asym', symmetry: 'none' });
  assert.equal(countSolutions(parseGrid(generated.puzzle)), 1);
});
