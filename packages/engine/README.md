# @elomental/engine

Puzzle generator, difficulty grader and solver for Elomental. Plain TypeScript with no runtime
dependencies, so the same code runs in the browser, in Node scripts and in Supabase Edge
Functions (Deno).

```bash
npm test
npm run typecheck
npm run generate -- --difficulty hard --count 50 --seed batch-001 --out hard.jsonl
```

## How difficulty works

Clue count is not difficulty. The grader solves a puzzle the way a person would. At every step
it applies the **easiest** technique that makes progress, and records what it needed.

| Level | Tier   | Techniques (weight)                                                                  |
| ----- | ------ | ------------------------------------------------------------------------------------ |
| 1     | easy   | Full House (0.5), Hidden Single (1), Naked Single (2)                                 |
| 2     | medium | Pointing, Claiming (4), Naked Pair (5), Hidden Pair (6), Naked/Hidden Triple (8/9)    |
| 3     | hard   | X-Wing (12), XY-Wing (14), Naked/Hidden Quad (15/16), Swordfish (17), XYZ-Wing (18), Jellyfish (20) |

- **level**: the level of the hardest technique the puzzle needed
- **score**: total effort, the sum of the weights of every step
- **rating**: the puzzle's starting Elo for ranked play, `100 + 60 × hardestWeight + 4 × effort beyond singles`.
  Real results recalibrate it.

## How generation works

1. Build a random full grid (`randomSolvedGrid`).
2. Remove givens in random order. Each puzzle gets its own layout ('varied'): about half are
   free-form, the rest rotational, mirrored left-right or mirrored on the diagonal. Every digit
   keeps at least two givens (one on the sparsest tiers), as a human setter would. A removal is
   kept only if the puzzle stays solvable using techniques up to the tier's max level. Those
   techniques never guess, so staying solvable also proves the solution is unique.
3. Stop at the tier's clue floor. Reject the grid and try again if the puzzle never needed a
   technique of the tier's minimum level.

Everything is seeded: the same `seed` always regenerates the same puzzle.

## Anti-cheat helpers

- `applyTransform(grid, randomTransform(rng))` relabels digits and shuffles bands, stacks, rows,
  columns and transposition. That gives about 1.2 trillion variants with identical difficulty,
  so every ranked player can get a different-looking grid.
- `solve`, `countSolutions`, `isValidSolution` and `matchesGivens` are what the server uses to
  validate moves and submissions. Solutions must never be sent to the client in ranked mode.
