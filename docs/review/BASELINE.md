# Baseline (Stage 0), branch full-review at 0490285, 2026-10-20

| Check | Result |
| --- | --- |
| `npm test` | pass (engine 30/30, web 3/3) |
| `npm run typecheck` | pass |
| `npm run test:db` | all checks passed |
| `npm run test:a11y -w @elomental/web` | first run: 83 passed, 1 failed, 40 skipped; rerun: 84 passed, 40 skipped |

The one failure, `layout.spec.ts:184 › desktop, text 200%: the first-game tutorial fits`, is a
45 s timeout on a click; it passes on rerun and has failed intermittently before. Treated as a
known flaky test (see the review for a fix), not a regression.
Full logs: `baseline-*.txt` in this folder.
