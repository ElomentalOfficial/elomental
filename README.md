# Elomental

A competitive Sudoku web app: casual play, a shared Daily Square, and ranked Elo, with rewards
you can craft.

**Play the prototype:** https://barsmin.github.io/elomental/. Add it to your phone's home screen
for the full-screen app feel.

## Packages

- [`packages/engine`](packages/engine): puzzle generator, human-technique difficulty grader,
  solver, and anti-cheat grid transforms.
- [`packages/web`](packages/web): mobile-first prototype (Vite, vanilla TypeScript) with Casual,
  Daily Square and Ranked modes, styled after the Figma sketches.

> **Prototype caveat:** puzzles, Elo, Stardust and drops are generated and stored in the
> browser (localStorage) so the full loop can be played. In the real app, Supabase is the
> authority for all of these, and ranked solutions never reach the client.

## Getting started

Requires Node.js 24+. The TypeScript runs directly, with no build step.

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, for testing on a phone)
npm test
npm run generate -w @elomental/engine -- --difficulty hard --count 10 --out hard.jsonl
```
