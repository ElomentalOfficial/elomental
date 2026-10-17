import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MASTER_BANK,
  MASTER_RATING,
  countSolutions,
  generatePuzzle,
  grade,
  nextPlacement,
  parseGrid,
  ratedProfile,
  type Step,
} from '../src/index.ts';

test('level 5 starts at the master rating', () => {
  assert.equal(ratedProfile(MASTER_RATING - 1).maxLevel, 4);
  assert.equal(ratedProfile(MASTER_RATING).maxLevel, 5);
  assert.equal(ratedProfile(3000).maxLevel, 5);
});

test('every bank puzzle is unique, beats level 4 and needs a big finned fish', () => {
  assert.ok(MASTER_BANK.length >= 20, `only ${MASTER_BANK.length} bank puzzles`);
  for (const entry of MASTER_BANK) {
    const puzzle = parseGrid(entry.puzzle);
    assert.equal(countSolutions(puzzle), 1);
    assert.equal(grade(puzzle, { maxLevel: 4 }).solved, false);
    const result = grade(puzzle);
    assert.ok(result.solved && result.level === 5, entry.puzzle);
    assert.ok(result.hardest === 'finnedSwordfish' || result.hardest === 'finnedJellyfish');
    // Every digit is among the givens.
    for (let d = 1; d <= 9; d++) assert.ok(puzzle.includes(d), `digit ${d} missing`);
  }
});

test('top Ranked serves bank puzzles in disguise, sound and unique', () => {
  const bank = new Set(MASTER_BANK.map((p) => p.puzzle));
  let fromBank = 0;
  for (let i = 0; i < 20; i++) {
    const generated = generatePuzzle({ difficulty: 'hard', targetRating: 2000, seed: `master-${i}` });
    const puzzle = parseGrid(generated.puzzle);
    const solution = parseGrid(generated.solution);
    assert.equal(countSolutions(puzzle), 1);
    if (generated.level !== 5) continue;
    fromBank++;
    assert.ok(!bank.has(generated.puzzle), 'a bank puzzle was served untransformed');
    const steps: Step[] = grade(puzzle, { recordSteps: true }).steps;
    for (const step of steps) {
      for (const [c, d] of step.placements) assert.equal(d, solution[c]);
      for (const [c, d] of step.eliminations) assert.notEqual(d, solution[c]);
    }
  }
  assert.ok(fromBank >= 4 && fromBank <= 16, `${fromBank}/20 level-5 puzzles at target 2000`);
});

test('hints walk a level-5 puzzle all the way to its solution', () => {
  const generated = generatePuzzle({ difficulty: 'hard', targetRating: 2000, seed: 'master-hint' });
  const grid = parseGrid(generated.puzzle);
  const solution = parseGrid(generated.solution);
  for (let hint = nextPlacement(grid); hint; hint = nextPlacement(grid)) {
    assert.equal(hint.digit, solution[hint.cell]);
    grid[hint.cell] = hint.digit;
  }
  assert.deepEqual(grid, solution);
});
