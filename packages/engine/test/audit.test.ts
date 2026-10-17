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
  difficultyForRating,
  frontier,
  generatePuzzle,
  parseGrid,
  singles,
  type Move,
  type SolverState,
  type TechniqueLevel,
} from '../src/index.ts';

/**
 * Calibration for the copy check (src/audit.ts), on simulated solves:
 * people who work squares out (with notes, the odd technique while singles
 * are open, a few lucky guesses) must never be flagged; typing a solved grid
 * in must be caught, mostly even on the easiest Ranked puzzles.
 * (A wider sweep of player styles: rows, columns, boxes, digit by digit,
 * following each placement, and copying after an honest start, was run
 * while tuning; see the constants in audit.ts.)
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

const put = (state: SolverState, cell: number, digit: number) => {
  state.values[cell] = digit;
  state.cands[cell] = 0;
  for (const p of PEERS[cell]) state.cands[p] &= ~bit(digit);
};
const copyOf = (state: SolverState): SolverState => ({ values: Uint8Array.from(state.values), cands: Uint16Array.from(state.cands) });

/**
 * A person: places what's workable, now and then a guess. A square they see
 * only through another one (placing that one makes it a single) is typed
 * first, and that other one right after. `eager`: how often they work a
 * technique while singles are still open.
 */
function personSolve(givens: Uint8Array, solution: Uint8Array, level: TechniqueLevel, guess: number, eager: number): Move[] {
  const state = createSolverState(givens);
  const moves: Move[] = [];
  const next: number[] = [];
  while (state.values.includes(0)) {
    let cell = next.shift() ?? -1;
    if (cell < 0) {
      if (rng.next() < eager) eliminate(state, level);
      let open = [...frontier(state).keys()];
      while (!open.length && eliminate(state, level)) open = [...frontier(state).keys()];
      const empty = [...state.values.keys()].filter((c) => !state.values[c]);
      const pool = open.length && rng.next() >= guess ? open : empty;
      cell = pool[Math.floor(rng.next() * pool.length)];
      const now = singles(state);
      if (!now.has(cell) && open.includes(cell)) {
        const unlock = [...now].find(([c, d]) => {
          const after = copyOf(state);
          put(after, c, d);
          return singles(after).get(cell) === solution[cell];
        });
        if (unlock) next.push(unlock[0]);
      }
    }
    if (state.values[cell]) continue;
    put(state, cell, solution[cell]);
    moves.push({ cell, digit: solution[cell], at: moves.length * 5000 });
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

/** A Ranked puzzle the way the app makes one for a player near `target` Elo. */
function ranked(target: number, i: number) {
  const difficulty = difficultyForRating(target);
  const g = generatePuzzle({ difficulty, profile: difficulty, targetRating: target, seed: `audit-ranked-${target}-${i}` });
  return { givens: parseGrid(g.puzzle), solution: parseGrid(g.solution), level: Math.max(1, g.level) as TechniqueLevel };
}

const typedByColumns = (givens: Uint8Array, solution: Uint8Array): Move[] =>
  [...Array(81).keys()]
    .map((i) => (i % 9) * 9 + Math.floor(i / 9))
    .filter((c) => !givens[c])
    .map((cell, i) => ({ cell, digit: solution[cell], at: i * 2000 }));

/** The squares that are obvious at the start, by hand; then the rest typed in by rows. */
function honestStartThenTyped(givens: Uint8Array, solution: Uint8Array): Move[] {
  const obvious = [...singles(createSolverState(givens)).keys()];
  const rest = [...givens.keys()].filter((c) => !givens[c] && !obvious.includes(c));
  return [...obvious, ...rest].map((cell, i) => ({ cell, digit: solution[cell], at: i * 2000 }));
}

test('on the easiest Ranked puzzles, people are never flagged and most copying is caught', () => {
  let caught = 0;
  let copies = 0;
  for (let i = 0; i < 12; i++) {
    const { givens, solution, level } = ranked(150, i);
    for (const guess of [0, 0.05]) {
      const audit = auditSolve(givens, personSolve(givens, solution, level, guess, 0), level);
      assert.equal(audit.copied, false, `easy #${i} guess ${guess}: evidence ${audit.evidence.toFixed(1)} of ${audit.potential.toFixed(1)}`);
    }
    for (const typed of [typedIn(givens, solution), typedByColumns(givens, solution)]) {
      copies++;
      if (auditSolve(givens, typed, level).copied) caught++;
    }
  }
  // Easy puzzles leave a copier more cover (most squares are workable at any moment).
  assert.ok(caught >= copies / 2, `caught ${caught}/${copies}`);
});

test('an honest start does not hide copying the rest', () => {
  let caught = 0;
  for (let i = 0; i < 10; i++) {
    const { givens, solution, level } = ranked(1000, i);
    if (auditSolve(givens, honestStartThenTyped(givens, solution), level).copied) caught++;
  }
  assert.ok(caught >= 5, `caught ${caught}/10`);
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
