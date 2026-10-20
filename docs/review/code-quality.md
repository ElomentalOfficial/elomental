# Code quality review (Stage 1, lead engineer)

Branch full-review at 4063ca4. Read-only. Effort: S < 1h, M < half a day, L more.

## Findings

### CQ-1 · Medium · Account-change listeners leak on the privacy page
- **Where:** `packages/web/src/screens/privacy.ts:28` (`onAccountChange(paintCountry)`) and `:47` (inside `onOff`, once per toggle).
- **Evidence:** `onAccountChange` returns an unsubscribe function (`backend/account.ts:64`); every other screen keeps it and stops when its element leaves the page (`setup.ts:81`, `dev.ts:136`, `leaderboard.ts:441`). privacy.ts drops it, so each visit adds three listeners that run for the rest of the session and repaint detached elements.
- **Fix:** keep the stop functions and return `destroy` from the screen (as dev.ts does), or stop when `!el.isConnected`.
- **Effort:** S

### CQ-2 · Medium · `game.ts` is one 1,329-line closure
- **Where:** `packages/web/src/screens/game.ts:241` `gameScreen` holds the top bar, board, pad, state changes, hints, pause, rendering, clock, dev bar, finish, settle, clash result, result screen, concede and the notes-wheel gestures.
- **Why it matters:** any change to the result screen or the wheel means reading the whole closure; the shared mutable state (`game`, `selected`, `finished`, `fading`) makes it easy to break something far away.
- **Fix (refactor, no behaviour change):** move out in this order, each its own commit: (1) `result.ts` (showResult, showClashResult, statRow, countUp, signupPrompt; pure functions of the outcome); (2) `wheel.ts` (board gestures + notes wheel); (3) `devBar.ts`. Keep state in gameScreen and pass small callbacks.
- **Effort:** M

### CQ-3 · Medium · `styles.css` is 6,675 lines, with new features appended at the end
- **Where:** `packages/web/src/styles.css`; sections at :5577 (plates), :5748 (profile), :5821 (dev), :5861 (founder), :5914 (leaderboard), :6596 (picker) sit after "Wide layouts" (:5161) rather than with their screens.
- **Fix (refactor):** split into `styles/` files imported in order from main.ts: `tokens.css`, `base.css`, `components.css` (buttons, segmented, sheets, cards, fields, picker), then one file per screen. No rule changes; diff the built CSS before/after to prove it.
- **Effort:** M

### CQ-4 · Low · Dead CSS (about 170 lines)
- **Where:** rules for classes no script uses any more: `.part-rarity`, `.showcase-grid`, `.showcase-pick`, `.showcase-slot`, `.showcase-art`, `.showcase-name`, `.card-showcase`, `.card-showcase-list` (the parts showcase, replaced by badges), `.state-starter` (crests are gone), `.plate-list` and its `li` rules (the old plate sheet), `.avatar-ring` (layered avatar), `.lb-tug` / `.tug-seg` and the tug styles (replaced by the strength bar), `tier-3`/`tier-4` selectors where only built dynamically (check before removing).
- **Fix:** delete after a grep for dynamic class names (`` `state-${…}` ``, `` `tier-${…}` ``).
- **Effort:** S

### CQ-5 · Low · Dead code and copy
- `rankTitle` (`profile.ts:217`) is exported and never used.
- Copy keys no screen reads: `leaderboard.a11yYou`, `forge.plateTop`, `affinity.average` (check), the parts-era keys left after the badges change.
- **Fix:** remove; add a small test that fails on unread top-level copy keys (excluding the error-code maps read by `knownError`).
- **Effort:** S

### CQ-6 · Low · The segmented On/Off control is built by hand seven times
- **Where:** `accessibility.ts:18`, `casual.ts:77`, `dev.ts:44`, `privacy.ts:38`, `review.ts:89`, `setup.ts:37`, `setup.ts:62`; plus `choice()`/`group()` helpers redefined in `accessibility.ts:80`, `dev.ts:62-64`, `privacy.ts:50`.
- **Fix (refactor):** one `segmented({ id, options, get, set })` and `settingGroup()` / `choice()` in a shared `controls.ts`, keeping the same markup so styles and tests are unchanged.
- **Effort:** M

