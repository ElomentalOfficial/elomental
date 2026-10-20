# QA pass: every feature (branch full-review, 2026-10-20)

Read-only pass. No project file was changed apart from this report and the evidence in
`docs/review/qa/`. Server logic was probed in throwaway PGlite databases that replay all 35
migrations (scripts in `C:\Users\Barsmin\Desktop\Claude\icons\review-qa\`: `harness.mjs`,
`probe-games.mjs`, `probe-lb.mjs`). The UI was driven with Playwright against the running dev
server (5173), with every `*.supabase.co` request faked or aborted (`ui-harness.mjs`,
`ui-bugs.mjs`, `ui-bugs2.mjs`, `ui-sweep.mjs`). No request reached the live project
(`unhandled` counts in the JSON evidence are aborted calls from local-guest runs).

## Suites

| Check | Result | Log |
| --- | --- | --- |
| `npm test` | pass (engine 30/30, web 3/3 incl. contrast) | `qa/npm-test.txt` |
| `npm run typecheck` | pass | `qa/typecheck.txt` |
| `npm run test:db` | all checks passed | `qa/test-db.txt` |
| `npm run test:a11y -w @elomental/web` | 84 passed, 40 skipped (light-theme layout duplicates), 0 failed; the known flaky `layout.spec.ts:184` passed first time | `qa/a11y-1.txt` |

## Bugs

Severity follows the brief: anything that pays Elo, Stardust, parts or influence that wasn't
earned is Critical.

### QA-1 · Critical · Casual, Daily and Clash pay for any valid grid, from any number of open games

- **Steps:** as any signed-in or guest account, call `start_game('casual', 'hard')` 20 times,
  wait 46 s, then `finish_game(id, true, 0, 0, 46, null, <any valid solved sudoku>)` for each.
  Repeat.
- **Expected:** a win is paid only for solving the square the server started; one open Casual
  game (or a small cap); Stardust per day bounded.
- **Actual:** every call pays. 20 games opened together → +300 Stardust after 46 s; 220 games →
  3,300 Stardust in about a minute of wall time, using the same stock grid each time. Each
  solve also adds influence (up to the 25/day cap) and counts toward parts and Spirits (9/day).
  Daily (+12) and Clash (any well-formed code is a new clash) work the same way.
- **Evidence:** `qa/probe-games.txt` P1. `supabase/migrations/20261020054008_dev_mode.sql:187-192`
  only checks `private.valid_solution(p_grid)` (a valid sudoku, not *this* sudoku) and the
  too-fast floor; `20261017192343_ranked_restrictions.sql:111-115` opens unlimited Casual games.
- **Suspected cause:** the puzzle is generated in the browser from the seed, so the server has
  no givens to compare against for non-Ranked modes.
- **Proposed fix:** store the givens at start (the client already registers every puzzle with
  `square_code`; have `start_game` take/return the givens via an Edge Function that regenerates
  from the seed, as `audit-solve` does for Ranked), and in `finish_game` require
  `p_grid` to agree with every given. Also: at most one open game per mode (finish/forfeit the
  old one like Ranked does), and a daily Stardust ceiling for non-Ranked solves.
- **Effort:** L

### QA-2 · Critical · A Ranked loss is priced on the rating the client reports

- **Steps:** at 1600 Elo, start Ranked (target 1600) and concede with
  `finish_game(id, false, 3, 0, null, 99999, null)`.
- **Expected:** the loss is priced at the target (or the audited rating): about −18.
- **Actual:** −4. The rating is clamped to target + 350 and stored as 1950. Over 20 conceded
  games: honest −360 Elo, inflated −80.
- **Evidence:** `qa/probe-games.txt` P2. `20261020054008_dev_mode.sql:203-205`: for a loss
  `unrated` is null and `g.audit` is null, so `coalesce(..., p_rating, g.rating)` takes the
  client's `p_rating`.
- **Suspected cause:** the coalesce meant for wins also applies to losses.
- **Proposed fix:** for `not p_won`, use the audited rating if one exists, else `g.rating`
  (the target); ignore `p_rating` in Ranked entirely. (Related, not fixable the same way:
  `p_hints`/`p_mistakes` are client-reported, so a modified client can skip the 25%/hint cut.)
- **Effort:** S

### QA-3 · High · A Ranked win lost to a dropped connection is never retried, then becomes a loss

- **Steps:** signed in, start Ranked, solve it, and lose the connection as the result is sent
  (`finish_game` fails). Go Home, start Ranked again.
- **Expected:** the result is kept and sent again when the connection is back; the solved game
  counts as a win.
- **Actual:** the result says "No connection. This game wasn’t saved to your account.", the
  local save is already deleted (`elomental:game` = null), there is no retry, and the Ranked
  tile offers a new game. The next `start_game('ranked')` finishes the solved game as a **loss**
  (1200 → 1180 in the probe). Casual/Daily wins in the same situation lose their Stardust,
  part progress and Daily day.
- **Evidence:** `qa/T1-ranked-win-offline.png`, `qa/ui-bugs.json` T1, `qa/probe-games.txt` P3.
  `packages/web/src/screens/game.ts:820` (`removeKey(SAVE_KEY)` before `settle`),
  `game.ts:860`, `backend/games.ts:104-106`, forfeit in
  `20261017192343_ranked_restrictions.sql:101-102`.
- **Proposed fix:** keep a "pending result" (game id, grid, moves, mistakes, hints) until
  `finish_game` answers; retry on reconnect, on launch and before any `start_game`; show
  "Saved on this phone, sending when you’re back online".
- **Effort:** M

### QA-4 · High · One save slot: a paused Ranked game is silently replaced, then forfeited

- **Steps:** Ranked → Start → Pause → Home (paused Ranked offers Home) → Casual → Play Easy →
  Home → Ranked.
- **Expected:** a warning before replacing a game in progress, or a separate save per mode;
  the Ranked tile resumes the paused game.
- **Actual:** no warning anywhere (the Casual page shows no resume card for a Ranked game);
  `elomental:game` switches from `ranked` to `casual`; the Ranked tile now opens the Start
  sheet. Signed in, starting Ranked then forfeits the old game as a loss (QA-3 evidence). The
  same overwrite loses a Daily or Clash in progress (Clash keeps its server clock running).
- **Evidence:** `qa/T2-ranked-gone.png`, `qa/ui-bugs.json` T2. `game.ts:114` (one `SAVE_KEY`),
  `game.ts:220`, `casual.ts:102` (resume only for Casual saves), `home.ts:194-195`.
- **Proposed fix:** one save per mode (`elomental:game:<mode>`), or a confirm sheet ("You have
  a Ranked game in progress: Continue it / Forfeit and start") whenever a start would replace a
  save of another mode.
- **Effort:** M

### QA-5 · High · Dev mode leaks into the live leaderboard and the monthly affinity war

- **Steps:** founder with authenticator code, dev mode on: choose Air, Set Elo 4800, play 100
  Casual games with Solve now, one Ranked game. Refresh the snapshot.
- **Expected:** dev tools change only the founder's own account; nothing reaches public
  boards or other players' rewards.
- **Actual:** +400 influence for Air in one sitting (the 25-solves-a-day influence cap is
  skipped because `solved_today` is forced to 0 in dev mode); Air's standing 407 vs 0 for the
  rest, so Air would win the month and every Air player would get a badge and 300 Stardust.
  The founder is #1 on the public Everyone list at 4805 Elo, with a rated Ranked win that skipped
  the audit. (Rated Critical by the rubric if it happens in a live month; listed High because
  it needs a founder with the authenticator and is logged.)
- **Evidence:** `qa/probe-lb.txt` L5. `20261020054008_dev_mode.sql:239` (`if dev then
  solved_today := 0`) also lifts the influence cap at `:273`; `private.lb` in
  `20261020071349_leaderboard.sql:88-111` has no dev-mode exclusion.
- **Proposed fix:** in dev mode pay no influence (or keep the 25 cap), and leave players with
  `dev_mode` (or anyone who has ever used it this season) out of `private.lb` and
  `affinity_months`; or force `lb_hidden` while dev mode is on.
- **Effort:** S

### QA-6 · Medium · Ties break leaderboard paging and Show me

- **Steps:** 315 ranked players, 300 of them tied at Elo 100 (common: protected losses below
  500 leave new players at the same Elo). Open Everyone; tap Show more; as a tied player tap
  Show me.
- **Expected:** 50 rows a page; Show me returns about 21 rows.
- **Actual:** page 0 returns 310 rows, pages 1–5 return nothing, page 6 the last 5. In the UI,
  three taps on Show more add nothing and the button stays (310, 310, 310, 310 rows). Show me
  returns 310 rows instead of 21 (it would be thousands on the live board).
- **Evidence:** `qa/probe-lb.txt` L1, `qa/ui-bugs.json` T4. Pages are rank ranges:
  `20261020071349_leaderboard.sql:175-176` (`global_rank between p_from and p_to`) and
  `:269`; client stop rule `screens/leaderboard.ts:206`.
- **Proposed fix:** add a dense position (`row_number() over (order by elo desc, id)`) to
  `private.lb`, page and window on it, and keep showing `rank()` as the place.
- **Effort:** M

### QA-7 · Medium · A Clash code pasted from a lower-case message joins the wrong clash

- **Steps:** Casual → Clash a friend → paste "my code is k7p2qx" (or type "see you k7p2qx").
- **Expected:** K7P2QX, or nothing with a "no code found" note.
- **Actual:** the field fills with **MYCDES** (first six code letters of the whole message)
  and Join is enabled, so the player races alone on a clash their friend never sees. A message
  with another six-character capital word first ("Beat 3:12 SOLVED K7P2QX") gives "SVED".
- **Evidence:** `qa/ui-bugs.json` T5. `screens/clashSheet.ts:174-178`: the word match is
  upper-case only, then it falls back to `normalizeCode(text)` on the whole text
  (`clash.ts:47-53`).
- **Proposed fix:** search the text case-insensitively for six-character tokens made only of
  the code alphabet (prefer the last one, or the one after "code"); never fall back to the
  whole message; same for typed input containing spaces.
- **Effort:** S

### QA-8 · Medium · A pause that fails to reach the server uses up all three pauses

- **Steps:** signed in, Ranked, no connection (`pause_game` fails), tap Pause.
- **Expected:** "Couldn’t pause: no connection" with the clock still running, pauses unchanged.
- **Actual:** the board pauses locally with "0 pauses left"; after resuming, Pause says "No
  pauses left in this game." The server recorded no pause at all, so its clock kept running.
- **Evidence:** `qa/T9-pause-offline.png`, `qa/ui-bugs2.json` T9. `backend/games.ts:59`
  returns `0` (no pauses left) for any error; `game.ts:667-671`.
- **Proposed fix:** return a distinct "failed" result for network errors and don't pause or
  count; only `no_pauses_left` maps to null.
- **Effort:** S

### QA-9 · Medium · A local guest's progress vanishes once the app gets a guest account

- **Steps:** play offline as a local guest (Elo 640, 380 Stardust, 12 Ranked games, a Daily);
  next launch online, the app creates an anonymous account.
- **Expected:** the progress carries over, or the player is told it stays behind.
- **Actual:** Home shows the new account's 100 Elo and 0 Stardust; the local profile stays in
  storage, unseen and unused, with no message.
- **Evidence:** `qa/ui-bugs2.json` T11. `profile.ts:67-81` (an account replaces the local
  profile), `backend/account.ts:137-139` (guest account created on any session-less launch).
- **Proposed fix:** a product decision (the server never trusts client numbers): at least a
  one-time note "Games played offline stay on this phone", or don't auto-create the guest
  account while a local profile with progress exists until the player agrees.
- **Effort:** M

### QA-10 · Medium · Text at 200%: Forge head clipped, affinities card overlaps, cost pill overflows

- **Steps:** Setup → Accessibility → Text size 200%; open Leaderboard and Forge (375 px and
  320 px); open Happy in the Forge with too little Stardust.
- **Expected:** everything reflows inside its card (WCAG 1.4.4 / 1.4.10).
- **Actual:** Forge head: intro, "How parts work", "Stardust" and "Fire · 2nd this month" cut
  off at the right edge. Leaderboard affinities card: "Fire / Leading" runs under "30%", the
  four legend names collide and the percentages run together ("30%26%23%21%"); at 320 px
  "Details" is cut off. Bring to life: the "Need 5750 more" pill runs out of the sheet. The
  pinned You bar takes about a quarter of a 568 px screen.
- **Evidence:** `qa/sweep-375-200-Forge.png`, `qa/sweep-320-200-Forge.png`,
  `qa/sweep-375-200-Leaderboard.png`, `qa/sweep-320-200-Leaderboard.png`,
  `qa/sweep-375-200-Part-sheet-Happy-.png`, `qa/ui-sweep.json`. CSS: `.forge-head`
  `grid-template-columns: 112px 1fr` (`styles.css:2579-2585`), `.lb-strength-legend` 4 fixed
  columns (`styles.css:6010`), `.life-cost-short { white-space: nowrap }` (`styles.css:2765`).
- **Proposed fix:** under `[data-large-text]` stack the Forge head (avatar above, balances
  below), let the legend wrap to 2×2, allow the pill to wrap; add these screens to
  `layout.spec.ts` (see coverage gaps).
- **Effort:** S–M

### QA-11 · Medium · The Ranks sheet and the show-off card open as unnamed dialogs

- **Steps:** Leaderboard → Ranks; Leaderboard → tap a player. Run axe, or listen with a
  screen reader.
- **Expected:** each dialog is named by its heading.
- **Actual:** axe `aria-dialog-name` (serious) on both, both themes.
- **Evidence:** `qa/ui-sweep.json` axe. `ui.ts:141-146` names a dialog by its first heading
  when it opens; both sheets open with only a "Loading" note and get their heading later
  (`screens/leaderboard.ts:403-425`, `playerCard.ts:115-127`).
- **Proposed fix:** give the loading state the final heading (or an `aria-label`), or call
  `labelByHeading` again after the content is replaced.
- **Effort:** S

### QA-12 · Low · An anonymous guest's pinned bar shows a place they never have

- **Steps:** as a guest with Ranked games, open the Leaderboard.
- **Expected:** "Sign up to be on the leaderboard" (guests are never listed).
- **Actual:** "You #11 of 315" with Show me; Show me finds no row for you.
- **Evidence:** `qa/T3-anon-pinned-bar.png`, `qa/ui-bugs.json` T3, `qa/probe-lb.txt` L2.
  `screens/leaderboard.ts:220-229` ignores `me.listed` and `account.anonymous`.
- **Proposed fix:** branch on `!me.listed && account.anonymous` with its own line and the
  sign-up action.
- **Effort:** S

### QA-13 · Low · The sign-up box and the install note can land on the same result

- **Steps:** phone, local guest: lose, lose, win.
- **Expected:** never both on one result (the comment in `game.ts:1285` says so).
- **Actual:** the third result shows both.
- **Evidence:** `qa/T6-result-both-notes.png`, `qa/ui-bugs.json` T6. Sign-up counts every
  result (`game.ts:1295-1297`), the install note counts only wins (`install.ts:130-134`).
- **Proposed fix:** one shared result counter, or skip the sign-up box when the install note
  is shown.
- **Effort:** S

### QA-14 · Low · Daily: yesterday's square is free through `start_game`; a filled-in day can still be played

- **Steps:** set the device date back a day (or call `start_game('daily', null, today-1)`).
- **Expected:** a missed day is filled only through the 300-Stardust mend.
- **Actual:** yesterday (and tomorrow) can be played and paid (+12 each), so three Dailies in one
  UTC day; a day mended for 300 can then be played as well.
- **Evidence:** `qa/probe-games.txt` P4. Window `ranked_restrictions.sql:118`; the
  `daily_done` check ignores `daily_mends` (`:119`).
- **Proposed fix:** refuse a mended date; accept `today-1` only while it is still that date
  somewhere (UTC hour < 12) and `today+1` only when UTC hour ≥ 10.
- **Effort:** S

### QA-15 · Low · Repeating a plate purchase buys the next plate too

- **Steps:** call `buy_plate()` twice (a double request or a retry after a timeout).
- **Expected:** the second call is refused or does nothing.
- **Actual:** Bronze then Silver, 3,500 Stardust (the db suite does exactly this on purpose).
  The UI disables its button, so this needs a repeated request.
- **Evidence:** `20261020035332_stardust_sinks.sql:37-52`; `supabase/tests/economy.mjs:168`.
- **Proposed fix:** `buy_plate(p_plate)` and refuse unless `p_plate = cur + 1`.
- **Effort:** S

### QA-16 · Low · The Ranked clock stops on screen during hints and the tutorial, but not on the server

- **Steps:** Ranked, open a hint walkthrough for a minute (or play Ranked as the very first game,
  with the tutorial).
- **Expected:** the shown time matches the time that counts.
- **Actual:** the client freezes the clock (`game.ts:773-775`) but the server counts wall time
  (`dev_mode.sql:184`); the result jumps the time up and the speed bonus uses the larger time.
  Also, the Accessibility statement says Daily is a timed race with limited pauses
  (`copy/en.ts:655`); in code Daily pauses freely like Casual.
- **Proposed fix:** don't freeze the competitive clock for hints (say so in the hint card), or
  pause on the server while the walkthrough is open; drop "Daily" from the statement line.
- **Effort:** S

### QA-17 · Low · A square code with 0, O, 1, I or L just disables Play

- **Steps:** Square code → type `K7P2-QX0M`.
- **Expected:** a line saying codes never use 0, O, 1, I or L.
- **Actual:** Play is disabled with no message (`qa/ui-bugs.json` T8). Unknown codes are
  handled well ("No square has that code…").
- **Evidence:** `squareCode.ts:26-31`, `screens/squareSheet.ts:32-38`.
- **Proposed fix:** when the raw input has 8 characters but filtering removed some, show a
  hint line.
- **Effort:** S

### QA-18 · Low · A mistyped Clash code starts a new clash; codes never expire

- **Steps:** your friend sends K7P2QX; you type K7P2QZ.
- **Expected:** "Nobody has played this code yet: check it with your friend" before starting.
- **Actual:** any well-formed code inserts a new clash and you race alone; `clashes` has no
  expiry (`qa/probe-games.txt` P5).
- **Proposed fix:** on Join (not on create), check `get_clash` first and confirm when it has no
  entries.
- **Effort:** S

### QA-19 · Low · Sign-out leaves the last account's things on the device

- **Steps:** sign out (or switch account by email).
- **Expected:** the new account starts clean.
- **Actual:** only `elomental:account` is removed (`backend/account.ts:156-161`). The old
  loadout/polish (Home avatar until refreshed; the leaderboard You bar reads them directly,
  `screens/leaderboard.ts:248-253`), the clash log and a saved game remain. Resuming that
  game finishes it as the new account: `finish_game` raises `no_game`, which isn't in
  `copy.refusals.finish`, so the player is told "No connection". The same message hides
  `already_finished` after a second device forfeited the game.
- **Proposed fix:** clear per-account keys on sign-out / user change; map `no_game` to its own
  line.
- **Effort:** S

### QA-20 · Low · The leaderboard tabs hide "Country" off-screen with no scroll cue

- At 375 px / text 100% the fifth tab is partly off-screen and the row's scrollbar is hidden
  (`styles.css:6077-6085`); at 200% three tabs are. Evidence `qa/ui-sweep.json`. Fix: fade
  edge or wrap to two rows. Effort S.

### QA-21 · Low · The dev bar covers the game timer (founders only)

- `qa/T10-dev-bar-375-100.png`; `.dev-bar` is fixed at the top centre (`styles.css:5841`).
  At 200% it also covers Home/Pause. Fix: put it under the status row. Effort S.

### QA-22 · Low · Showcase and country accept nonsense

- `set_showcase(['b','b','b'])` is accepted and the card shows the same badge three times;
  `set_country('ZZ')` / `'XX'` are stored (`qa/probe-lb.txt` L4;
  `20261020071349_leaderboard.sql:404-427`). Fix: `array(select distinct …)`, and check the
  code against the list the client offers. Effort S.

### QA-23 · Low · An exact tie in the monthly war goes to Fire

- Equal standing and influence: the winner is whichever comes first in `unnest(array['fire',
  …])` (`qa/probe-lb.txt` L6; `leaderboard.sql:483`). Fix: pay both, or tie-break by members,
  then say how in the odds/affinities sheet. `settle_faction_month` also accepts a mid-month
  date. Effort S.

### QA-24 · Low · Country picker misses common spellings and some places

- Searching "turkey" or "cote" finds nothing (names are "Türkiye", "Côte d’Ivoire"); Puerto
  Rico, Greenland and other territories aren't offered (`screens/privacy.ts:10`, `:73-74`).
  Fix: accent-folded search plus a few aliases; decide on territories. Effort S.

### QA-25 · Low · Leaderboard and card settings leak account listeners

- `privacyScreen` subscribes three times with `onAccountChange` and never unsubscribes (no
  `destroy`; `screens/privacy.ts:28, 47`); each visit adds listeners that repaint detached
  nodes. Effort S.

## Tested and fine

- **Game rules (server):** `already_finished` on a repeated finish; `too_fast` per difficulty
  (casual easy after 14 s refused); invalid grid refused; negative mistakes/hints clamped;
  another player's game → `no_game`; casual seconds capped by wall time.
- **Ranked:** open game forfeited on the next start; 3 server pauses then `no_pauses_left`;
  each pause free for at most 5 minutes; finishing while paused counts correctly; Elo floor 0
  and no loss below 500; rating clamped to target ± 350; restricted players can't start Ranked
  and leave the board.
- **Daily:** one solve per date (`daily_done`); retry after a loss reuses the seed; the
  ±1-day window covers every time zone from UTC−12 to UTC+14 with the 3 AM local reset; mends:
  3 a month, not today, not a solved day.
- **Clash:** malformed codes (`abcdef`, `ABCDE1`, `ABCDEI`, 7 characters) refused; one attempt
  per code (`clash_played`); `get_clash` returns both players' results; links with `#clash=`
  parse correctly.
- **Square codes:** with or without the dash, any case, inside a sentence; unknown code message.
- **Economy:** db suite (drops every 3rd solve, guarantees, duplicates → Stardust, daily part
  limit, Spirit pity, forge prices, already owned, not enough Stardust, bring to life once,
  equip only owned); Forge/plate/mend/badge buttons disable on the first tap.
- **Affinity:** needs 3 *won* squares; one switch in the season's first 7 days, then
  `affinity_locked`; influence stops after 25 solves a day; settlement pays once.
- **Accounts:** anonymous guests never listed, never in search, card `missing` to others,
  can't be followed; hidden players likewise; founder tools need the authenticator code;
  dev tools refused with dev mode off.
- **Leaderboard search:** prefix first, typos ("anastsia", "anstasia"), `%`/`_` escaped, long
  names, 5,000-character query, one-letter queries not counted, 30 a minute then `slow_down`.
- **Screens without bugs in the sweep** (layout at 375/320 px, text 100/200%, axe in both
  themes): Profile, badge picker, affinity choice, full profile, Setup (founder), Dev mode,
  Leaderboard and card, country picker, Daily, mend sheet, game, result with a part.

## Gaps in automated coverage worth adding

1. **Signed-in screens in Playwright.** `e2e/` only covers guest flows. A `signedIn` fixture
   with faked RPCs (as in `icons/review-qa/ui-harness.mjs`) would put Leaderboard, Forge,
   Profile, Dev, Privacy, Affinity, mend and the result-with-part through `layout.spec.ts` and
   axe; it would have caught QA-10, QA-11 and QA-20.
2. **Result delivery:** a test where `finish_game` fails and the result must be kept and
   retried (QA-3), and one for the cross-mode save warning (QA-4).
3. **Code parsing unit tests** in `packages/web/test`: `extractCode` and `readSquareInput`
   with lower-case messages, look-alike characters and links (QA-7, QA-17).
4. **DB tests** (`supabase/tests/economy.mjs`): a finish with a grid that doesn't match the
   game's puzzle must fail (QA-1); a Ranked loss with an inflated `p_rating` (QA-2); dev mode
   paying no influence and staying off `private.lb` (QA-5); ties paging 50 rows a page (QA-6);
   `buy_plate` repeated (QA-15); Daily for a mended or out-of-window date (QA-14); settlement
   ties; showcase duplicates.
5. **Pause offline** (QA-8) and **anonymous You bar** (QA-12) as small e2e checks.
6. **Result-note cadence** (QA-13): a unit test over 15 results mixing wins and losses.
