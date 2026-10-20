# Elomental: full review (2026-10-20)

Branch `full-review`. Stage 0 baseline: every check passes (`docs/review/BASELINE.md`). Five
specialist reviews ran in parallel, read-only, plus a code-quality review. Their full reports,
with every piece of evidence, are in `docs/review/`:

| Reviewer | Report | Findings |
| --- | --- | --- |
| backend-security-reviewer | `review/backend-security-reviewer.md` | 12 (4 Critical, 1 High, 3 Medium, 4 Low) |
| game-economy-designer | `review/game-economy-designer.md` (+ `review/economy/` sim) | 12 (3 High, 5 Medium, 4 Low) |
| qa-tester | `review/qa-tester.md` (+ `review/qa/`) | 25 (2 Critical, 3 High, 6 Medium, 14 Low) |
| ux-reviewer | `review/ux-reviewer.md` (+ `review/ux/`) | 26 (1 Critical, 6 High, 10 Medium, 9 Low) |
| ui-designer | `review/ui-designer.md` (+ `review/ui/`, 200 screenshots) | 29 (4 High, 12 Medium, 13 Low) |
| lead engineer (code quality) | `review/code-quality.md` | 14 (refactors) |

118 findings came in; merged, they make **86 items** below (5 Critical, 12 High, 32 Medium, 37 Low), plus 9 refactors. Each item says where its evidence is
(the IDs point to the specialist reports), the fix, the effort (S under 1 h, M under half a day,
L more) and the batch it ships in.

> **Do today, no code (H1):** one of the two founder accounts has no verified authenticator on
> live (confirmed with a read-only query). Whoever gets into that inbox can enrol a code and open
> Review (player emails) and Dev mode. That founder finishes setting up the authenticator, or the
> email comes off `private.founders` until they do.

## Outcome (updated at the end of Stage 4)

Every batch below shipped, one commit each on `full-review`, with all checks passing after it
(typecheck, `npm test`, `npm run test:db`, the Playwright + axe suite) and the batch's specialist
review done. Main moved only by fast-forward, after you said "Push it".

| Batch | State |
| --- | --- |
| B0 | Yours: the second founder's authenticator, and Turnstile in the dashboard |
| B1, B2 | Live: `review_integrity`, `standings_empty_sides`, `daily_month_badge` |
| B3 to B7 | Live (app only) |
| B8 | Live: `leaderboard_paging_season` |
| B9 | Live (app only). D1: the Store tile stays ("The Store opens soon.") |
| B10 | Live: `economy_pace`, and `ranked_length` for D5 |
| B11 | Live: `ranked_integrity` and the `audit-solve` Edge Function (v3). Ranked only, your call |
| B12 | Live (app only) |
| Stage 4 | R1 to R9 and L35 committed on `full-review`, not pushed. R8 is a migration, not applied live |

### Stage 4 refactors

| # | Done | How it was checked |
| --- | --- | --- |
| R1 | Five dead CSS blocks, `rankTitle`, four unread copy keys. The rest of the dead code named in CQ-4 had already gone with B8 to B12 | scripts list every class and export nothing uses |
| L35 | Glued rules on their own lines; the two `.subbar` blocks in one | all checks |
| R2 | `rpcData` / `rpcCall` in `backend/client.ts`; the leaderboard reads loadout, polish and follows through the backend. The account's key list stays written out: importing the keys made an import cycle that `signOut` avoids on purpose (follow-up commit) | all checks |
| R3 | `controls.ts`: `segmented()`, `choice()`, `settingGroup()` in Setup, Accessibility, Leaderboard and card, Dev mode, the statement. The Leaderboard and Review tabs stay their own: tabs with counts, not settings | all checks |
| R4 | `game.ts` 1,417 to 1,092 lines: `result.ts`, `wheel.ts`, `devBar.ts` | new `e2e/wheel.spec.ts`: no test drove the notes wheel before |
| R5 | `styles.css` lists 24 files in `src/styles/` in cascade order, cut at the old section headings | the built CSS is byte for byte the same (same hash) |
| R6 | Leaderboard (with the player profile), Leaderboard and card, and the founder screens load on first open; main script 456.6 to 428.8 kB. Home fetches the leaderboard ahead, so the tile still opens at once. New: offline, "No connection. This page needs the internet to open."; online after a failed load, a reload ("Loading the latest version of Elomental…") | a throwaway test: offline message, then recovery after reconnecting |
| R7 | Seven PNGs as WebP, 618 to 145 kB: hand-cup, cog (both themes), feather, sword-body, plate-wear. Wallet, calendar and sword stay PNG (WebP saved too little at the quality bar) | 42 dB PSNR or better, alpha-weighted; side by side in WebKit and Chromium |
| R8 | `finish_game` in seven private stages (migration `finish_game_stages`) | all 174 + 8 database checks; 600 random games played in a database without and one with the migration: identical replies and rows; backend-security-reviewer: safe to apply |
| R9 | `supabase/tests/`: `harness.mjs`, ten area files, `run.mjs`, and `security.mjs` (the review's proofs, on today's schema) | the same 167 checks in the same order, plus 8 security checks |

