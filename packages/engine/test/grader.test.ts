import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TECHNIQUES,
  applyStep,
  countSolutions,
  createSolverState,
  createRng,
  generatePuzzle,
  grade,
  nextPlacement,
  parseGrid,
  randomSolvedGrid,
  UNITS,
  type Grid,
  type Step,
  type TechniqueId,
} from '../src/index.ts';

/** Every placement must be the answer and no elimination may remove the answer. */
function assertSound(steps: Step[], solution: Grid) {
  for (const step of steps) {
    for (const [c, d] of step.placements) {
      assert.equal(d, solution[c], `${step.technique} placed ${d} in cell ${c}, answer is ${solution[c]}`);
    }
    for (const [c, d] of step.eliminations) {
      assert.notEqual(d, solution[c], `${step.technique} eliminated the answer ${d} from cell ${c}`);
    }
  }
}

/** A minimal unique puzzle carved with brute-force uniqueness only, so it is often beyond our techniques. */
function carveMinimal(seed: string): { puzzle: Grid; solution: Grid } {
  const rng = createRng(seed);
  const solution = randomSolvedGrid(rng);
  const puzzle = Uint8Array.from(solution);
  for (const c of rng.shuffle(Array.from({ length: 81 }, (_, i) => i))) {
    puzzle[c] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[c] = solution[c];
  }
  return { puzzle, solution };
}

test('techniques never contradict the solution on raw minimal puzzles', (t) => {
  const seen = new Map<TechniqueId, number>();
  let solved = 0;
  const samples = 400;
  for (let i = 0; i < samples; i++) {
    const { puzzle, solution } = carveMinimal(`minimal-${i}`);
    const result = grade(puzzle, { recordSteps: true });
    assertSound(result.steps, solution);
    if (result.solved) solved++;
    for (const step of result.steps) seen.set(step.technique, (seen.get(step.technique) ?? 0) + 1);
  }
  t.diagnostic(`solved ${solved}/${samples} with human techniques`);
  t.diagnostic(`technique coverage: ${[...seen].map(([id, n]) => `${id}=${n}`).join(' ')}`);
});

test('every technique stays sound at every point of a solve, not only when it is the easiest', (t) => {
  // The grader only reaches an expert technique when everything easier is stuck,
  // so on its own it rarely exercises them. Here every technique is asked at
  // every state along the way, and each must fire at least once.
  const fired = new Map<TechniqueId, number>();
  for (let i = 0; i < 120; i++) {
    const { puzzle, solution } = carveMinimal(`every-${i}`);
    const state = createSolverState(puzzle);
    for (;;) {
      let next: Step | null = null;
      for (const technique of TECHNIQUES) {
        const step = technique.find(state);
        if (!step) continue;
        assertSound([step], solution);
        fired.set(technique.id, (fired.get(technique.id) ?? 0) + 1);
        next ??= step;
      }
      if (!next) break;
      applyStep(state, next);
    }
  }
  t.diagnostic(`fired: ${[...fired].map(([id, n]) => `${id}=${n}`).join(' ')}`);
  for (const technique of TECHNIQUES) assert.ok(fired.get(technique.id), `${technique.id} never fired`);
});

test('grading steps on generated puzzles agree with the stored solution', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let i = 0; i < 3; i++) {
      const generated = generatePuzzle({ difficulty, seed: `sound-${difficulty}-${i}` });
      const result = grade(parseGrid(generated.puzzle), { recordSteps: true });
      assert.ok(result.solved);
      assertSound(result.steps, parseGrid(generated.solution));
    }
  }
  for (const target of [1500, 2000, 2500]) {
    const generated = generatePuzzle({ difficulty: 'hard', targetRating: target, seed: `sound-rated-${target}` });
    const result = grade(parseGrid(generated.puzzle), { recordSteps: true });
    assert.ok(result.solved);
    assertSound(result.steps, parseGrid(generated.solution));
  }
});

test('a solved grid needs no steps; a single gap is a full house', () => {
  const solution = randomSolvedGrid(createRng('full'));
  assert.equal(grade(solution).steps.length, 0);
  assert.equal(grade(solution).solved, true);

  const puzzle = Uint8Array.from(solution);
  puzzle[30] = 0;
  const result = grade(puzzle, { recordSteps: true });
  assert.equal(result.hardest, 'fullHouse');
  assert.deepEqual(result.steps[0].placements, [[30, solution[30]]]);
});

test('nextPlacement walks a puzzle to its solution', () => {
  for (const difficulty of ['easy', 'hard'] as const) {
    const generated = generatePuzzle({ difficulty, seed: `hint-${difficulty}` });
    const grid = parseGrid(generated.puzzle);
    const solution = parseGrid(generated.solution);
    for (let hint = nextPlacement(grid); hint; hint = nextPlacement(grid)) {
      assert.equal(grid[hint.cell], 0);
      assert.equal(hint.digit, solution[hint.cell]);
      // Singles that live in a unit say which unit, and the target is in it.
      if (hint.technique === 'hiddenSingle' || hint.technique === 'fullHouse') {
        assert.ok(hint.unit !== undefined && UNITS[hint.unit].includes(hint.cell));
      }
      // Every prior elimination step names the pattern it relied on.
      for (const step of hint.prior) assert.ok(step.pattern && step.pattern.length > 0, step.technique);
      grid[hint.cell] = hint.digit;
    }
    assert.deepEqual(grid, solution);
  }
});

test('harder tiers get higher seed ratings', () => {
  const avg = (difficulty: 'easy' | 'medium' | 'hard') => {
    let sum = 0;
    for (let i = 0; i < 3; i++) sum += generatePuzzle({ difficulty, seed: `rating-${difficulty}-${i}` }).rating;
    return sum / 3;
  };
  const easy = avg('easy');
  const medium = avg('medium');
  const hard = avg('hard');
  assert.ok(easy < medium && medium < hard, `easy ${easy}, medium ${medium}, hard ${hard}`);
});