### CQ-7 · Low · Three near-identical RPC wrappers
- **Where:** `backend/forge.ts:81` `call`, `backend/dev.ts:17` `call`, `backend/leaderboard.ts:110` `rpc` and `:131` `act`.
- **Fix:** one `rpcCall(fn, args, refusals)` in `backend/client.ts` returning `string | null`, and one `rpcData<T>()`.
- **Effort:** S

### CQ-8 · Low · Storage keys and a query outside their owner
- `leaderboard.ts` reads `'elomental:loadout'` and `'elomental:polish'` directly instead of `cachedLoadout()` / `cachedPolish()` from `backend/forge.ts`; `screens/leaderboard.ts:432` queries `supabase.from('follows')` from a screen (every other server call lives in `backend/`).
- **Fix:** use the forge helpers; add `followCount()` to `backend/leaderboard.ts`.
- **Effort:** S

### CQ-9 · Low · One 433 kB script for everyone
- **Evidence:** `vite build`: `index.js` 433 kB (135 kB gzip), one chunk. Founder-only screens (`review.ts`, `dev.ts`) and the leaderboard ship to every player.
- **Fix:** dynamic `import()` for review, dev, privacy and the leaderboard; check the generator can't be split off the first paint too.
- **Effort:** S–M

### CQ-10 · Low · Heavy PNG art
- **Evidence:** `hand-cup-dark/light.png` 172–177 kB each, `wallet-*.png` 89 kB, `cog-*`, `calendar.png` 53 kB, `grain.webp` 216 kB.
- **Fix:** re-encode the PNGs as WebP (lossless or high quality), keep sizes; check Firefox sharpness as before.
- **Effort:** S

### CQ-11 · Low · Signed-in screens have no automated tests
- **Evidence:** `packages/web/e2e/*` cover guest flows, settings and layout; the Forge, Profile, Leaderboard, Dev mode and founder tools were only checked with throwaway scripts outside the repo (`../icons/shoot-*.mjs`, `axe-*.mjs`).
- **Fix:** move the Supabase route mock into `e2e/fixtures.ts` (`signedIn(page, { parts, loadout, board… })`) and add axe + layout specs for those screens at 375px/200%.
- **Effort:** M

### CQ-12 · Low · `finish_game` is copied whole into nine migrations
- **Evidence:** core_schema, ranked_target_rating, ranked_pause, solve_audit_enforce, economy_affinity, simple_economy, stardust_sinks, whole_avatars, dev_mode each `create or replace` the full ~150-line function. It's how migrations work, but each copy is a chance to drop a fix made in an earlier one.
- **Fix (no behaviour change):** split the function's stages into private helpers (`private.settle_dust`, `private.count_parts`, `private.add_influence`, `private.daily_month`) in one new migration, so later changes replace a 15-line helper, not the whole function. Covered by the existing PGlite tests.
- **Effort:** M

### CQ-13 · Low · The PGlite test file is one 343-line script
- **Where:** `supabase/tests/economy.mjs`; sections 1–11 share players and order.
- **Fix:** keep the single runner but move each section into `supabase/tests/<area>.mjs` with its own players, so a failure points at an area.
- **Effort:** S

### CQ-14 · Low · Flaky e2e test
- **Where:** `packages/web/e2e/layout.spec.ts:184` (desktop, 200% text, first-game tutorial), 45 s timeout on a click; failed once in Stage 0, passed on rerun.
- **Fix:** wait for the tutorial overlay to settle before clicking, as the other tutorial specs do; raise that test's timeout only if needed.
- **Effort:** S

## Fine as is
- No `any` casts, TODOs or stray `console.log` in `packages/web/src`.
- `copy/en.ts` (1,055 lines) is long, but it's one well-grouped source; splitting it is optional.
- The engine (`packages/engine`) is separate and tested; `techniques.ts` (925 lines) is large but cohesive.