### Skipped, and why
- **SEC-1 full fix for Casual, Daily and Clash** (the server holding their puzzles): you chose
  Ranked only for B11. They stay on the B1 caps (one open Casual game, Stardust cap per day).
- **C3 is narrowed, not closed:** a bot that plays at a human pace still passes the audit
  until moves are recorded on the server.
- **S7** (the verdict still visible in `finish_game`'s answer; the 20-flag cap per player): not
  applied; low value next to B11's private audits.
- **Territories in the country list:** need a whitelist migration; not worth one now.
- **Home's name stays upper case:** the Home rule ("layout and tile look stay as they are").
- **The coach finger's loop** stays: it teaches the gesture.
- **B12 nice-to-haves:** the empty band between board and keypad on tall phones (a layout
  question for the ux-reviewer), naming the bad character in a Square code, an error icon on
  the lookalike line.
- **MIN_MEDIAN_GAP** in `audit-solve` stays 700 ms until real games show how humans pace.
- **Firefox:** it would not start on this machine, so the WebP icons were checked in WebKit and
  Chromium only.
---

## How disagreements were settled

| Topic | Positions | Settled |
| --- | --- | --- |
| The month reward | UX: Critical, a badge for a **full** month. Economy: High, a badge at **20 days**, because the sim shows casual players complete 0.07 of 5 months even with fill-ins. | **Critical** (a paid sink toward a reward that doesn't exist). Badge at **20 days**: the sim shows it's reachable for everyone. Your call (D2). |
| Ranked pauses | Security: pauses buy the full speed bonus (Critical, bounded). UX: the 5-minute pause limit already punishes commuters, unseen. | The **speed bonus and Clash time** use real time minus at most 2 minutes of pauses. The shown clock still stops, and every rule is said on screen (C4 + H10). |
| Dev mode leaking | Economy High, QA High, Security Medium. | **High**, deadline: before the first settlement on **1 November 00:05 UTC**. |
| Store tile | UX: make it the Forge. Standing rule: "Home layout and tile look stay as they are." | **Your decision** (D1). Default proposal keeps the tile and its place, changes destination and icon only. |
| Hiding the "0 Spirits" chip | UX: hide at 0. Same Home rule. | **Your decision** (D6). |
| Ranked length | UX: cap squares at ~15 minutes. Economy wasn't asked. | Copy now (H10); the par cap is a **decision** (D5), simulated by the economy designer first. |

---

## Critical

### C1 · Casual, Daily and Clash pay for any valid grid, from any number of open games
- **Evidence:** SEC-1, QA-1. `finish_game` only checks `valid_solution(p_grid)` and the minimum time (`20261020054008_dev_mode.sql:187-192`); unlimited open Casual games (`ranked_restrictions.sql:111-115`); no daily Stardust cap. Proof: 20 open games, one 46 s wait, one stock grid → +300 Stardust and 3 parts; 220 wins → 3,300 Stardust in a minute. Influence too, so the monthly war can be bought. Live: one account has 38 open games.
- **Fix:** interim (SQL): one open Casual game per player (old one closed as abandoned), a daily cap on Casual and Clash Stardust (full pay for the first 20 solves a day). Full: the server stores each game's puzzle and a solution hash at start (a `start-game` Edge Function regenerating from the seed), and `finish_game` refuses a grid that isn't that puzzle's answer.
- **Effort:** interim S · full L. **Batches:** B1 (interim), B11 (full).

### C2 · Ranked rating comes from the player's device
- **Evidence:** SEC-2, QA-2. Losses are priced on the client's `p_rating` (clamped to target ± 350): a concede at 1600 costs −4 instead of −18. Wins are graded on whatever `givens` the client sends to `audit-solve` (never compared with the seed): +31 instead of +15.
- **Fix:** losses always use the stored target; wins use the audited rating only when the audited puzzle is this game's puzzle; keep `target_rating` on every game. `audit-solve` compares the givens with the game's own puzzle.
- **Effort:** M (the loss half S). **Batches:** B1 (losses), B11 (wins).

### C3 · The solve audit passes a scripted solver and works as a free oracle
- **Evidence:** SEC-3. A logic bot passes every time; a plain reading-order copy escapes about 1 in 5; `audit-solve` can be called any number of times and its verdict and solution are readable from the player's own `games.audit`.
- **Fix:** one audit per game; move timestamps checked against the server clock and human pace; verdict kept in a private table; longer term, record moves on the server as they happen.
- **Effort:** L. **Batch:** B11.

### C4 · Pauses buy the full speed bonus
- **Evidence:** SEC-5. Ranked and Clash pauses take up to 15 minutes off the server clock while only the client hides the board: 16 real minutes counted as 60 s, +25% bonus. Clash times become unbeatable.
- **Fix:** the speed bonus and the Clash time use real elapsed time minus at most 2 minutes of pauses (D4). The shown clock still stops.
- **Effort:** S. **Batch:** B1.

### C5 · The month reward is promised and never given
- **Evidence:** UX-1, ECO-2. The Daily page promises an "October avatar"; a full month says "Month complete. Avatar unlocked!" (`en.ts:381`); the server grants nothing. Players can pay 300 Stardust a day to fill in toward it; a casual player spends 26% of their Stardust and completes 0.07 of 5 months.
- **Fix:** today, reword ("A full month: 31 of 31"; no "avatar", no "unlocked"). Then a dated badge `daily-YYYY-MM`, granted at 20 days solved or filled in (D2), shown on the result and the Profile; the badge system already exists.
- **Effort:** S (copy) + M (badge). **Batch:** B2.

## High

### H1 · One founder has no verified authenticator (live)
- **Evidence:** SEC-4, confirmed read-only. **Fix:** today: that founder verifies, or the email comes off `private.founders`. Then pin each founder to one factor in `private.is_admin`. **Effort:** S. **Batches:** B0 (you), B1 (pin).

### H2 · Dev mode leaks into the live leaderboard, the affinity war, editions and the ledger
- **Evidence:** ECO-1, SEC-6, QA-5. The dev account is #1 on the live board (3,589 Elo vs 329 for the best real player); dev mode lifts the 25-a-day influence cap (`solved_today := 0`), so test play can decide the first settlement (this month: 2 active members); it holds Mythic Shocked **No. 1** bought with dev Stardust; the ~1,000,000 Stardust fill has no ledger row.
- **Fix:** a sticky "test account" flag for any account that ever switched dev mode on: off every list and search, no influence, not paid at settlement, no numbered editions; ledger rows for every dev change; clear that account's October influence and edition. Recommended: a separate founder test account.
- **Effort:** M. **Batch:** B1, **before 1 November**.

### H3 · A Ranked win lost to a dropped connection becomes a loss
- **Evidence:** QA-3. The save is deleted before `finish_game` answers (`game.ts:820`); nothing retries; the next Ranked start forfeits the solved game (1200 → 1180). Casual/Daily lose their Stardust, part progress and Daily day.
- **Fix:** keep a pending result until the server answers; retry on reconnect, on launch and before any start; say "Saved on this phone, sending when you're back online".
- **Effort:** M. **Batch:** B3.

### H4 · One save slot: a paused Ranked game is silently replaced, then forfeited
- **Evidence:** QA-4. One `SAVE_KEY` for every mode; starting Casual replaces a paused Ranked game, which the next Ranked start forfeits as a loss. Daily and Clash too.
- **Fix:** one save per mode, or a confirm sheet ("You have a Ranked game in progress: Continue / Forfeit and start").
- **Effort:** M. **Batch:** B3.

### H5 · Dark theme: Lava used as text fails contrast
- **Evidence:** UI-1. Lava `#a85b37` as text measures 2.07–3.02:1: the SOLVED title, form errors, the Daily month heading and today, the hint coach count (axe), Elo gain, outline buttons. High contrast mode keeps it (UI-16).
- **Fix:** a text-only token `--accent-text` (dark `#e69c74`: 6.72 / 5.52 / 4.60:1; light Crimson); errors in `--text` with an icon; pairs into `PAIRS`; `contrast.ts` checks High contrast too.
- **Effort:** S–M. **Batch:** B4.

### H6 · 200% text breaks the signed-in progression screens
- **Evidence:** UI-2, UI-3, UI-4, QA-10, UX-13. Forge head runs off screen, rarity tags cut ("ommc"), plate cards collide; affinity cards cut off; leaderboard legend runs together ("30%26%23%21%"), the You bar covers a third of the screen; the "Need … more" pill overflows.
- **Fix:** grids sized by `--text-scale`, Forge head stacks, affinity grid one column, legend 2×2, compact You bar at large text, pill wraps.
- **Effort:** M. **Batch:** B5.

### H7 · The 23-part set is done in under two weeks
- **Evidence:** ECO-3. Full set on day 12 for a regular (7 grinder, 30 casual); Season Alpha runs to 1 July 2027, so ~240 days of duplicates; the part reveal goes empty in week 2.
- **Fix:** D3: end Season Alpha on 1 January 2027 with a new set (needs art), and/or the no-art stopgap of four Mythic frames (full set → day 22 regular, 57 casual).
- **Effort:** S–M (frames) / L (season). **Batch:** B10.

### H8 · Guests are told to "Play a Ranked game" to appear on a board they can never be on
- **Evidence:** UX-2, QA-12. Guests are excluded from rankings but the You bar says "Play a Ranked game to get your place" (or shows a place they never have).
- **Fix:** "Guests aren't listed. Sign up to get your place." with a Sign up button.
- **Effort:** S. **Batch:** B6.

### H9 · The guest result overflows; the sign-up box and install note collide
- **Evidence:** UX-3, QA-13. 11 blocks, "Next game" below the fold; the two notes count different things (all results vs wins) and land together.
- **Fix:** at most one optional block per result (shared counter; never on a result with a part or promotion); sign-up as a one-line link that expands; speed bonus folded into the Elo row.
- **Effort:** S–M. **Batch:** B6.

### H10 · Ranked doesn't fit a short session and hides its time rules
- **Evidence:** UX-4. Par is ~22 min at Elo 1190, ~34 at 2000; the sheet gives no length or stakes; a solve over 2× par silently cuts Elo 25%; pauses stop the server clock for only 5 minutes; leaving costs a pause.
- **Fix:** sheet: "Adept III · 1190 Elo. About 20 min. Win about +24, lose about −18. 3 pauses, up to 5 min each."; pause note; result shows the slow-solve cut. Length cap is D5.
- **Effort:** S (copy) / M–L (cap). **Batches:** B7 (copy), B10 (cap).

### H11 · The Store tile leads nowhere and shows banknotes
- **Evidence:** UX-5. Toast "The Store opens soon."; dollar bills in a game with no money.
- **Fix:** D1.
- **Effort:** S. **Batch:** B9.

### H12 · Home shows no next step and no distance to the next rank
- **Evidence:** UX-6, UX-7. No Daily state, no part progress, no "10 Elo to Adept III" anywhere (the test player was 10 Elo away).
- **Fix:** one quiet line under the profile card ("Daily: not solved yet · Next part: 2 of 3 · 10 Elo to Adept III"), a check on the Daily tile when solved; the distance on the Profile, Ranked result and Ranks sheet.
- **Effort:** M. **Batch:** B9 (Home line, subject to the Home rule) and B7 (rank distance).

## Medium

| # | Item | Evidence | Fix | Effort | Batch |
| --- | --- | --- | --- | --- | --- |
| M1 | No rate limits on `start_game`, `square_code`, `audit-solve` | SEC-8 | generic `private.hit()` limiter; server-graded square codes; one audit per game | M | B11 |
| M2 | Spirits: invisible, swingy wait | ECO-4 | 0.15% → 0.20%, guarantee 700 → 500; show "Spirit guaranteed within N squares" (first animated avatar day 51 → 40 for a regular) | S | B10 |
| M3 | Grinders' Stardust is dead (116k by day 180) | ECO-5 | "Call a Spirit" 15,000 +5,000 each (D7) | M | B10 |
| M4 | Affinity war rewards grinder density, pays one-solve members | ECO-6, QA-23 | count influence up to 300 a member a month; active and paid at 5+ solves; decide ties (both sides win) | S | B1, before 1 Nov |
| M5 | Season board ranks new accounts | ECO-7 | best Elo this season, from 20+ Ranked games (D8) | M | B8 |
| M6 | Mythic guarantee matters once | ECO-8 | with the Mythic frames (H7); honest line once you own every part of a rarity | S | B10 |
| M7 | Ties break leaderboard paging and Show me | QA-6 | page on `row_number()`, show `rank()` | M | B8 |
| M8 | A pasted Clash code from a lower-case message joins the wrong clash | QA-7 | case-insensitive token search, no whole-text fallback | S | B12 |
| M9 | A pause that fails to reach the server uses up all three | QA-8 | distinct network-error result; don't pause or count | S | B3 |
| M10 | A local guest's offline progress vanishes when the guest account is created | QA-9 | D9: a one-time note, or don't auto-create while local progress exists | M | B6 |
| M11 | Ranks sheet and show-off card are unnamed dialogs (axe serious) | QA-11 | label the loading state with the final heading, or relabel after load | S | B4 |
| M12 | Winning the month pays out silently | UX-8 | one calm card on Home after settlement | M | B9 |
| M13 | Affinity screen takes over Home; "Needs you" lands on the leading side | UX-9, UX-25 | a Home line instead of the takeover; tag the weakest side; wait 5 solves after "Decide later"; return to Profile after Change | S | B9 |
| M14 | Progression systems never introduced | UX-10 | first-win line about parts and the Forge; caption under Home's avatar | S | B9 |
| M15 | Ranked hint penalty explained only afterwards | UX-11 | "−25% Elo" on the Hint button in Ranked, or a confirm on the first hint | S | B7 |
| M16 | Daily part cap is silent | UX-12 | server says `capped`; "Parts are done for today: 3 of 3" | S | B7 (+1 line in B1) |
| M17 | Leaderboard opens on the affinity card; the list is below the fold | UX-13, QA-20 | one-row affinity strip on phones, full card in Details; tabs wrap or fade | M | B8 |
| M18 | Returning players can't see how to sign in | UX-14 | "Played before? Use the same email to sign in."; switch warning before switching | S | B6 |
| M19 | Guest Profile dead end; generated name hidden | UX-15, UX-23 | Sign up button; show the real name; hide privacy settings for guests | S | B6 |
| M20 | Clash sheet does two jobs and opens the keyboard | UX-16, QA-18 | two choices first (Challenge / I have a code); check a typed code exists before joining | M | B12 |
| M21 | Splash on every launch | UX-17 | full splash once a day, otherwise a 300 ms fade | S | B9 |
| M22 | Some text ignores Text size (no base font size) | UI-5 | `body { font-size: var(--fs-body) }`; icons in `em` | S | B4 |
| M23 | In a game at 200%, Notes ends up below the screen | UI-6, UX-24 | three columns, icon over label | S–M | B5 |
| M24 | Accent used for selection, breaking "one accent per screen" | UI-7 | neutral selected segment with ring and check; neutral "Ready to forge" outline | M | B12 |
| M25 | Three segmented controls, 8+ title styles, names change case | UI-8, UI-9 | one segmented component, three title roles, names as typed | M | B12 |
| M26 | Meaningful text at 12px | UI-10 | `--fs-small` for those labels | S | B4 |
| M27 | Federo in fake bold | UI-11 | Montserrat or weight 400 | S | B4 |
| M28 | Light-theme contrast gaps outside `PAIRS` | UI-12 | darker light `--field-border`; no opacity on text; add pairs | S | B4 |
| M29 | Clash code boxes have no visible edge (1.06:1) | UI-13 | `--field-border` edge | S | B4 |
| M30 | Keyboard focus looks like selection | UI-14 | double focus ring everywhere | S | B4 |
| M31 | Leaderboard rows carry five prestige marks; Mythic not special in the Forge | UI-15 | no glow on rows; a static foil on Mythic cards; "alive" glyph | M | B12 |
| M32 | Privacy page leaks account listeners | CQ-1, QA-25 | keep and call the unsubscribes | S | B3 |

## Low

| # | Item | Evidence | Fix | Effort | Batch |
| --- | --- | --- | --- | --- | --- |
| L1 | Hidden players stay listed up to 5 min; banned players in search | SEC-7 | filter live in `lb_range` and `lb_search` | S | B1 |
| L2 | Unused `handoff` Edge Function deployed without JWT check | SEC-9 | delete it (dashboard, your OK), drop `signin_handoffs` (32 rows) | S | B11 |
| L3 | Founder title given to an unconfirmed sign-up | SEC-10 | require `email_confirmed_at` | S | B1 |
| L4 | `squares` grants full write + TRUNCATE to anon; no non-negative balances | SEC-11 | revokes, default privileges, check constraint | S | B1 |
| L5 | A player banned mid-game still gets Elo | SEC-12 | `unrated := 'restricted'` in `finish_game`; cap review flags | S | B1 |
| L6 | Ledger out for 6 real players (326 Stardust) | ECO-9 | one `opening` row each | S | B1 |
| L7 | "Three times likelier" isn't what the code does | ECO-10 | correct the comment, doc and odds copy | S | B10 |
| L8 | Unrated Ranked wins use up the 9 counted solves | ECO-11 | don't count flagged games | S | B1 |
| L9 | Docs disagree with code (Crowns, 30 solves, 48 parts, Starlit, season rollover) | ECO-12 | rewrite the Revision section; plan the rollover | S | B10 |
| L10 | Daily: yesterday free via `start_game`; a filled-in day can be played | QA-14 | refuse mended dates; tighten the window | S | B1 |
| L11 | Repeating `buy_plate` buys the next plate | QA-15 | `buy_plate(p_plate)` | S | B1 |
| L12 | Ranked clock stops on screen during hints and tutorial, not on the server | QA-16 | don't freeze the competitive clock; fix the statement line | S | B7 |
| L13 | Square code with 0/O/1/I/L just disables Play | QA-17 | a hint line | S | B12 |
| L14 | Sign-out leaves the last account's data; `no_game` shown as "No connection" | QA-19 | clear per-account keys; map `no_game` | S | B3 |
| L15 | Dev bar covers the game timer | QA-21 | move it under the status row | S | B12 |
| L16 | Showcase accepts duplicates; country accepts any 2 letters | QA-22 | distinct; whitelist | S | B1 |
| L17 | Country search misses "turkey", "cote"; territories missing | QA-24 | accent-folded search, aliases | S | B12 |
| L18 | "0 Spirits" on Home for months | UX-18 | D6 | S | B9 |
| L19 | Filling in is undiscoverable; month card misleads when out of reach | UX-19 | a note under the calendar; honest line when the month can't complete | S | B2 |
| L20 | Copy slips ("Mythic or better", "DNF", "4 / 3" mistakes, Daily called a timed race…) | UX-20 | the table in UX-20 | S | B7 |
| L21 | Concede is the primary button in its own confirm | UX-21 | Keep playing primary | S | B7 |
| L22 | Unhappy faces as rewards | UX-22 | when art resumes | L | later |
| L23 | No season end date shown | UX-26 | "Season Alpha · until 1 July" | S | B10 |
| L24 | Disabled primary still looks primary | UI-17 | neutral disabled tokens | S | B12 |
| L25 | Spacing and radii off the scale | UI-18 | map to `--space-*`, add `--radius-lg` | M | B12 |
| L26 | Raw colours left in CSS | UI-19 | tokens | S | B12 |
| L27 | Decorative loops never rest | UI-20 | 2 iterations, then rest (Alive stays) | S | B12 |
| L28 | Rows peek under the You bar | UI-21 | padding and skirt | S | B5 |
| L29 | Numbers formatted three ways | UI-22 | one `formatNumber` | S | B12 |
| L30 | Sheet icon badges don't match | UI-23 | mode colour or neutral | S | B12 |
| L31 | Affinity cards repeat one placeholder face | UI-24 | the element crest in its frame | S | B9 |
| L32 | Home stat chips don't line up | UI-25 | reserve the icon row (Home look kept) | S | B9 |
| L33 | Empty band between board and keypad | UI-26 | taller keys | S | B12 |
| L34 | Layout test never visits the screens that break | UI-27, CQ-11 | signed-in fixture in `e2e/fixtures.ts` | M | B5 |
| L35 | CSS tidiness (glued rules, duplicate `.subbar`) | UI-28 | format once | S | Stage 4 |
| L36 | Shortcuts sheet uneven | UI-29 | grid, SVG arrows | S | B12 |
| L37 | Flaky e2e test (`layout.spec.ts:184`) | CQ-14 | wait for the tutorial overlay | S | B5 |

---

## Code refactors (Stage 4, after the fixes, no behaviour change)

Each is its own commit, with all checks run after it.

| # | Refactor | Evidence | Effort |
| --- | --- | --- | --- |
| R1 | Delete dead CSS (~170 lines: old showcase, plate sheet, tug bar, layered avatar, crest state) and dead code (`rankTitle`, unread copy keys) | CQ-4, CQ-5 | S |
| R2 | One `rpcCall` / `rpcData` in `backend/client.ts` for the four wrappers; storage keys and the follows query back into their owners | CQ-7, CQ-8 | S |
| R3 | One `segmented()` and `settingGroup()` / `choice()` in `controls.ts` (seven hand-built copies) | CQ-6 | M |
| R4 | Split `game.ts` (1,329 lines): `result.ts`, `wheel.ts`, `devBar.ts` | CQ-2 | M |
| R5 | Split `styles.css` (6,675 lines) into `styles/` (tokens, base, components, one file per screen), built CSS diffed before and after | CQ-3, UI-28 | M |
| R6 | Code-split founder screens, privacy and leaderboard (`import()`): today one 433 kB script | CQ-9 | S–M |
| R7 | Re-encode heavy PNGs as WebP (hand-cup 172 kB × 2, wallet 89 kB …), checked sharp in Firefox | CQ-10 | S |
| R8 | Split `finish_game` into private stage helpers in one migration, so later changes replace 15 lines, not 150 | CQ-12 | M |
| R9 | Split `supabase/tests/economy.mjs` into areas; add `security.mjs` from the security review | CQ-13, SEC proofs | S |

---

## Database changes

All are new files in `supabase/migrations/`, tested with `npm run test:db` first, and **applied to
live only by you**. Full SQL drafts are in the specialist reports (sections named below).

### DB-1 `review_integrity` (batch B1, before 1 November)
- **What:** C2 losses on the target; C1 interim (one open Casual game, daily Casual/Clash Stardust cap); C4 pause allowance; H1 founder pinned to one factor (`private.founders.factor_id`); H2 test-account flag (`profiles.test_account`, off `private.lb`, no influence, no settlement pay, no editions, dev ledger rows); M4 affinity rules (300 cap, 5 solves, ties); M16 `capped` in `finish_game`'s answer; L1 live filters; L3 title on confirmation; L4 grants and non-negative check; L5 banned mid-game; L6 opening ledger rows; L8 flagged games don't count; L10 Daily window and mended days; L11 `buy_plate(p_plate)`; L16 distinct showcase, country whitelist.
- **Drafts:** security §SEC-1/2/4/5/7/10/11/12; economy §4.1, §4.2 (ECO-11 line), §ECO-6; QA fixes for L10/L11/L16.
- **Existing players' data:**
  - ~170 stale open Casual/Clash games closed as abandoned (no payout, no Elo); Ranked untouched.
  - The dev account: off the board, its October influence row deleted, its Shocked edition number cleared (No. 1 freed), ledger rows added; balances unchanged.
  - 6 players get an `opening` ledger row (326 Stardust total); balances unchanged.
  - Founders: Review and Dev mode stop until you set each `factor_id`.
  - Nobody's Stardust, Elo or parts change.
- **Undo:** a follow-up migration restoring the previous function bodies (kept in the migration as comments); the closed games and cleared edition can't be reopened, by design.

### DB-2 `daily_month_badge` (batch B2)
- **What:** `private.daily_month()` grants `daily-YYYY-MM` at 20 days (D2) from `finish_game` and `mend_daily`. Draft: economy §4.2.
- **Data:** no balance changes; optionally grant October 2026 to anyone at 20+ on 1 November.
- **Undo:** drop the function call; badges already granted stay.

### DB-3 `leaderboard_paging_season` (batch B8)
- **What:** M7 a dense position for paging; M5 `season_best` with the 20-game rule. Recreates `private.lb` and the `lb_*` functions.
- **Data:** none (a snapshot); **Undo:** recreate the previous view.

### DB-4 `economy_pace` (batch B10, after decisions D2, D3, D7)
- **What:** M2 Spirit 0.20% / 500; H7 four Mythic frames (`s0-frame-<element>-4`); M3 `call_a_spirit` (if D7 yes). Drafts: economy §4.2, §4.3, §4.4.
- **Data:** `spirit_pity` kept (anyone at 500+ gets a Spirit on their next counted solve: live maximum is tiny); new parts arrive unowned; balances untouched.

### DB-5 `game_puzzle_integrity` (batch B11, with an Edge Function)
- **What:** C1 full fix (`games.givens`, `games.solution_hash`, written by a `start-game` Edge Function), C2 wins (`target_rating`, audited givens must match), C3 one audit per game and private audits, M1 rate limiter, L2 drop `signin_handoffs`. Drafts: security §SEC-1/2/3/8/9.
- **Data:** `games.audit` copied to `private.game_audits` then dropped; 32 expired hand-off rows deleted; nothing else.
- **Rollout:** old clients send no givens, so the server accepts games without a hash for a short window, then refuses them.

---

## Batches (ship one at a time, in this order)

| Batch | Contents | Needs | Specialist review |
| --- | --- | --- | --- |
| **B0** | H1 founder authenticator; confirm Turnstile is on (dashboard) | **you, today** | — |
| **B1** | Security and economy integrity: C2 (losses), C1 interim, C4, H1 pin, H2, M4, M16 server line, L1, L3, L4, L5, L6, L8, L10, L11, L16 → DB-1 | migration approval, **before 1 Nov** | backend-security, game-economy |
| **B2** | C5 month reward: copy today, then DB-2; L19 | D2, migration approval | game-economy, ux |
| **B3** | Results never lost: H3, H4, M9, L14, M32 | — | qa |
| **B4** | Accessibility: H5, M11, M22, M26, M27, M28, M29, M30 (+ UI-16 contrast for High contrast) | — | ui-designer |
| **B5** | 200% and test coverage: H6, M23, L28, L34 (signed-in e2e fixture), L37 | — | ui-designer, qa |
| **B6** | Guests: H8, H9, M10, M18, M19 | D9 | ux |
| **B7** | Ranked clarity: H10 copy, H12 rank distance, M15, M16 client, L12, L20, L21 | — | ux |
| **B8** | Leaderboard: M7, M5, M17 → DB-3 | D8, migration approval | ux, backend-security |
| **B9** | Home and onboarding: H11, H12 Home line, M12, M13, M14, M21, L18, L31, L32 | D1, D6 | ux, ui-designer |
| **B10** | Economy pacing: H7, M2, M3, M6, L7, L9, L23, H10 length cap → DB-4 | D3, D5, D7, migration approval | game-economy |
| **B11** | Full anti-cheat: C1 full, C2 wins, C3, M1, L2 → DB-5 + Edge Functions | migration and deploy approval | backend-security |
| **B12** | Visual consistency and polish: M8, M20, M24, M25, M31, L13, L15, L17, L24–L27, L29, L30, L33, L36 | — | ui-designer |
| **Stage 4** | R1–R9 refactors, L35 | — | — |

## Decisions only you can make

| # | Decision | Default proposal |
| --- | --- | --- |
| D1 | Store tile, given the rule "Home layout and tile look stay as they are" | Keep the tile and its place; it opens the Forge and gets an anvil icon instead of banknotes. Or leave it as it is. |
| D2 | Month badge rule | 20 days solved or filled in (economy sim), not a full month |
| D3 | Season Alpha | Four Mythic frames now (no art needed), and end Season Alpha on 1 January 2027 if Season 1 art can be ready |
| D4 | Pause allowance for the speed bonus and Clash time | 2 minutes |
| D5 | Ranked length | Cap par so a Ranked square is about 10–15 minutes at every level (economy designer simulates first) |
| D6 | Hide "0 Spirits" on Home | Show the chip only once you have a Spirit (changes Home's look, so your call) |
| D7 | "Call a Spirit" Stardust sink | Yes, 15,000 +5,000 each per season |
| D8 | Season board rule | Best Elo this season, from 20+ Ranked games |
| D9 | A local guest's offline progress | A one-time note: "Games played offline stay on this phone" |

## Still needs a human
- Testing on a real phone (iOS Safari and Android Chrome): the keyboard, the install flow, page turns,
  the notes wheel (long-press, slide, swipe), the Clash sheet's steps and Paste, and Text size at 200%.
- A screen reader pass (VoiceOver and TalkBack) on the game, the result, the leaderboard, the Clash
  sheet and Setup's option groups.
- Confirming Turnstile and the Auth rate limits in the Supabase dashboard (not readable from SQL).
- B0: the second founder finishes setting up the authenticator, or comes off `private.founders`.
- Deleting the old `handoff` Edge Function in the dashboard (removed from the repo in B11).
- After the first real Ranked wins: check `private.game_audits` shows the dealt puzzle matched,
  and that `audit-solve`'s CPU time is fine at targets 1466 and 1800.
- R8: applying `finish_game_stages` to the live project, when you approve it.
- Opening the WebP icons once in Firefox.

---

*Stage 2 ended with the plan above; the Outcome section at the top says what happened to it.*
