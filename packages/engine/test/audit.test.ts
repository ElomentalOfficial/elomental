import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PEERS,
  TECHNIQUES,
  applyStep,
  auditSolve,
  bit,
  createRng,
  createSolverState,
  frontier,
  generatePuzzle,
  parseGrid,
  type Move,
  type SolverState,
  type TechniqueLevel,
} from '../src/index.ts';

/**
 * Calibration for the copy check (src/audit.ts), on simulated solves:
 * people who work squares out (with notes, the odd technique while singles
 * are open, a few lucky guesses) must never be flagged; typing a solved grid
 * in must be caught on puzzles hard enough to judge.
 */

const rng = createRng('audit-test');

const eliminate = (state: SolverState, level: TechniqueLevel) => {
  for (const t of TECHNIQUES) {
    if (t.level < 2 || t.level > level) continue;
    const step = t.find(state);
    if (step) {
      applyStep(state, step);
      return true;
    }
  }
  return false;
};

function personSolve(givens: Uint8Array, solution: Uint8Array, level: TechniqueLevel, guess: number, eager: number): Move[] {
  const state = createSolverState(givens);
  const moves: Move[] = [];
  while (state.values.includes(0)) {
    if (rng.next() < eager) eliminate(state, level);
    let open = [...frontier(state).keys()];
    while (!open.length && eliminate(state, level)) open = [...frontier(state).keys()];
    const empty = [...state.values.keys()].filter((c) => !state.values[c]);
    const pool = open.length && rng.next() >= guess ? open : empty;
    const cell = pool[Math.floor(rng.next() * pool.length)];
    const d = solution[cell];
    state.values[cell] = d;
    state.cands[cell] = 0;
    for (const p of PEERS[cell]) state.cands[p] &= ~bit(d);
    moves.push({ cell, digit: d, at: moves.length * 5000 });
  }
  return moves;
}

const typedIn = (givens: Uint8Array, solution: Uint8Array): Move[] =>
  [...givens.keys()].filter((c) => !givens[c]).map((cell, i) => ({ cell, digit: solution[cell], at: i * 2000 }));

function puzzle(target: number, i: number) {
  const g = generatePuzzle({ difficulty: 'hard', targetRating: target, seed: `audit-${target}-${i}` });
  return { givens: parseGrid(g.puzzle), solution: parseGrid(g.solution), level: Math.max(1, g.level) as TechniqueLevel };
}

test('people who work squares out are never flagged', () => {
  for (const target of [1000, 1800]) {
    for (let i = 0; i < 8; i++) {
      const { givens, solution, level } = puzzle(target, i);
      for (const [guess, eager] of [
        [0, 0],
        [0, 0.3],
        [0.05, 0.1],
      ]) {
        const audit = auditSolve(givens, personSolve(givens, solution, level, guess, eager), level);
        assert.equal(audit.copied, false, `target ${target} #${i} guess ${guess}: evidence ${audit.evidence.toFixed(1)} of ${audit.potential.toFixed(1)}`);
      }
    }
  }
});

test('typing in a solved grid is caught on puzzles hard enough to judge', () => {
  let caught = 0;
  let judged = 0;
  for (let i = 0; i < 10; i++) {
    const { givens, solution, level } = puzzle(1800, i);
    const audit = auditSolve(givens, typedIn(givens, solution), level);
    judged++;
    if (audit.copied) caught++;
  }
  assert.ok(caught >= 8, `caught ${caught}/${judged}`);
});

test('wrong digits, clears and replays are ignored; bad givens are refused', () => {
  const { givens, solution, level } = puzzle(1000, 0);
  const honest = personSolve(givens, solution, level, 0, 0);
  // A wrong digit that fades, and a correct square cleared and re-entered.
  const first = honest[0];
  const noisy: Move[] = [
    { cell: first.cell, digit: (first.digit % 9) + 1, at: 1 },
    ...honest.slice(0, 3),
    { cell: honest[2].cell, digit: 0, at: 2 },
    ...honest.slice(2),
  ];
  const audit = auditSolve(givens, noisy, level);
  assert.equal(audit.placements, honest.length + 1);
  assert.equal(audit.copied, false);

  const broken = Uint8Array.from(givens);
  const empty = broken.indexOf(0);
  broken[empty] = solution[PEERS[empty].find((p) => givens[p])!];
  assert.equal(auditSolve(broken, honest, level).copied, true);
});
