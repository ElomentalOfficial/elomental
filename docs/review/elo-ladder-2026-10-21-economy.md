# Ranked ladder redesign: economy review (2026-10-21)

Design consult by the game economy designer. Nothing in code, migrations or docs is changed; the
draft migration at the end is for the owner to approve. Simulator:
[`docs/review/economy/elo-ladder-sim.mjs`](economy/elo-ladder-sim.mjs) (output:
`economy/elo-ladder-sim.txt`, raw: `economy/elo-ladder-sim.json`). Run
`node docs/review/economy/elo-ladder-sim.mjs 10000 180`.

## 1. Recommendation in one paragraph

Take the owner's idea: names only, Elomental at the top, a scale about half as long. Add one
change the owner didn't ask for, which is what actually fixes the hard squares: **stop deriving
the square from the Elo number and serve a fixed "stage" per Elo band instead**. Each rank becomes
a technique family: Novice = singles with plenty of givens, Apprentice = leaner singles, then
pointing, Adept = pairs and triples, Archmage = X-Wings and wings, Elomental = chains. The last
stage of Adept and of Archmage brings in the next rank's technique, so players meet it before the
rank needs it. Scale: start 100, floors **0 / 300 / 600 / 1000 / 1450**, the best players settle
around **1600–1650**. Novice is protected (below 300). A loss costs **what a win earns** from 500
up, so a player at their level wins about half their games. Show a **progress bar to the next
rank** and **five quiet "new technique" moments** in place of divisions, and keep a rank until Elo
falls **50 below** its floor. Halving the numbers without the stage table changes nothing (§4.3).

## 2. What's wrong today (verified in code)

- Squares follow Elo one for one up to 1200 (`private.ranked_target`, `profile.ts rankedTarget`),
  and `generator.ts ratedProfile` switches to level-2 carving (min 24 clues) at target 260 and to
  X-Wing level at 650. A new player reaches 260 after about 3 wins.
- Elo is priced as an even match against your own Elo (`ranked_opponent`), so a game's stake
  depends only on K. Where a player settles depends on how often they win the squares they're
  served. In steady state the win rate is about **L / (L + 1 + b)**, where L is the loss multiplier
  and b the average speed bonus. The live loss curve (0.5 at 500) puts that at about 1 win in 3.
  Gentler losses don't make the plateau kinder: they push it higher, into squares the player
  loses more often.
- Win chance of a typical player (the median of each persona) on the square served, by the
  technique model (§4.1):

| Live Elo | Square target | Casual (singles) | Medium (pointing, pairs) | Enthusiast (X-Wing) | Diehard (chains) |
|---:|---:|---:|---:|---:|---:|
| 150–250 | singles, 30 clues | 91% | 94% | 97% | 99% |
| 300 | level 2, 24 clues | **38%** | 83% | 93% | 97% |
| 500 | level 2 | **5%** | 62% | 87% | 94% |
| 800 | level ≤3 | 1% | **29%** | 78% | 91% |
| 1200 | level ≤4, 17 clues | 0% | 7% | 52% | 84% |
| 2400 | level 5 | 0% | 0% | 17% | 70% |

- Result (live rules, 10,000 players per persona, 2–4 Ranked games a day, 180 days): **a
  singles-only player never leaves Novice.** They sit just under 500, where losses still cost
  nothing, and win **6%** of their games from then on. A newspaper-medium solver never reaches Adept
  (80% end in Apprentice, winning 40%). Divisions flicker: a medium player is demoted a division
  about 17 times in 180 days. 57% of all players are still Novice at day 180.
- Doc vs code: the owner believes protection ends "around 200". The code says **500**
  (`elo_delta`: `player < 500`; `profile.ts PROTECTED_BELOW = 500`; copy "No Elo lost below 500").
  The Revision line "a regular reaches Elementalist around day 39" comes from the older logistic
  skill model in `eco-sim.mjs`. Under a technique model it doesn't hold: only chain solvers get
  past Adept.

## 3. The proposed ladder

### 3.1 Ranks (names only, no divisions)

