import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIFFICULTIES,
  RANKED_STAGES,
  RATING_WINDOW,
  countClues,
  countSolutions,
  generatePuzzle,
  grade,
  isValidSolution,
  matchesGivens,
  parseGrid,
  rankedStage,
  solve,
  type Difficulty,
} from '../src/index.ts';

const SAMPLES: Record<Difficulty, number> = { easy: 5, medium: 4, hard: 3 };

for (const difficulty of Object.keys(SAMPLES) as Difficulty[]) {
  test(`${difficulty} puzzles are unique and match their profile`, () => {
    const profile = DIFFICULTIES[difficulty];
    for (let i = 0; i < SAMPLES[difficulty]; i++) {
      const generated = generatePuzzle({ difficulty, seed: `gen-${difficulty}-${i}`, symmetry: 'rotational' });
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

test('ranked puzzles land near their target rating and stay unique', () => {
  for (const target of [300, 600, 1000, 1500, 2000]) {
    for (let i = 0; i < 3; i++) {
      const generated = generatePuzzle({ difficulty: 'hard', targetRating: target, seed: `rated-${target}-${i}` });
      const puzzle = parseGrid(generated.puzzle);
      assert.equal(countSolutions(puzzle), 1);
      assert.deepEqual(solve(puzzle), parseGrid(generated.solution));
      // Within the starting window, or the window it had widened to by the time it stopped.
      assert.ok(Math.abs(generated.rating - target) <= RATING_WINDOW + 150, `target ${target}, got ${generated.rating}`);
      assert.equal(grade(puzzle).rating, generated.rating, 'grading with every technique agrees');
    }
  }
});

test('ranked stages deal their technique family, uniquely and the same every time', () => {
  // what each stage's squares may need beyond singles, and how many such steps
  const family: Record<string, { level: number; steps?: [number, number] }> = {
    N1: { level: 1 }, N2: { level: 1 }, A1: { level: 1 },
    A2: { level: 2, steps: [1, 1] }, A3: { level: 2, steps: [2, 3] },
    D1: { level: 2 }, D2: { level: 2 }, D3: { level: 2, steps: [3, Infinity] },
    D4: { level: 3 }, M1: { level: 3 }, M2: { level: 3 }, M3: { level: 4 }, E1: { level: 4 }, E2: { level: 5 },
  };
  for (const [stage, { id, profile }] of RANKED_STAGES.entries()) {
    for (let i = 0; i < 2; i++) {
      const generated = generatePuzzle({ difficulty: 'medium', rankedStage: stage, seed: `stage-${id}-${i}` });
      const puzzle = parseGrid(generated.puzzle);
      assert.equal(generated.stage, stage, `${id} fell back`);
      assert.equal(countSolutions(puzzle), 1);
      assert.deepEqual(solve(puzzle), parseGrid(generated.solution));
      assert.equal(generated.level, family[id].level, `${id}: ${JSON.stringify(generated.counts)}`);
      assert.equal(grade(puzzle).level, generated.level, 'grading with every technique agrees');
      if (profile) assert.ok(generated.clues >= profile.minClues);
      const steps = family[id].steps;
      if (steps) {
        const n = advanced(generated.counts).reduce((sum, [, c]) => sum + (c ?? 0), 0);
        assert.ok(n >= steps[0] && n <= steps[1], `${id}: ${n} steps beyond singles`);
      }
    }
  }
  assert.deepEqual(
    generatePuzzle({ difficulty: 'medium', rankedStage: 4, seed: 'stage-repeat' }),
    generatePuzzle({ difficulty: 'medium', rankedStage: 4, seed: 'stage-repeat' }),
  );
});

test('an Elo plays at the stage whose floor it has reached', () => {
  assert.equal(rankedStage(0), 0);
  assert.equal(rankedStage(100), 0);
  assert.equal(rankedStage(299), 1);
  assert.equal(rankedStage(300), 2);
  assert.equal(rankedStage(1449), 11);
  assert.equal(rankedStage(1450), 12);
  assert.equal(rankedStage(5000), RANKED_STAGES.length - 1);
});

test('higher targets need harder techniques', () => {
  const at = (target: number) => generatePuzzle({ difficulty: 'hard', targetRating: target, seed: `climb-${target}` });
  assert.equal(at(200).level, 1);
  assert.ok(at(1000).level >= 3);
  assert.equal(at(2000).level, 4);
});

test('the same seed always produces the same puzzle', () => {
  const a = generatePuzzle({ difficulty: 'medium', seed: 'repeat' });
  const b = generatePuzzle({ difficulty: 'medium', seed: 'repeat' });
  assert.deepEqual(a, b);
});

test('varied layouts: not all symmetric, and every digit is among the givens', () => {
  const symmetric = (p: string) => [...p].every((ch, c) => (ch === '0') === (p[80 - c] === '0'));
  let rotational = 0;
  for (let i = 0; i < 12; i++) {
    const generated = generatePuzzle({ difficulty: 'easy', profile: 'casualMedium', seed: `layout-${i}` });
    if (symmetric(generated.puzzle)) rotational++;
    const counts = new Array(10).fill(0);
    for (const ch of generated.puzzle) counts[Number(ch)]++;
    for (let d = 1; d <= 9; d++) assert.ok(counts[d] >= 2, `digit ${d} has ${counts[d]} givens`);
    assert.equal(countSolutions(parseGrid(generated.puzzle)), 1);
  }
  assert.ok(rotational < 12, 'some puzzles break the rotational pattern');
});

test('symmetry none still produces valid puzzles', () => {
  const generated = generatePuzzle({ difficulty: 'easy', seed: 'asym', symmetry: 'none' });
  assert.equal(countSolutions(parseGrid(generated.puzzle)), 1);
});
