# Elomental

A competitive Sudoku web app: casual play, a shared Daily Square, and ranked Elo, with rewards
you can craft.

## Packages

- [`packages/engine`](packages/engine): puzzle generator, human-technique difficulty grader,
  solver, and anti-cheat grid transforms.

## Getting started

Requires Node.js 24+. The TypeScript runs directly, with no build step.

```bash
npm install
npm test
npm run generate -w @elomental/engine -- --difficulty hard --count 10 --out hard.jsonl
```
