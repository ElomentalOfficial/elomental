import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countSolutions, createRng, isValidSolution, randomSolvedGrid, solve } from '../src/index.ts';

test('random solved grids are valid and reproducible from their seed', () => {
  const a = randomSolvedGrid(createRng('seed-a'));
  assert.ok(isValidSolution(a));
  assert.deepEqual(a, randomSolvedGrid(createRng('seed-a')));
  assert.notDeepEqual(a, randomSolvedGrid(createRng('seed-b')));
});

test('countSolutions stops at the limit', () => {
  assert.equal(countSolutions(new Uint8Array(81), 2), 2);
  assert.equal(countSolutions(new Uint8Array(81), 5), 5);
});

test('conflicting givens have no solution', () => {
  const grid = new Uint8Array(81);
  grid[0] = 5;
  grid[1] = 5;
  assert.equal(countSolutions(grid), 0);
  assert.equal(solve(grid), null);
});

test('solve fills back missing cells of a solved grid', () => {
  const solution = randomSolvedGrid(createRng('fill'));
  const puzzle = Uint8Array.from(solution);
  for (const c of [0, 10, 20, 40, 60, 80]) puzzle[c] = 0;
  assert.equal(countSolutions(puzzle), 1);
  assert.deepEqual(solve(puzzle), solution);
});