| Rank | Elo floor | What its squares ask | Width |
|---|---:|---|---:|
| Novice | 0 (start 100) | singles, 38+ then 34+ givens | 300 |
| Apprentice | 300 | singles at 30 givens, then one pointing/claiming, then 2–3 | 300 |
| Adept | 600 | a pair, then pairs and triples; last stage: one X-Wing or XY-Wing | 400 |
| Archmage | 1000 | fish and wings; last stage: one chain | 450 |
| Elomental | 1450 | chains; from 1600 finned Swordfish/Jellyfish | open (top about 1650) |

Five names are enough, because each one is a skill a player can name ("I can do X-Wings now").
Adding more names would only dilute them. What divisions gave was frequent small steps, and three
things replace that:

1. **Progress bar to the next rank** on Home, the Profile and the Ranked result ("Adept · 140 to
   Archmage"; `nextRank` already returns the gap). A win moves it about 6% in Apprentice, 4% in
   Adept and 2.5% in Archmage. In Elomental, show the personal best Elo.
2. **New technique moments** (stages A2, D1, D4, M3, E2): a calm one-time note on the result,
   "Your Ranked squares can now need pointing", linking to how the technique works. Players meet
   1–5 of these. They are information, not a reward or a currency.
3. **Rank grace**: a rank is kept until Elo is 50 below its floor. In one sentence: "You keep a
   rank until you drop 50 Elo below it." It cuts demotions from 1.3 to 0.1 per player in 180
   days. For a casual who learns pointing and settles right on Adept's floor, it cuts them from
   94 to 3. This needs a stored `profiles.rank_tier`.

### 3.2 Stages (Elo to square, decoupled from the engine rating)

Player Elo and the engine's puzzle rating become separate scales. Elo picks a **stage**, and the
stage fixes the generation profile. The engine rating is kept only for par, `clamp_rating` and the
Easy/Medium/Hard label.

| Stage | From Elo | Givens (min) | Techniques the square needs | Engine profile (generator.ts) | Target rating (par) |
|---|---:|---:|---|---|---:|
| N1 | 0 | 38 | singles | `{1,1,minClues:38}` (= casualEasy) | 150 |
| N2 | 200 | 34 | singles | `{1,1,minClues:34}` | 160 |
| A1 | 300 | 30 | singles | `{1,1,minClues:30}` | 175 |
| A2 | 400 | 30 | exactly 1 pointing/claiming | `{2,2,30, techniques:SINGLES+pointing+claiming, requires:[pointing,claiming], maxAdvancedSteps:1}` | 310 |
| A3 | 500 | 28 | 2–3 pointing/claiming | as A2, `minClues:28, minAdvancedSteps:2, maxAdvancedSteps:3` | 360 |
| D1 | 600 | 28 | 1 pair (+ ≤2 pointing) | `{2,2,28, techniques:SINGLES+pointing+claiming+nakedPair+hiddenPair, requires:[nakedPair,hiddenPair], maxAdvancedSteps:3}` | 420 |
| D2 | 700 | 26 | pairs (+ pointing) | `{2,2,26, requires:pairs/triples, maxAdvancedSteps:5}` | 500 |
| D3 | 800 | 24 | pairs and triples | `{2,2,24, requires:pairs/triples, minAdvancedSteps:3}` (≈ today's medium) | 600 |
| D4 | 900 | 24 | **one** X-Wing or XY-Wing | `{3,3,24, techniques:level≤2+xWing+xyWing, requires:[xWing,xyWing], maxTopSteps:1}` | 780 |
| M1 | 1000 | 22 | 1–2 level-3 steps | `{3,3,22, maxTopSteps:2}` | 950 |
| M2 | 1150 | 22 | 2–3 level-3 steps | `{3,3,22, minTopSteps:2}` | 1100 |
| M3 | 1300 | 20 | **one** chain/link (level 4) | `{4,4,20, maxTopSteps:1}` | 1350 |
| E1 | 1450 | 17 | chains | `{4,4,17}` | 1500 |
| E2 | 1600 | 17 | finned Swordfish/Jellyfish | `{5,5,17}` (master bank) | 1750 |

New `DifficultyProfile` fields: `minAdvancedSteps`, `minTopSteps` and `maxTopSteps` (steps that
use a technique of the profile's top level). Ranked Novice is then the same shape as Casual Easy,
Apprentice as Casual Medium, and Adept as Casual Hard, which is easy to explain. **To verify
before building:** attempts per stage in the generator, D4 and M3 especially. Exactly one
X-Wing or exactly one chain may need many carves. A deterministic fallback (after N attempts, use
the next stage up) keeps the audit's regeneration exact.

### 3.3 Elo maths

| Value | Live | Proposed |
|---|---|---|
| Start | 100 | 100 |
| Protected (losses cost 0) | below 500 | **below 300 (all of Novice)** |
| K (straight lines) | 600→60, 1600→28, 2400→16, 3200→10, 4800→8 | **100→40, 600→32, 1000→24, 1450→18, 1600→14, 2000→10** |
| Loss multiplier | 500→0.5, 1200→1, 1600→1.25, 2400→1.5, 3200→2 | **300→0.75, 500→1.0, 1450→1.0, 1600→1.25** |
| Opponent | clamp(elo, 150, 3000), /400 | **least(elo, 1600), /200** (above 1600 gains fade, which sets the top) |
| Easy-square discount | `least(rating − target + 100, 0)` | divide by 2, or drop it: since B11 the audit regenerates the dealt square, and singles stages vary in rating by design |
| Speed bonus, hint cut, par | unchanged | unchanged (par goes by the stage's target rating: 10 min at N1 to 15 min from D4) |
| Ranked influence | `3 + least(3, elo/1000)` | **3, 3, 4, 5, 6 by rank** (about what each rank paid before) |

A typical win pays about 23 in Novice, 18 in Apprentice, 15 in Adept, 11 in Archmage and 8 in
Elomental. From 500 up, a loss costs the same base stake.

## 4. Simulation

### 4.1 Model

Players are modelled by technique, not by a hidden Elo. Each persona has a chance of spotting and
using one step of each technique family, plus a scanning failure that grows as the givens get
fewer. A square's win chance is the product over its steps. Each player gets a lognormal skill
multiplier (σ 0.3), so a persona is a spread. Every player plays 2–4 Ranked games a day for 180
days, 10,000 per persona. Live squares invert the grader's rating
(100 + 45·hardest weight + 6·effort) into steps, following `ratedProfile`. Proposed squares follow
§3.2. The pooled figures use a mix of 50% casual, 35% medium, 12% enthusiast and 3% diehard
(an assumption: replace it with real data once it exists).

| Persona | Per-step success: pointing / pairs / X-Wing / chains / finned | Hint on a win |
|---|---|---|
| Casual, singles only | 0.60 / 0.25 / 0.04 / 0.01 / 0.005 | 20% |
| Newspaper medium | 0.96 / 0.85 / 0.30 / 0.08 / 0.03 | 10% |
| Enthusiast, X-Wing and XY-Wing | 0.99 / 0.97 / 0.88 / 0.40 / 0.15 | 5% |
| Diehard, chains | 0.995 / 0.99 / 0.97 / 0.88 / 0.70 | 2% |

### 4.2 Before and after: days to each rank (median / worst 10%; "—" = fewer than that share get there by day 180)

| Persona | Live: Apprentice 600 / Adept 1200 / Elementalist 2000 / Archmage 3000 | Proposed: Apprentice 300 / Adept 600 / Archmage 1000 / Elomental 1450 |
|---|---|---|
| Casual | — / — / — / — (0% leave Novice) | **4/5** / — (16% touch it) / — / — |
| Medium | 8/14 / — (0%) / — / — | 4/4 / **10/13** / — (3%) / — |
| Enthusiast | 6/7 / 22/48 / — / — | 3/4 / 9/10 / **21/26** / — (5%) |
| Diehard | 5/6 / 14/17 / 45/66 / — (23%) | 3/4 / 9/10 / 18/20 / **36/42** |

### 4.3 Where players plateau and how often they win there (last 30 days)

| Persona | Live: Elo p10/50/90, win rate, rank at day 180 | Proposed: Elo p10/50/90, win rate, rank at day 180 | "Halve the numbers only": Elo, win rate |
|---|---|---|---|
| Casual | 490/494/499, **6%**, Novice 100% | 420/466/506, **50%**, Apprentice 100% | 247, 6% (Novice) |
| Medium | 579/682/796, 40%, Apprentice 80% | 773/867/901, 51%, Adept 100% | 341, 40% |
| Enthusiast | 1115/1252/1473, 51%, Adept 65% | 1227/1295/1321, 50%, Archmage 100% | 627, 51% |
| Diehard | 2282/2718/3036, 66%, Elementalist 80% | 1592/1612/1646, 60%, Elomental 100% | 1344, 66% |

Each plateau sits **inside** a rank, 100–150 under the next floor. The one exception is a casual
who learns pointing and settles right on Adept's floor (the grace covers that case). Win rate in
the first 30 days: casual 18% → **60%**, medium 50% → 72%. Days with Elo up in the first 30
days: casual 34% → 62%. Elo-losing games in the first 14 days: medium 13 → 5. Rank-ups in the
first 30 days fall from 2–8 (divisions) to 1–3, plus 1–5 new-technique moments. Demotions in 180
days: medium 17.5 → 0.8.

**Pooled ranks at day 180:** live: Novice 57%, Apprentice 32%, Adept 8%, Elementalist 2.4%,
Archmage 0.5%. Proposed: Apprentice 50%, Adept 35%, Archmage 12%, **Elomental 3.1%**
(at or above 1600: 2.1%).

### 4.4 Variants

- **Protection below 200 (the owner's number):** the same in every figure, except protection ends
  on day 2 instead of day 4. Novice squares are won 95–99% of the time, so the threshold hardly
  matters. I still prefer 300 because it makes a one-sentence rule tied to a name: "No Elo lost in
  Novice."
- **Gentle losses (0.5 × stake at 300, as live):** the casual plateau rises to 501 but the win rate
  there falls to **39%**, and medium falls to 42%. That confirms §2: keep 1.0.
- **Players learn the next technique** (each square containing it closes 0.5% of the gap):
  under the proposal, 53% of casuals are Adept by day 180 (median day 46, worst 10% day 78), 29%
  of mediums reach Archmage, and 56% of enthusiasts reach Elomental. That makes Elomental 9.7% of
  everyone (4.2% at or above 1600). Under live rules, even learners stay Novice (98%). If real
  players learn this well, move Elomental's floor to 1600 (the finned-fish stage); nothing else
  changes.

### 4.5 Economy side effects (not re-run in `scripts/audit-sim.mjs`)

No drop, odds, Stardust or sink rule changes. Ranked wins pay 20 Stardust and count toward parts,
so a casual who plays 3 Ranked games a day goes from 0.2–0.5 wins a day to about 1.6
(+~24 Stardust a day, +1 counted solve inside the 9-a-day cap). That is fairer and inside the existing caps. When this is
built, `audit-sim.mjs` should adopt the stage model (it still uses a logistic Elo skill) so the
standing audit reflects it.

### 4.6 Levers on the win rate where players settle (asked by the UX reviewer: about 3 in 4)

At a plateau, Elo stops moving on average, so the win rate there is the zero-drift point
p·G = (1−p)·L, or **p = L / (G + L)**. G already includes the speed bonus and the hint cut. Three
variants of the proposal, same model and seeds, 10,000 players per persona, 180 days:

- **(a) Comeback square:** after 2 Ranked losses in a row, the next square comes from one stage
  lower, priced as usual, until a win. These squares are 8–19% of games.
- **(b) Bigger losses from 500 up:** b1 is 300→0.75, 500→1.5, 1600→1.75. b2 is 300→0.75, 500→2.0,
  1600→2.25.
- **(c)** (a) and b1 together.

"Worst run" is the most Elo a player lost in one run of losses over 180 days, at p90 across
players. Demotions use the 50-Elo grace.

**Settled Elo (median) · win rate in the last 30 days**

| Persona | Proposal | (a) comeback | (b1) 1.5× | (b2) 2.0× | (c) both |
|---|---|---|---|---|---|
| Casual | 466 · 50% | 490 · 50% | 436 · 57% | 422 · 62% | 451 · 57% |
| Medium | 867 · 51% | 879 · 51% | 796 · 61% | 742 · 67% | 806 · 61% |
| Enthusiast | 1295 · 50% | 1300 · 50% | 1237 · 62% | 1160 · 67% | 1252 · 62% |
| Diehard | 1611 · 60% | 1615 · 61% | 1599 · 65% | 1585 · 69% | 1601 · 65% |

**Average loss · worst run (p90) · demotions in 180 days, in Elo**

| Persona | Proposal | (a) | (b1) | (b2) | (c) |
|---|---|---|---|---|---|
| Casual | 16 · 131 · 0.3 | 17 · 83 · 0.6 | 22 · 139 · 0.1 | 28 · 148 · 0.0 | 23 · 99 · 0.1 |
| Medium | 14 · 121 · 0.0 | 13 · 98 · 0.1 | 22 · 156 · 0.4 | 30 · 183 · 1.9 | 22 · 133 · 0.2 |
| Enthusiast | 10 · 90 · 0.1 | 10 · 70 · 0.1 | 18 · 123 · 0.5 | 24 · 147 · 1.6 | 18 · 107 · 0.4 |
| Diehard | 10 · 64 · 0.0 | 10 · 54 · 0.0 | 14 · 82 · 0.2 | 18 · 103 · 0.6 | 14 · 72 · 0.1 |

**Days to rank (median / worst 10%)**

| Rank (persona) | Proposal | (a) | (b1) | (b2) | (c) |
|---|---|---|---|---|---|
| Apprentice (casual) | 4/5 | 4/5 | 4/5 | 4/5 | 4/5 |
| Adept (medium) | 10/13 | 10/13 | 10/14 | 11/15 | 10/14 |
| Archmage (enthusiast) | 21/26 | 21/26 | 22/31 | 24/37 | 22/30 |
| Elomental (diehard) | 36/42 | 36/42 | 38/50 | 41/61 | 38/50 |

At day 180, (b2) leaves 14% of enthusiasts back in Adept and 10% of diehards back in Archmage.
The other variants leave 0–4% below their rank. Elomental holds 2.7% (b2) to 3.4% (a) of
players.

What this shows:

- **(a) doesn't move the win rate.** It's priced as usual, so p = L/(G+L) still holds. It cuts
  the worst runs by 16–37% and lifts the plateau by 5–25 Elo.
- **Only the loss/win ratio moves the win rate.** 1.5× gives 57–65% and 2.0× gives 62–69%.
  Reaching 75% needs about **3.3×**: one loss would wipe out three wins. Each step costs bigger
  losses, settled Elo 12–135 lower, slower ranks, and, at 2.0×, real demotions.
- **(c) gets b1's win rate with shorter bad runs than b1.** Against the proposal, the casual's
  worst run is shorter (99 vs 131) and the others' are 10–19% longer. Under b1 alone they are
  6–37% longer. The comeback square pays for most of the bigger losses.

**What I'd ship: (c).** It raises the settled win rate to 57–65% while keeping a bad evening
close to what the proposal already allows. Losses grow from about 16 to 22 Elo, but the comeback
square shortens bad runs, demotions stay at 0.1–0.4 per player in 180 days, and the ranks open
only 1–2 days later (Elomental day 38 instead of 36). 2.0× buys
5 more points of win rate for 30% longer bad runs and up to 1.9 demotions per player, which
doesn't fit a calm audience. 3 in 4 isn't reachable with these levers without a loss costing more
than three wins, and I would not ship that. If the UX target stays at 75%, the honest route is a
different pricing: some squares easier than your level that pay and cost little. That would need
its own simulation. If (c) is adopted:
- §3.3: losses become 300→0.75, 500→1.5, 1600→1.75.
- The comeback needs `profiles.ranked_loss_run smallint`. finish_game sets it (0 on a win, +1 on
  a loss). start_game serves `greatest(ranked_stage(elo) − 1, 0)` while it is 2 or more and stores
  that stage, so the audit regenerates the same square.
- Copy, in one sentence: "After two losses in a row, your next square is a step easier."

## 5. Moving existing players

The live player base is days old, so the map is fitted to young accounts. It follows the
simulation's median "same player, new rules" Elo for days 1–14, and it is deliberately
conservative higher up: nobody is placed above where they would settle. The new ladder climbs fast
(diehards win 80–93% of Archmage squares), so anyone placed a little low climbs back within days.

| Live Elo | ≤100 | 300 | 500 | 600 | 800 | 1000 | 1200 | 1600 | 2000 | 2400 | 3000 | 4800 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| New Elo | same | 280 | 460 | 534 | 682 | 830 | 930 | 1130 | 1330 | 1442 | 1610 | 1700 |
| Sim median (young / all days) | 145 | 289 | 476/472 | 546/750 | 669/882 | 819/883 | 858/1246 | —/1332 | —/1585 | —/1612 | —/1629 | |

The map is straight lines through (100,100), (500,460), (1000,830), (2000,1330), (3000,1610) and
(4800,1700). **No one lands lower on the ladder than before:** the old Apprentice floor 600 maps
to 534 (Apprentice), Adept 1200 to 930 (Adept), Elementalist 2000 to 1330 (Archmage, still 4th of
5), and Archmage 3000 to 1610 (Elomental, still the top).

- **Leaderboard (Everyone, element, country):** order is unchanged, because the map is strictly
  increasing. Ties are possible only from rounding at the top. `tier_floors()` becomes
  `{0,300,600,1000,1450}`, and `refresh_lb()` recounts the tiers.
- **Season board** (Elo gained since the season began, which is the first season game's
  `elo_before`): rescale `games.elo_before` and `games.elo_after` with the same map so the gains
  stay consistent. Gains shrink by about half and the top shrinks more, so the season order can
  shift a little. With a tiny player base, do it now rather than wait for Season 1. Elo is not
  being reset, only re-expressed: tell players "Elo has a new scale: same order, new numbers."
- Check the live spread before applying (read only):
  `select width_bucket(elo, 0, 3200, 16) b, min(elo), max(elo), count(*) from public.profiles where ranked_games > 0 group by b order by b;`

## 6. Where I'd push back on the owner's idea

1. **Halving the range is not the fix.** Elo here is a points counter (an even match every game),
   so 3000 wasn't absurd in itself. The real problem was that squares followed the number. Halving
   with squares still tied to Elo leaves casuals stuck at 6% wins (§4.3, last column). Decoupling
   Elo from square difficulty is the change.
2. **"Top players about 1600" needs a brake.** With stages capped at E2, a player who beats E2
   squares would otherwise climb forever. Pricing the opponent at 1600 (divisor 200) holds the
   best at 1590–1650 (1700 with learning).
3. **Protection to 200** works, but it ends after 4–5 wins and has no name. Protecting all of
   Novice (below 300) is one sentence and simulates the same.
4. **"Elomental" as a rank is also the app's name.** Use it only as a rank name ("Promoted:
   Elomental", "Elomental rank"), never as a person noun, so share texts read "I reached Elomental
   on Elomental" without confusion. Acceptable, but a ux-reviewer call.
5. **The name plate "Elomentalist" now collides with the top rank.** It is a 12,000-Stardust look
   that reads like the top rank, so it looks as if top status can be bought. That breaks
   "looks only, never an edge" in perception, even though no gameplay changes. Rename the plate,
   for example **Starforged** (it never shipped, `PROGRESSION_DESIGN` §2) or **Radiant**, before
   the rank ships. It affects `copy/en.ts` (`plates`, the odds line, `top_plate`), `plates.ts`,
   `plates.css`, `forge.ts`/`account.ts` comments, BRAND_VOICE and the Revision line.
6. **Dropping divisions loses frequent small steps.** Replace them (§3.1) or the middle of the
   ladder goes quiet: Archmage is 450 wide, about 40 net wins at 2.5% a win.
7. **The ~1–2% Elomental target depends on the population, not the formula.** Elomental means
   "solves chain squares". With 3% chain solvers it holds 3.1% of players. If real data shows more
   learners, move its floor to 1600 rather than retuning K. A numbered "Elomental #N" (top 100 by
   Elo) is the place for extra exclusivity later.

## 7. Exact values and files to change (not edited)

- `packages/web/src/profile.ts`: `PROTECTED_BELOW = 300`; `K_CURVE`, `LOSS_CURVE` as §3.3;
  `rankedOpponent = min(elo, 1600)` and the expected-score divisor 200 in `eloDelta`; `TIERS`
  becomes floors `[0,300,600,1000,1450]` with no divisions; `rankTier` returns `{tier, name,
  label}` (`division` removed); `nextRank` returns the tier gap and the bar fraction; `promoted`
  compares tiers only; `rankedTarget` becomes `rankedStage` plus the stage's target rating; the
  easy-square discount `/2` in `recordResult`; the grace for guests is computed locally.
- `packages/engine/src/generator.ts` (and `supabase/functions/_shared/engine/` copy):
  `RANKED_STAGES` (§3.2), new fields `minAdvancedSteps`/`minTopSteps`/`maxTopSteps` checked in the
  generation loop, `GenerateOptions.rankedStage`; keep `targetRating` for open old games.
- `supabase/functions/audit-solve/index.ts`: regenerate with `rankedStage: game.ranked_stage`
  when set, otherwise `targetRating` as now.
- `packages/web/src/copy/en.ts`: `ranks: ['Novice','Apprentice','Adept','Archmage','Elomental']`;
  drop `rankDivision`; "No Elo lost below 500." becomes "No Elo lost in Novice." (lines 127 and
  462); new-technique lines; the plate rename. Then run BRAND_VOICE's pre-ship checklist.
- `packages/web/src/icons.ts` emblems (Elementalist's quartered emblem plus Archmage's crown
  become the Elomental emblem; ui-designer), `styles/home.css` rank colours comment, the progress
  bar (ui-designer, ux-reviewer, a11y: the bar needs a text equivalent).
- `packages/web/e2e/fixtures.ts` `lb_tiers` floors; `supabase/tests/ranked.mjs` expected targets.
- Docs after approval: the Revision section of `PROGRESSION_DESIGN.md` (Ranked bullet, protection,
  the "Elementalist day 39" line), the BRAND_VOICE glossary (ranks row: no divisions; Promoted:
  Archmage), `LEADERBOARD_DESIGN.md` tiers.

## 8. Draft migration (do not apply; owner approval needed)

```sql
-- ranked_ladder (docs/review/elo-ladder-2026-10-21-economy.md): names only, a 100 → ~1650 scale,
-- squares by stage. Data: every profile's Elo and every Ranked game's elo_before/elo_after are
-- re-expressed through private.ladder_v2 (strictly increasing: the order is kept).
-- Undo: needs the inverse map plus restoring the functions from ranked_length / gentler_losses.

alter table public.games add column ranked_stage smallint;
alter table public.profiles add column rank_tier smallint not null default 0;

create or replace function private.ranked_stage(elo integer) returns smallint
language sql immutable set search_path = '' as $$
  select (case when elo < 200 then 0 when elo < 300 then 1 when elo < 400 then 2 when elo < 500 then 3
    when elo < 600 then 4 when elo < 700 then 5 when elo < 800 then 6 when elo < 900 then 7
    when elo < 1000 then 8 when elo < 1150 then 9 when elo < 1300 then 10 when elo < 1450 then 11
    when elo < 1600 then 12 else 13 end)::smallint;
$$;

-- the engine rating a stage aims at: par, clamp_rating and the Easy/Medium/Hard label go by it
create or replace function private.stage_rating(stage smallint) returns integer
language sql immutable set search_path = '' as $$
  select (array[150, 160, 175, 310, 360, 420, 500, 600, 780, 950, 1100, 1350, 1500, 1750])[stage + 1];
$$;

create or replace function private.ranked_target(elo integer) returns integer
language sql immutable set search_path = '' as $$
  select private.stage_rating(private.ranked_stage(elo));
$$;

create or replace function private.ranked_opponent(elo integer) returns integer
language sql immutable set search_path = '' as $$ select least(elo, 1600); $$;

create or replace function private.elo_k(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 100 then 40
    when elo <= 600 then 40 - 8 * (elo - 100) / 500.0
    when elo <= 1000 then 32 - 8 * (elo - 600) / 400.0
    when elo <= 1450 then 24 - 6 * (elo - 1000) / 450.0
    when elo <= 1600 then 18 - 4 * (elo - 1450) / 150.0
    when elo <= 2000 then 14 - 4 * (elo - 1600) / 400.0
    else 10
  end;
$$;

create or replace function private.elo_loss_multiplier(elo integer) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when elo <= 300 then 0.75
    when elo <= 500 then 0.75 + 0.25 * (elo - 300) / 200.0
    when elo <= 1450 then 1
    when elo <= 1600 then 1 + 0.25 * (elo - 1450) / 150.0
    else 1.25
  end;
$$;

create or replace function private.elo_delta(player integer, puzzle integer, won boolean, games_played integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  expected double precision := 1 / (1 + power(10, (puzzle - player) / 200.0));
  k numeric := private.elo_k(player);
begin
  if won then return round(k * (1 - expected)); end if;
  if player < 300 then return 0; end if;  -- No Elo lost in Novice
  return -round(k * expected * private.elo_loss_multiplier(player));
end;
$$;

create or replace function private.tier_floors() returns integer[]
language sql immutable set search_path = '' as $$ select array[0, 300, 600, 1000, 1450] $$;

-- the rank shown: up as soon as Elo reaches a floor, down only 50 under it
create or replace function private.shown_tier(prev smallint, elo integer) returns smallint
language sql immutable set search_path = '' as $$
  with f as (select private.tier_floors() a),
       t as (select (select count(*) from unnest(a) x where elo >= x)::smallint - 1 as now, a from f)
  select case when now >= prev then now
              when elo >= a[prev + 1] - 50 then prev
              else now end from t;
$$;

-- In private.ranked_elo: halve the easy-square discount (engine points → ladder points)
--   private.ranked_opponent(elo) + least(g.rating - target + 100, 0) / 2
-- and after elo_after: update public.profiles set rank_tier = private.shown_tier(rank_tier, elo_after) where id = uid;
-- In private.count_solve, Ranked influence by rank:
--   when 'ranked' then 3 + case when g.elo_before >= 1450 then 3 when g.elo_before >= 1000 then 2
--                               when g.elo_before >= 600 then 1 else 0 end
-- In public.start_game (recreated from ranked_integrity), the Ranked branch:
--   select private.ranked_stage(elo) into stage from public.profiles where id = uid;
--   target := private.stage_rating(stage);
--   insert ... (user_id, mode, difficulty, seed, rating, target_rating, ranked_stage) values (..., target, target, stage)
--   return json_build_object(..., 'target_rating', target, 'stage', stage, ...);

-- one-time re-expression onto the new scale
create function private.ladder_v2(old integer) returns integer
language sql immutable set search_path = '' as $$
  select case
    when old is null then null
    when old <= 100 then old
    when old <= 500 then round(100 + 0.9 * (old - 100))
    when old <= 1000 then round(460 + 0.74 * (old - 500))
    when old <= 2000 then round(830 + 0.5 * (old - 1000))
    when old <= 3000 then round(1330 + 0.28 * (old - 2000))
    else least(round(1610 + 0.05 * (old - 3000)), 1700)
  end::integer;
$$;

update public.games set elo_before = private.ladder_v2(elo_before), elo_after = private.ladder_v2(elo_after)
  where mode = 'ranked' and elo_before is not null;
update public.profiles set elo = private.ladder_v2(elo);
update public.profiles set rank_tier = private.shown_tier(0::smallint, elo);
drop function private.ladder_v2(integer);
select private.refresh_lb();

revoke execute on all functions in schema private from public, anon, authenticated;
```

Open Ranked games at migration time have `ranked_stage` null and finish on their stored target.
Their Elo change is priced on the new curve against the re-expressed Elo. Reviewers before
shipping: backend-security-reviewer (the audit regenerating by stage, `start_game`), ux-reviewer
(progress bar, new-technique moments, the Elomental name), ui-designer (emblem, bar), qa-tester
(`npm run test:db`, ranked tests, e2e tier fixture).
