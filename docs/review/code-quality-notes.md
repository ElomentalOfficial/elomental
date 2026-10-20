# Code quality: first notes (Stage 1, started before the specialist reviews)

Collected on branch full-review at 0490285. Unfinished: to be completed and merged into
docs/FULL_REVIEW.md together with the five specialist reviews.

## Big files
| File | Lines | Note |
| --- | --- | --- |
| packages/web/src/styles.css | 6675 | One file for every screen; sections exist but later features were appended at the end (plates, profile, dev, founder, leaderboard, picker) instead of near related rules. Candidate: split per screen/component (Vite imports CSS from TS). |
| packages/web/src/screens/game.ts | 1329 | One `gameScreen` closure holds board, pad, hints, wheel, clock, pause, dev bar, finish, settle, result, clash result, concede. Candidates: result screen + reward strip, notes wheel gestures, settle/finish into their own modules. |
| packages/web/src/copy/en.ts | 1055 | Fine as a single source, but could split per area in a copy/ folder. |
| packages/engine/src/techniques.ts | 925 | Solver techniques; review separately. |

## Dead code (verified by search, not dynamic class names)
- CSS rules with no user: `.part-rarity`, `.showcase-grid`, `.showcase-pick`, `.showcase-slot`, `.showcase-art`, `.showcase-name`, `.card-showcase`, `.card-showcase-list` (parts showcase replaced by badges), `.state-starter`, `.plate-list` (+ its `li` rules; old plate sheet), `.avatar-ring`, `.lb-tug`, `.tug-seg` (old tug bar), `.part-steps`/`.part-progress`/`.influence-line` only referenced once each: check.
- `rankTitle` in profile.ts is exported and never used.
- Copy keys that look unread (need a check; many are server error codes read by key through `knownError`, which is fine): `a11yYou`, `ordinal` (used inside en.ts), `plateTop`, `average`, `friends`/`global` (view labels), avatar names. Error-code maps (`refusals.*`) are read dynamically.

## Structure
- Mock Supabase screenshot scripts live outside the repo (icons/shoot-*.mjs); a shared, in-repo mock fixture for signed-in states would let e2e tests cover Forge, Profile, Leaderboard and Dev mode (today e2e covers mostly guest flows).
- The flaky e2e test `layout.spec.ts:184` (desktop, 200% text, tutorial) times out on a click intermittently.
