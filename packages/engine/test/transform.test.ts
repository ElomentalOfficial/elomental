import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyTransform,
  countClues,
  countSolutions,
  createRng,
  generatePuzzle,
  grade,
  isValidSolution,
  parseGrid,
  randomTransform,
  solve,
} from '../src/index.ts';

test('transformed puzzles stay unique, valid and equally hard', () => {
  const generated = generatePuzzle({ difficulty: 'medium', seed: 'transform' });
  const puzzle = parseGrid(generated.puzzle);
  const solution = parseGrid(generated.solution);
  const rng = createRng('variants');
  let changed = 0;

  for (let i = 0; i < 25; i++) {
    const t = randomTransform(rng);
    const variant = applyTransform(puzzle, t);
    const variantSolution = applyTransform(solution, t);

    assert.ok(isValidSolution(variantSolution));
    assert.equal(countClues(variant), countClues(puzzle));
    assert.equal(countSolutions(variant), 1);
    assert.deepEqual(solve(variant), variantSolution);
    assert.equal(grade(variant).level, generated.level);
    if (variant.some((d, c) => d !== puzzle[c])) changed++;
  }
  assert.ok(changed > 20);
});

test('the same seed gives the same transform', () => {
  assert.deepEqual(randomTransform(createRng('t')), randomTransform(createRng('t')));
});
