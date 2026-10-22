# UX review: Elomental, full pass (2026-10-20, branch `full-review`)

Reviewer: ux-reviewer. Audience: players aged 35–45, 5–15 minute sessions, driven by completion and personal
stats. This review builds on `docs/AUDIT.md` (same day, earlier build) and does not repeat what has since
been fixed.

**Method.** I read every screen in `packages/web/src/screens`, plus `reward.ts`, `profile.ts`, `playerCard.ts`,
`install.ts`, `tutorial.ts`, `accountForm.ts`, `copy/en.ts` and the live migrations. I then walked the
flows in Playwright against the running dev server at 375×812, in dark and light, at 100% and 200% text.
Every Supabase call was answered by fakes or aborted, with a catch-all abort, so nothing reached the live
project. The scripts are in `..\icons\review-ux\`, and the screenshots in
`docs/review/ux/` (cited as `ux/NN-name.png`).

**Limits.**
- I didn't test on a real phone or with real players.
- The game results came from mocked `finish_game` answers built on the server's real shapes.
- I didn't check iOS keyboard behaviour (autofocus) on a device.

---

## Where the last audit stands

| AUDIT.md item | Status now |
| --- | --- |
| Unkept promise: monthly Daily avatar | **Still open.** The open question was never decided (UX-1). |
| Unkept promises: affinity rewards, "tokens" | Fixed. Monthly settlement pays a badge and 300 Stardust. |
| Store and Leaderboard dead-end tiles | Leaderboard built. **Store is still a dead end** (UX-5). |
| No Profile | Built. It reads well (see "What works well"). |
| Result crowded | Better: one reward strip, no tips. **Still crowded for guests** (UX-3). |
| 14px floor for meaningful labels | Done. |
| "Open the Forge" under a new part | Done. |
| Stardust sinks (plates, polish, fill in) | Done. |
| Splash on every launch (#9) | **Not done** (UX-17). |
| Affinity takes over Home (#10) | **Not done** (UX-9). |
| Ranked levels off, season goals (#8) | Not started. Partly mitigated by the Season list. |

---

## Prioritised findings

Effort: **S** under 1h, **M** under half a day, **L** more.

### UX-1 · Critical · The monthly Daily avatar is promised and never given

- **Flow:** Daily Square page → month card; the result of the last Daily of a full month.
- **Evidence:**
  - The Daily page always shows "October avatar: Solve every square this month to unlock it" (`copy.daily.avatar`, `avatarLocked`; `screens/daily.ts:246-256`; `ux/09-daily-dark.png`).
  - At the end of a full month, the result says "Month complete. Avatar unlocked!" (`copy.result.monthComplete`, `en.ts:381`; `game.ts:961`; `ux/31-result-daily-month-complete.png`).
  - `finish_game` only returns a `monthComplete` flag (`20261020054008_dev_mode.sql:299`). Nothing grants anything: no part, no badge.
  - Players can now spend 300 Stardust a day to "fill in" toward this goal (`daily.ts:131`).
- **Why it matters:** this is the single biggest reward moment for the most loyal players: 31 days of play, possibly paid for with Stardust. Being told "unlocked" and finding nothing is exactly the "misled" feeling that makes this audience quit and leave a review. The last audit flagged it, and it has grown worse now that fill-ins cost Stardust.
- **Fix:** the cheapest honest real reward uses what already exists. Grant a dated **badge** (`daily-2026-10`, source `earned`) in `finish_game` and `mend_daily` when `done = days`, and show it on the result: "October complete. The October badge is on your Profile." The badges table, the Profile grid and the show-off card already handle it. Later, upgrade it to a month frame part if wanted.
- **Interim (today):** reword to "A full month: 31 of 31". Remove "avatar" and "unlocked".
- **Effort:** S (reword) / M (badge migration).

### UX-2 · High · Guests who play Ranked hit a dead end on the Leaderboard

- **Flow:** guest (anonymous account) → Leaderboard.
- **Evidence:**
  - Anonymous players are excluded from `private.lb` (`20261020071349_leaderboard.sql:103`).
  - `lb_me` then returns `rated: true, place: null`, so the pinned bar falls through to `t.notInView[view]`: "Play a Ranked game to get your place." or "Play a Ranked game to compare with your friends." (`leaderboard.ts:225`; `ux/18-leaderboard-guest.png`).
  - The guest has already played 6 Ranked games. There's no sign-up path on the page.
  - `copy.privacy.guest` ("Make an account to appear on the leaderboard.") exists but appears only in Setup.
- **Why it matters:** the instruction is false. Following it does nothing, and the player concludes the board is broken. It's also the best sign-up moment in the app, and it's wasted.
- **Fix:**
  - When `cachedAccount().anonymous`, the bar says: "Guests aren't listed. Sign up to get your place." It adds a **Sign up** button that opens the existing `signUpForm` in a sheet.
  - If cheap, `lb_me` computes the would-be place live, as it does for hidden players: "…you'd be about #3,410".
- **Effort:** S (copy and button) / M (live place).

### UX-3 · High · The result pop-up still overflows for guests; buttons fall below the fold

- **Flow:** guest wins a Ranked square (3rd result) → result.
- **Evidence:** `ux/27-result-guest-crowded.png` (375×812) shows 11 blocks:
  - Solved, line, Time, Mistakes, Elo, Promoted, Speed bonus;
  - Stardust, the Epic part, Open the Forge, the guarantee;
  - the install note, and "Keep your rewards" with its own button.

  **Next game is not visible without scrolling** (`ux/28-…-full.png`).
- **Cause:** the two nags were meant never to share a result (`game.ts:1285` comment), but they count different things:
  - sign-up counts every result (`RESULTS_KEY`, `game.ts:1295`);
  - the install note counts wins (`SOLVES_KEY`, `install.ts:132`).

  After any loss they drift, and here they landed on the same win.
- **Why it matters:** the result is the dopamine moment. Two unrelated asks bury the part reveal, and the primary action becomes a scroll target. The popup is also non-dismissible.
- **Fix:**
  1. At most **one** optional block per result. Use one shared counter, and give priority to promotion or part, then sign-up, then install.
  2. Never show sign-up or install on a result that already shows a part or a promotion.
  3. Make sign-up a one-line link ("Keep this on any device: Sign up") that expands, not a titled card.
  4. Fold "Speed bonus +15%" into the Elo row ("1190 → 1214 (+24, speed +15%)").
- **Effort:** S–M.

### UX-4 · High · Ranked doesn't fit a 5–15 minute session, and hides its time rules

- **Flow:** Home → Ranked sheet → game → pause → result.
- **Evidence:**
  - **Par is long.** Par is `240 + 0.9 × rating` seconds (`profile.ts:44`): about 22 minutes at Elo 1190 and 34 minutes at 2000. Ranked targets the player's own Elo, so every regular faces squares that outlast their session.
  - **The sheet gives no length or stakes.** It says only "A square matched to your Elo. Solve it to climb.", with no length, stakes or rules (`ux/08-ranked-sheet.png`).
  - **Slow solves are cut silently.** A solve slower than 2× par cuts the Elo gain by 25% (`speedBonus`, `profile.ts:63`). The result only ever shows a *positive* bonus (`game.ts:956`). The timer just dims to muted when over par (`styles.css:4062`), with no meaning given.
  - **Long pauses count against the player.** A pause stops the server clock for at most 5 minutes (`least(…, 300)`, `20261017061526_ranked_pause.sql:31,79`). The client clock stays frozen, so a commuter who pauses for 20 minutes sees the time jump on the result and loses the speed bonus or takes the −25%. The pause cover only says "2 pauses left" (`ux/24-game-ranked-paused.png`).
  - **Leaving costs a pause.** The only way out of Ranked without conceding is Pause, then Home, which uses a pause.
- **Why it matters:** for this age group a Ranked game must be finishable in the slot they have. Hidden rules that cut a reward afterwards feel like being cheated, even when they're fair.
- **Fix:**
  - **(a) Ranked sheet:** "Adept III · 1190 Elo. About 20 min. Win about +24, lose about −18. 3 pauses, up to 5 min each."
  - **(b) Pause note:** "2 pauses left. The clock waits up to 5 minutes."
  - **(c) Result:** show the cut when it applies: "Slow solve: Elo gain −25%".
  - **(d) Rebalance, for game-economy-designer:** cap par, or the target rating's difficulty, so a Ranked square at any level is about 10–15 minutes. Climb on rating, not length.
- **Effort:** S for (a)–(c); M–L for (d).

### UX-5 · High · The Store tile is a dead end, drawn as a wallet of banknotes

- **Flow:** Home → Store.
- **Evidence:** `home.ts:103` shows a toast "The Store opens soon." (`ux/04-home-store-toast.png`). The tile is the second largest on Home and is illustrated with dollar bills and coins (`ux/02-home-player-dark.png`). CLAUDE.md: no real money, nothing pay-to-win.
- **Why it matters:** this audience "quits at anything pay-to-win". A money wallet as a top-level tile signals monetisation that doesn't exist, and its only behaviour is a dead end. The last audit asked to replace it.
- **Fix:** turn the tile into **Forge**, the real Stardust sink that's currently 2 taps deep and unlabelled. It opens `forgeScreen()` and uses an anvil or ember icon, or the Profile. Bring a Store back only when it has something to sell, with no banknote art.
- **Effort:** S (plus the icon from ui-designer).

### UX-6 · High · Home shows no state and no next step

- **Flow:** open the app → Home.
- **Evidence:** Home shows the avatar, name, rank, and Elo, Stardust and Spirits counts (`home.ts:87-99`; `ux/02`, `ux/03`). It doesn't say:
  - whether today's Daily is solved;
  - how close the next part is (only the result shows "Next part: 2 of 3", which the last audit flagged as Medium);
  - how close the next division is.

  A first-time guest gets five equal tiles and no suggestion of where to start.
- **Why it matters:** the "one more square" hooks only appear at the end of a game. A player opening the app on the bus needs one clear reason to start now, and Home is where that decision happens.
- **Fix:**
  - **One quiet line** under the profile card, each part tappable: "Daily: not solved yet · Next part: 2 of 3 · 10 Elo to Adept III".
  - **Daily tile:** a check mark when today is solved.
  - **For a brand-new player:** "Start with today's Daily Square".
- **Effort:** M.

### UX-7 · High · Rank progress is invisible: the climb has no "how far"

- **Flow:** Profile, Ranked result, Home.
- **Evidence:** every surface shows only the tier label: "Apprentice I" with 1190 Elo, while Adept III starts at 1200 (`profile.ts:178-184`; `ux/11-profile-player.png`). The Ranks sheet lists floors but not your distance (`leaderboard.ts:402-427`). The promotion line exists (`game.ts:936`), but nothing builds anticipation for it.
- **Why it matters:** "10 Elo to Adept III" is the strongest one-more-game line the app could print, and it's free. Completion-driven players want the bar, not just the badge.
- **Fix:**
  - **Profile:** a small bar under the tier: "10 Elo to Adept III".
  - **Ranked result:** "(+24 · 36 to Adept II)".
  - **Ranks sheet:** "You: 10 to go".
  - Archmage shows place instead.
- **Effort:** S.

### UX-8 · Medium · Winning the month pays out silently

- **Flow:** the 1st of the month, next app open.
- **Evidence:** `settle_faction_month` adds a dated badge and +300 Stardust (`…_leaderboard.sql:475-500`). Nothing on the client tells the player. The Stardust count just jumps.
- **Why it matters:** a reward nobody sees is a wasted reward, and an unexplained balance change erodes trust. This is the payoff of a month of influence.
- **Fix:** on the first launch after settlement, show one calm, dismissible card on Home: "Fire won October. +300 Stardust and the October badge are yours." It opens the Profile badges. The client can detect a new `win-*` badge since its last check.
- **Effort:** M.

### UX-9 · Medium · The affinity choice still hijacks Home, and "Needs you" contradicts the standings

- **Flow:** third solve → back to Home → after 900 ms, auto-navigation to "Your affinity".
- **Evidence:**
  - **The takeover:** `home.ts:146-148` (`ux/17-affinity-auto-opens.png`).
  - **The tag:** "Needs you" goes to the side with the fewest members (`affinity.ts:28`), even when that side is **1st this month**. In the screenshot it's on Water, ranked 1st, because sides are ranked per player.
  - **The way back:** "Decide later" asks again after the very next solve (`backend/affinity.ts:62-66`).
- **Why it matters:** an unrequested full-page detour right after a win breaks "one clear next step". A tag that says a leading side needs you reads as manipulation once noticed.
- **Fix:**
  - As the audit proposed: a one-line Home card, "Choose your side: Fire, Water, Earth or Air", that opens the same page.
  - Tag the side with the **lowest strength**, or drop the tag.
  - After "Decide later", wait 5 solves, not 1.
- **Effort:** S.

### UX-10 · Medium · The progression systems are never introduced

- **Flow:** first game → first result → Forge.
- **Evidence:**
  - **The tutorial teaches only controls.** It has 7 steps, including the advanced notes wheel (`game.ts:1220-1254`).
  - **The first result names systems it never explains.** It shows "+8 Stardust", "+3 influence for Fire" and "Next part: 1 of 3 squares" with no word on what parts or Stardust are for.
  - **The Forge is hard to reach.** The way there is Home's *unlabelled* avatar, then Profile, then Forge: 3 taps. The aria-label says "Opens your profile", but sighted players get no cue.
- **Why it matters:** collecting is a core motivator for this audience, but only if they know it exists. Players who never find the Forge never feel the loop.
- **Fix:**
  - **First win of all time:** add one line to the result: "Every 3rd solve brings an avatar or a frame. Spend Stardust in the Forge." Include an **Open the Forge** link.
  - **Home:** a small "Profile" caption under the avatar.
  - **With UX-5:** the Forge gets its own tile.
- **Effort:** S.

### UX-11 · Medium · The Ranked hint penalty is explained only after the fact

- **Flow:** a Ranked game → Hint.
- **Evidence:**
  - The −25% Elo cut per hint is announced by a toast **after** the hint opens: "Hints this game: Elo gain −25%" (`game.ts:622`).
  - The tutorial mentions it only if the very first game happened to be Ranked (`game.ts:1251`).
  - The Hint button looks the same in every mode.
- **Fix:** in Ranked, the Hint button shows "−25% Elo" under its label, or the first hint per Ranked game asks "Hint: your Elo gain drops 25%. Use it?" with **Use hint** and **Keep playing**.
- **Effort:** S.

### UX-12 · Medium · The daily part cap is silent

- **Flow:** the 10th solve of the day → result.
- **Evidence:** after 9 counted solves, `progress_json` stays null (`…_dev_mode.sql:266-270`), so the "Next part" strip simply disappears. The rule lives only in "How parts work".
- **Why it matters:** the counter vanishing without a word looks like a bug, or like the game holding out. A clear "done for today" is also a healthy natural stopping point for this audience.
- **Fix:** the server returns `{ capped: true }` and the strip says "Parts are done for today: 3 of 3. More tomorrow." Stardust still counts.
- **Effort:** S (client, if `solved_today` is returned) / M.

### UX-13 · Medium · The Leaderboard opens on the affinity card; the list is below the fold

- **Flow:** Home → Leaderboard.
- **Evidence:**
  - **At 100%:** the affinity card (leader, bar, legend, a two-line explanation, days and prize, "yours") fills the first ~60% of the screen. The pinned "You" bar covers the 2nd row (`ux/18`, `ux/19`).
  - **The tabs are cut off.** Five tabs scroll sideways, so "Season" is cut and "Country" is hidden.
  - **At 200%:** the legend percentages collide ("30%26%23%21%", "Wate" under the Earth mark), and no list row is visible at all (`ux/21-leaderboard-200.png`; layout belongs to ui-designer).
- **Why it matters:** the design doc's own rule is "where am I, who's near me, who's best", one tap away. The page opens on something else.
- **Fix:**
  - On phones, collapse the affinity card to one row: "Fire leads 30% · 11 days left · Details ›". The full card goes into the Details sheet.
  - Keep the strength note in the sheet only.
  - Consider fewer tabs (Friends, Everyone, Season), with affinity and country as a filter inside Everyone.
- **Effort:** M.

### UX-14 · Medium · Returning players can't see how to sign in, and the progress-loss warning comes late

- **Flow:** new phone → Setup → Account.
- **Evidence:**
  - **Guests see only sign-up.** The guest copy says "Sign up with your email to keep…" (`en.ts:562`). The same form also signs into an existing account, but nothing says so (`ux/15-setup-guest.png`).
  - **The warning comes after the code is sent.** "Signing in switches to it; this guest's progress won't move over." appears only at the code step (`accountForm.ts:123`).
- **Fix:**
  - Add a second line: "Played before? Use the same email to sign in."
  - Make the switch warning a confirm *before* switching: **Switch to that account** or **Use a different email**.
- **Effort:** S.

### UX-15 · Medium · The guest Profile is a dead end, and the name is hidden

- **Flow:** guest → Profile.
- **Evidence:**
  - **No way to act on the advice.** It says "Make an account to keep your avatar, parts and Elo on any device." with no button (`profile.ts:103`; `ux/14-profile-guest.png`).
  - **The name is hidden.** Guests are shown as "Guest" (`profile.ts:72`) though the server already gave them a name like "Calm Sage". After sign-up the name changes without warning, and renaming lives only in Setup.
- **Fix:**
  - A **Sign up** button under the note, opening the form.
  - Show the real generated name.
  - A small "Edit" beside the name on the Profile, using the same 15-day rule.
- **Effort:** S.

### UX-16 · Medium · The Clash sheet does two jobs, opens the keyboard, and its create buttons have no verb

- **Flow:** Casual → Clash a friend.
- **Evidence:**
  - **One sheet, two jobs.** Joining (code boxes, Paste, a disabled primary **Join clash**) and creating ("or create one", then **Easy / Medium / Hard**) share one sheet (`ux/07-clash-sheet.png`).
  - **The keyboard opens.** The code field auto-focuses (`clashSheet.ts:119`), so on a phone it covers the create buttons. Most first visits are to *create*.
  - **No verb on create.** Tapping "Easy" instantly makes a code with no confirmation of intent.
- **Fix:**
  - The sheet opens on two clear choices: **Challenge a friend** (then pick a difficulty, then share) and **I have a code**, which focuses the field only then.
  - Label the buttons "Create Easy code", and so on.
- **Effort:** M.

### UX-17 · Medium · The splash still plays on every launch

- **Evidence:** `welcome.ts:30` holds 2.8 s, then peels, on every `main.ts` start (`ux/01-splash.png`).
- **Why it matters:** in a 5-minute session, 3–4 seconds of brand animation every open adds friction. Tap-to-skip helps only if people know about it.
- **Fix:** the full splash once a day. Other launches show a 300 ms fade straight to Home.
- **Effort:** S.

### UX-18 · Low · Home always shows "0 Spirits"

- **Evidence:** the third Home chip is Spirits (`home.ts:67`). The odds are 0.15% per counted solve, guaranteed within 700 (`en.ts:260`): about 6 months for a 4-a-day player. Most players see "0 SPIRITS" on every launch for months.
- **Why it matters:** a stat that never moves reads as "you're failing at something". It also pushes Home's play tiles further down.
- **Fix:** show the Spirits chip only when Spirits > 0. Show Elo and Stardust otherwise. Spirits stay visible in the Forge.
- **Effort:** S.

### UX-19 · Low · Daily: filling in is undiscoverable, and the month card misleads when the month is out of reach

- **Evidence:**
  - **No hint that missed days are tappable.** Missed days are buttons, but nothing says so. Today and future days are buttons that do nothing (`daily.ts:189-202`).
  - **The goal stays up after it's impossible.** With 4 missed days and 3 fill-ins a month, the card still says "Solve every square this month to unlock it" (`ux/09`).
- **Fix:**
  - Add a note under the calendar when there are missed days: "Tap a missed day to fill it in: 300 Stardust, 3 a month."
  - Tapping today starts today's game.
  - When the month can't be completed, the card says "A fresh month starts November 1."
- **Effort:** S.

### UX-20 · Low · Copy errors and glossary slips (en.ts)

| Where | Problem | Fix |
| --- | --- | --- |
| `forge.guarantee` (`en.ts:224`), used for Mythic (`reward.ts:63`) | "Mythic or better within 2 parts": nothing is better than Mythic | "Mythic within 2 parts." for the top rarity |
| `clash.notFinished: 'DNF'` (`en.ts:492`) | Racing jargon | "Not solved" |
| `clash.waitingForFriend` (`clashSheet.ts:255`) | Always says "Open the result link they send you", even signed in, where results arrive by themselves | Use the online note when signed in |
| `clash.logNoteOnline` | "(they need an account too)": guests have one; confusing | "Results arrive once your friend finishes." |
| `statement.limits[2]` (`en.ts:655`) | Says Daily is a timed race with limited pauses; in code Daily isn't competitive (`game.ts:246`) | "Ranked and Clash are timed races…" |
| `result.mistakesOf` (`game.ts:926`) | Shows "4 / 3" when the Casual mistake limit is off | Show just "4" when the limit is off |
| `account.nameAgainOn` / `nameAgainOnHint` | Duplicates | Keep one |
| `dev.ts:37` | Activity list loading shows "Opening the Forge…" | Use `common.loading` |

- **Effort:** S.

### UX-21 · Low · The Concede confirm makes the destructive choice primary

- **Evidence:** `game.ts:1023` makes **Concede** `btn-primary` and **Keep playing** secondary (`ux/29-concede-confirm.png`). In Ranked, Concede also sits where **Home** sits in every other mode.
- **Fix:** make **Keep playing** the primary (default focus) and Concede secondary.
- **Effort:** S.

### UX-22 · Low · Some reward avatars are unhappy faces

- **Evidence:** the collectible faces include Upset, Sad, Disappointed, Bored and Tired, with Epic "Scared" and Mythic "Shocked" (`copy.forge.avatars`; `ux/12-forge-top.png`). "New part: Disappointed" is what a win can bring.
- **Why it matters:** this is placeholder art (art is parked), but the reward should feel like a gift, not a joke at the player.
- **Fix:** when art resumes, make the drops aspirational: element creatures, forged masks. Flag to the owner and ui-designer.
- **Effort:** L (art).

### UX-23 · Low · Guests see leaderboard and card settings that do nothing

- **Evidence:** `setup.ts:147` shows the "Leaderboard and card" row to any account, guests included. The page then just says "Make an account to appear on the leaderboard." above working-looking toggles (`privacy.ts:55`).
- **Fix:** for guests, replace the row with a sign-up line.
- **Effort:** S.

### UX-24 · Low · At 200% text, the primary actions leave the first screen

- **Evidence:**
  - **Home:** the profile card and three stacked chips fill the whole first screen. Casual and Ranked are below the fold (`ux/05-home-200.png`).
  - **Game:** Undo and Notes need a scroll (`ux/34-game-casual-200-light.png`).
- **Fix (ui-designer):** at large text, put the chips in one row and shrink the avatar. In the game, put Hint, Undo and Notes in one row of icon-and-label buttons.
- **Effort:** M.

### UX-25 · Low · Changing affinity from the Profile drops you on Home

- **Evidence:**
  - **Wrong place after joining:** `affinity.ts:71` always goes back to Home after joining, even when opened from Profile → Change.
  - **Wrong button:** "Decide later" shows when changing.
  - **No warning about influence:** the confirm doesn't say influence already earned stays with the old side.
- **Fix:**
  - Return to the caller.
  - Hide "Decide later" when switching.
  - Add to the confirm: "Influence you've added stays with Fire."
- **Effort:** S.

### UX-26 · Low · The season has no end date anywhere

- **Evidence:** the only season copy is "Season Alpha: n of 23 parts" (`copy.profile.season`). Seasons are 6 months, ending 1 July 2027.
- **Fix:** "Season Alpha · until 1 July" on the Collection line and the Season tab.
- **Effort:** S.

---

## Assessments asked for

### "One more square" moments, and where motivation drops

**Working:**
- "Next part: 2 of 3 squares" with its three pips (`ux/33`);
- "Mythic within 2 parts";
- the promotion stamp;
- the Daily calendar filling up.

**Missing:**
- those hooks never appear before a game (UX-6);
- the distance to the next division is never shown (UX-7).

**Drops:**
- the 10th solve of a day, when the counter silently vanishes (UX-12);
- a 20–30 minute Ranked square at Adept and above (UX-4);
- the moment the Daily month becomes impossible (UX-19);
- a "month complete" that gives nothing (UX-1).

### Reward moments: satisfying, brief, skippable?

Mostly yes:
- the part reveal is short and tap-skippable (`reward.ts:50`);
- counts animate in under a second and respect Reduce motion;
- the reward strip is one tidy block for registered players (`ux/26`, `ux/33`).

The exceptions:
- guests get two asks stacked on top (UX-3);
- the result can't be dismissed, so its length matters more.

### Dark patterns

**No fake timers, energy, paid randomness or streak guilt.** The odds and guarantees are published, and missed days are a gentle struck-out number, not red. "11 days left" is a factual countdown.

**Borderline:**
- "Needs you" on a leading side (UX-9);
- the dollar-bill Store tile signalling monetisation that doesn't exist (UX-5);
- "Keep your rewards" framing the sign-up as loss-avoidance (acceptable, keep it calm);
- the monthly-avatar promise, the one real trust break (UX-1).

### Is Ranked motivating or stressful for 35–45?

**Low-stress:**
- protection below 500;
- gentle losses (−18 at 1190);
- calm Conceded copy;
- no losses shown to others.

**The stress is hidden and about time:**
- long squares;
- a dimming clock with no explanation;
- a silent −25% for slow solves;
- pauses that quietly stop protecting after 5 minutes (UX-4).

**Motivation will fade once Elo levels off** without visible distance-to-next (UX-7) or season goals (AUDIT #8).

### Do the Profile and show-off card read instantly?

**Yes, both are clear** (`ux/11`, `ux/20`):
- avatar, plated name, rank and element;
- one stats block, collection with a bar, badges;
- the card shows "3120 Elo · Peak 3204 · #1" in one line.

**Gaps:**
- the Profile has no distance to the next division (UX-7);
- no way to see your own card as others see it (a "Preview my card" link would make the badge choice meaningful);
- guests can't act on the sign-up note (UX-15).

---

## What works well

- **The core puzzle.** It's calm, precise and well taught:
  - hints explain *why*;
  - mistakes fade without fuss;
  - keyboard and screen reader play are complete;
  - large text works in-game.
- **Two taps to any game.** Casual remembers your difficulty; the resume card shows time and percent.
- **The Daily page** is a lovely ritual. The calendar is readable in both themes, fill-in is kind and capped, and its sheet is plain and honest ("Your Elo doesn't change").
- **The parts loop is honest:**
  - a visible 3-step counter;
  - published odds and guarantees in plain words;
  - duplicates that pay out;
  - "Open the Forge" right under a new part.
- **The Forge is tidy:**
  - each card says its state in words (Owned, Equipped, Ready to forge, Not enough Stardust yet);
  - name plates show the next goal and its price;
  - every price uses one unit (Stardust).
- **Profile and show-off card** read at a glance. Badges have a real, earned source, and Follow is one-way with no requests.
- **Copy quality is high overall.** Glossary terms are used consistently, losses carry no humour, errors are blameless, and the win lines are varied and dry ("Checkmate, grid.").
- **Setup is grouped and literal.** Accessibility goes deep (text to 200%, keep wrong numbers, mistake limit off in Casual) and has a reset.

---

## Top 5 changes for fun and retention

1. **Make the month real (UX-1).** A dated "full month" badge on the Profile and card, granted on the 31st solve or fill-in. It turns the Daily into a collectible ritual and removes the biggest trust risk.
2. **Put the next goal on Home (UX-6 + UX-7).** One line: "Daily: not solved · Next part 2 of 3 · 10 Elo to Adept III". Every open starts with a reason to play one square.
3. **Make Ranked fit the bus ride (UX-4).** Show length and stakes before Start, explain pauses and slow-solve cuts, and cap squares at ~15 minutes. A finished Ranked game per session is the habit that lasts.
4. **One reward moment per result (UX-3, UX-8, UX-12).** Never stack asks on a drop. Celebrate the monthly affinity win with one calm card. Say "done for today" when parts pause. Brief, clear and earned.
5. **Turn the Store tile into the Forge (UX-5 + UX-10)**, with a first-win line that explains parts and Stardust. Collecting becomes visible from Home, and the only money imagery disappears.

---

## Screenshots

In `docs/review/ux/`:
- **Home, splash and the auto-opened affinity screen:** `01-splash`, `02-home-player-{dark,light}`, `03-home-newguest`, `04-home-store-toast`, `05-home-200`, `17-affinity-auto-opens`.
- **Casual, Clash and Ranked:** `06-casual`, `07-clash-sheet`, `08-ranked-sheet`.
- **Daily Square:** `09-daily-{dark,light}`, `10-daily-fill-in`.
- **Profile, Forge and Setup:** `11-profile-player`, `12-forge-top`, `13-forge-full`, `14-profile-guest`, `15-setup-guest`, `16-setup-player-200`.
- **Leaderboard:** `18-leaderboard-guest`, `19-leaderboard-player`, `20-show-off-card`, `21-leaderboard-200`.
- **Games, results and concede:**
  - `22-tutorial-step1`, `23-game-ranked`, `24-game-ranked-paused`;
  - `25/26-result-ranked-win`, `27/28-result-guest-crowded`;
  - `29-concede-confirm`, `30-result-ranked-conceded`;
  - `31-result-daily-month-complete`, `32-game-casual`, `33-result-casual-win`, `34-game-casual-200-light`.
