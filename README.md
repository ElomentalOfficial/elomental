# Elomental

A competitive Sudoku web app: Casual play, a shared Daily Square, Ranked Elo against the puzzle,
Clash races with a friend, and shareable Square codes, with rewards you can craft.

**Play it:** https://elomental.online/. Add it to your phone's home screen for the
full-screen app feel. (The old address, https://barsmin.github.io/elomental/, redirects there.)

## Packages

- [`packages/engine`](packages/engine): puzzle generator, human-technique difficulty grader,
  solver, grid transforms, and the Ranked copy check (`audit.ts`).
- [`packages/web`](packages/web): the mobile-first app (Vite, vanilla TypeScript), styled after
  the Figma designs.
- [`supabase`](supabase): the backend (Postgres migrations and Edge Functions). Accounts, Elo,
  Stardust, drops and results are settled there; see [supabase/README.md](supabase/README.md).

Every player has an account: guests get an anonymous one on first launch. Without a connection,
the app falls back to a local guest whose progress stays on the device.

## Getting started

Requires Node.js 24+. The TypeScript runs directly, with no build step.

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, for testing on a phone)
npm test
npm run typecheck
npm run generate -w @elomental/engine -- --difficulty hard --count 10 --out hard.jsonl
```

After changing the engine, run `npm run sync-edge -w @elomental/engine` and redeploy the
`audit-solve` Edge Function, so the server checks Ranked solves with the same code.
