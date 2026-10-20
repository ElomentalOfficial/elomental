# Elomental: progression, rewards and profile

Design spec for seasons, ranked tiers, drops, crafting, avatars, the profile page and
leaderboards. Status: **proposal, not built**. Numbers come from a season simulation
(see §2.6); the code in §10 and §11 is the shape of the real migrations, not yet applied.

## Revision, 2026-10-20 (live): simpler for sudoku players

Sudoku and casual-puzzle players skew 35+, play short daily sessions as "me time", and are
driven most by completion and personal stats; managing materials or recipes is friction.
So the system was simplified (migration `simple_economy`), and this replaces the
material-based design in §2, §3.2–3.3, §4.2–4.3, §9–11 below:

- **Rarities: Common, Rare, Epic, Mythic**, the names players know from other games, each on
  its own colour tag (tokens `--r-*`), with Bright text at 4.5:1 or better.
- **No materials, refining or swapping.** Two currencies only: Stardust and Rusted Crowns.
- **A whole part every 3rd rated solve** (first 30 solves a day). Rarity 62/28/8/2%; Epic or
  better within 10 parts, Mythic within 25. A part you own already → Stardust (20/50/120/300).
- **Forge any missing part with Stardust**: 100 / 250 / 600 / 1200 + a Rusted Crown.
- **Seasons: two a year** (Jan–Jun, Jul–Dec); Season 0 runs to 1 July 2027. Only the season
  board resets; Elo never does. **Monthly: only the affinity result.**
- **Season sets: 48 parts** (16/16/10/6). Simulated: 1 solve a day collects ~42/48; 3 a day
  finish around month 3; 12 a day in about 3 weeks.
- **Element colours** (tokens `--el-*`): Fire and Earth are the Lava and Forest tiles; Water
  sea teal; Air lit-cloud gold. Parts are named Ember, Tide, Stone and Gale.
- **After the audit (docs/AUDIT.md, migration `stardust_sinks`):** parts count on the first
  **9** solves a day (3 parts). Stardust sinks, all a look or a convenience, never power:
  **polish** an owned part I–V (200/400/800/1600/3200), **name plates** Bronze, Silver,
  Gold, Elomentalist (1000/2500/6000/12000, in order), and **fill in** a missed Daily this month
  (300, up to 3 a month; counts toward the month's total). Home's avatar now opens the
  **Profile** (avatar, name on its plate, rank, best Elo, stats, "Season 0: n of 48 parts")
  with one way on: the Forge. The result shows one reward strip and no coaching tips.

- **Whole avatars (migration `whole_avatars`, 2026-10-20):** the layered avatar is gone.
  Two slots: the **Avatar** (one whole picture) and its **Frame**. Backdrop, Sigil and Aura
  parts were paid back at their forge price; the Crest is no longer a part. Season 0's set
  is 11 avatars (5 Common, 3 Rare, 2 Epic, 1 Mythic; placeholder faces) and the 12 frames,
  23 parts. **Happy** is every player's avatar from the start. **Polish** now brings an
  avatar to life once (still → animated) for 6000 Stardust and a **Spirit**. The Rusted
  Crown became the Spirit (Crowns held carried over): 0.15% on each solve that counts
  toward parts, guaranteed within 700 (about one every 7–8 weeks for a regular player).
  Mythic forging needs Stardust only. Affinity switching (first 7 days of a season, once)
  is reached from the Profile's Change button.

- **Name:** players see the first season as **Season Alpha** (2026-10-20); `Season 0` and the `s0-` ids stay internal.

Decisions already made with the owner (2026-10-20):

- Ranked stays **solo against a rated puzzle**. Live 1v1 races are a later phase.
- **No real money** for now. Everything is earned; the design stays store-ready (§8.3).
- Theme: **the forge and the four elements**. You *forge* things; the elements
  (Fire, Water, Earth, Air) are the schools every part belongs to.
- **Affinities** (§13): every player joins one element; every solve adds to its
  monthly tug of war (added 2026-10-20).
- Built on what exists: Elo (puzzle-as-opponent, protected below 500, up to 4800),
  Stardust, the Rusted Crown, the five rank names, Daily Square, Clash, server-side
  `finish_game` and the solve audit.

New player-facing terms (Ember, Scrap, Forged, Tempered, Runed, Starforged, Sigil,
Season Path…) go into the glossary in `docs/BRAND_VOICE.md` when they ship.

---

## 0. Vision and core loop

Elomental should feel like a ranked game that happens to be sudoku: every square
you solve pays out, every payout builds toward something only you own, and the
thing you own tells everyone how far you've climbed.

```
   PLAY ──► DROP ──► FORGE ──► FLEX ──► CLIMB
   solve     a material     craft avatar     profile,         harder squares,
   a square  (or a part)    parts            leaderboard,     tiers, seasons
     ▲                                       titles              │
     └───────────────────────────────────────────────────────────┘
```

- **Play**: any mode, any length. A solved square always pays (Stardust plus a drop).
- **Drop**: one roll per solve, decided on the server, with a pity cap so bad luck is bounded.
- **Forge**: drops and Stardust become avatar parts. Choices matter: which element, which part.
- **Flex**: the avatar, rank emblem, peak and titles show on the profile and every leaderboard row.
- **Climb**: Elo serves harder squares, harder squares drop better, seasons reward the peak.
- **Together**: every solve also pulls for your affinity in the monthly war (§13).

What we deliberately avoid (the "not exploited" rules):

1. No paid randomness, no timers that punish you for not logging in, no energy system.
2. Pity caps every chase: the worst luck is bounded and visible.
3. A full season set is reachable by a dedicated free player (median day 44 of 56).
4. Diminishing returns stop farming, not playing: the first 25 solves a day pay in full.
5. Losing never takes items away. Elo protection below 500 stays.

---

## 1. Modes and competitive structure

### 1.1 Modes and what each feeds

| Mode | Format | Elo | Drop element bias | Drop luck (§2.2) | Stardust (as today) |
| --- | --- | --- | --- | --- | --- |
| **Ranked** | Solo vs a square rated near your Elo | Yes | Fire | +0.08 base | 20 |
| **Casual** | Easy / Medium / Hard, no pressure | No | Air | 0 / +0.05 / +0.08 | 4 / 8 / 15 |
| **Daily Square** | One shared square a day | No | Earth | +0.12 | 12 |
| **Clash** | Async race on the same square vs a friend | No | Water | +0.08 win, +0.04 loss | as Casual by difficulty, +5 for the win |
| **Weekend Trials** *(phase 3)* | 3 fixed squares, Fri–Sun, best total time | No | Event element | +0.10 | 15 each |
| **Gauntlet** *(later)* | Async bracket, everyone plays the same squares | No | Event | Event | Event |
| **Live races** *(later)* | Real-time 1v1 on one square | Separate Elo | Fire | +0.10 | 20 |

The mode→element bias (50% the mode's element, 50% spread over the other three)
gives a reason to visit every mode without forcing it: you can always swap elements
at a cost (§3.3). The pairings match the existing Home icons: the flaming sword is
Ranked, the feather is Casual.

### 1.2 Ranked tiers and divisions

Elo already runs to 4800, but today's titles stop at Archmage from 1200, so most
serious players would sit in one tier forever. The tiers keep the five glossary
names and spread across the real range, with three divisions each:

| Tier | Division III | II | I | Emblem idea |
| --- | --- | --- | --- | --- |
| Novice | 0 | 200 | 400 | Chalk outline square |
| Apprentice | 600 | 800 | 1000 | Rock square, one rune |
| Adept | 1200 | 1450 | 1700 | Forest square, bound in iron |
| Elementalist | 2000 | 2350 | 2700 | Crimson, four element marks |
| Archmage | 3000+ | (no divisions: shows Elo) | | Lava, crowned; top 100 show **Archmage #N** |

- **Change to flag:** `rankTitle()` thresholds move (Archmage from 3000, not 1200).
  Existing players above 1200 would see Adept or Elementalist. Their Elo is unchanged.
- The **numbered Archmage** (#1 to #100 by Elo, among players active in the last 14
  days) is the apex flex, like a top-tier ladder number. It needs no new term.
- Promotions get a moment on the result screen ("Adept II"); demotions are quiet.

### 1.3 Seasons

- **Length: 8 weeks.** Each season spotlights one element (Season 1: Embers) whose
  parts make up the season set and whose drops get +10% bias.
- **No Elo reset, by design.** Elo picks the rating of the next Ranked square
  (`ranked_target`), so a reset would serve players squares far below their level for
  weeks. Elo is the honest skill number; the *season* is about what you do with it.
- **Season placement:** your season tier is revealed after your first **3 Ranked
  wins** of the season (until then: "Placing, 1 of 3"). Gives a reason to play in week 1.
- **Season reward = peak tier you proved**: the highest tier at which you won
  **10 Ranked games** this season (proof wins), so one lucky streak doesn't count,
  borrowed from season-reward levels that require wins at rank.

### 1.4 Decay

No Elo decay (it measures skill against puzzles, not activity). Instead:

- After **14 days without Ranked**, you drop off the numbered Archmage list and the
  season board until you play 3 Ranked games. Your Elo and emblem stay.
- The numbered Archmage list needs **10 Ranked games in the last 14 days**.

### 1.5 Seasonal rewards

Given at season end for the peak *proven* tier (§1.3); everything below it too.

| Proven tier | Stardust | Rusted Crowns | Cosmetic (vaulted after the season) |
| --- | --- | --- | --- |
| Novice | 200 | 0 | Season badge (bronze) |
| Apprentice | 500 | 1 | Season badge (iron) + Apprentice frame |
| Adept | 900 | 2 | + Adept frame + title "Season 1 Adept" |
| Elementalist | 1500 | 3 | + Elementalist frame + animated crest |
| Archmage | 2500 | 5 | + Archmage frame + title "Season 1 Archmage" |
| Archmage #1–#100 at season end | +1000 | +2 | Numbered title "S1 Archmage #37" + gilded frame |

Frames and titles carry the season number, so a Season 1 frame can never be earned again.

---

## 2. Drops after every solved square

### 2.1 Rarity tiers

| Tier | Base odds | Colour (palette token) | Not by colour alone | Reveal |
| --- | --- | --- | --- | --- |
| **Scrap** | 62% | Rock `#B3B5A0` | 1 pip, rough chip shape | Instant, a soft clink |
| **Forged** | 25% | Forest `#636945` | 2 pips, ingot | Brief warm glow |
| **Tempered** | 9.5% | Crimson `#794341` | 3 pips, quenched bar | Steam puff, 0.6s hold |
| **Runed** | 3% | Lava `#A85B37` | 4 pips, glowing runes | Runes light one by one, haptic |
| **Starforged** | 0.5% | Bright `#FFFFE5` + shimmer | 5 pips, star-cut gem | Full-screen flare, the card burns in |

Rarity is always shown as a word plus pips, never by colour only (WCAG, `ACCESSIBILITY_AUDIT.md`).

**What drops.** Mostly **components**: element materials at a rarity, named for the
element: **Ember** (Fire), **Tideglass** (Water), **Ore** (Earth), **Plume** (Air).
So a drop reads "Tempered Ember". A quarter of Tempered-or-better drops arrive as a
finished **part** instead (a relic: the "whole thing at once" moment).

The **Rusted Crown** stays exactly as today: its own 3% roll on every rated solve,
with pity at 40. It becomes the catalyst for Runed and Starforged recipes, so the
existing Crowns finally have a use.

### 2.2 Luck modifiers (upgrade chance)

After the base roll, one more roll may **upgrade the result one tier**. The upgrade
chance `u` comes from how you played:

| Source | u |
| --- | --- |
| Ranked | +0.08; +0.04 more if the square was rated ≥ your Elo + 100 |
| Daily Square | +0.12 |
| Casual Medium / Hard | +0.05 / +0.08 (Easy: 0) |
| Clash | +0.08 win, +0.04 loss (both solved) |
| Clean solve (no mistakes, no hints) | +0.04 |
| Speed bonus earned (Ranked) | +0.02 |
| Win run: consecutive solves in the same mode | +0.01 each, up to +0.05 |
| Each hint | −0.03 |
| Each mistake | −0.01 |

`u` is clamped to 0–0.30, and at most one upgrade happens per drop. A clean Ranked
solve on a hard square is about 0.20; a Casual Medium with a hint is about 0.02.

Losses (out of mistakes, conceded) give no drop and no Stardust, as today. Elo
protection softens Ranked losses; items are never taken away.

### 2.3 Pity

Three counters, each guaranteeing that tier **or better**, checked highest first:

| Guarantee | Within | Without pity you'd go this long about 1 time in… |
| --- | --- | --- |
| Tempered or better | 10 drops | 5 |
| Runed or better | 40 drops | 6 |
| Starforged | 160 drops | 3.5 |

Counters reset when that tier or better drops. The player can see them
("Runed or better within 12"), which makes pity a goal, not a secret.

### 2.4 Duplicates

Components stack, so they never duplicate. Duplicates only happen with relic parts:

- **Duplicate protection:** a relic picks a part you don't own yet 75% of the time
  (higher the fewer you own).
- **A duplicate smelts automatically** into Stardust (Tempered 120, Runed 400,
  Starforged 1200) plus one component of the same rarity and element. The reveal shows
  "Already yours: smelted into 400 Stardust and a Runed Ember", so it never feels wasted.

### 2.5 Anti-farming pace

| Solves today (server day, 3 AM reset) | Drop |
| --- | --- |
| 1–25 | Every solve |
| 26–50 | 1 in 3 solves |
| 51+ | None (Stardust continues) |

- **Casual Easy** drops are capped at Forged and don't advance pity (no farming pity on easy squares).
- **Clash** drops only count against an opponent account at least 7 days old with
  10 or more solved games, and only for the first 5 Clashes per opponent pair per week.
- Pity advances only on full-value drops.

Diminishing returns are per day, not per week, so someone who plays an hour a day
is never punished, and a binge just stops paying extra.

### 2.6 The math (simulated, 400 seasons per profile)

Per 100 drops, including pity and typical luck (u ≈ 0.06–0.14):

| | Scrap | Forged | Tempered | Runed | Starforged |
| --- | --- | --- | --- | --- | --- |
| Raw table at u = 0.10, no pity | 55.8 | 28.7 | 11.05 | 3.65 | 0.80 |
| Casual player (with pity) | 53.5 | 27.7 | 13.6 | 4.4 | 1.0 |
| Hardcore player (with pity) | 51.5 | 28.7 | 14.1 | 4.5 | 1.2 |

Time to complete a season set (48 parts, §4.3) over an 8-week season:

| Player | Games a day | Mix | Result |
| --- | --- | --- | --- |
| Casual | 5 (Daily, 2 Ranked, 2 Casual) | ~68 Stardust/day | **~48% of the set**: about 10 Forged, 9 Tempered, 3 Runed, often 1 Starforged part |
| Hardcore | 25 (Daily, 16 Ranked, 5 Casual Hard, 3 Clash) | ~450 Stardust/day | **Full set, median day 44**; 84% finish within the season |

Casual players are short on Stardust rather than materials, so they choose what to
forge; hardcore players are short on Runed and Starforged materials, so the chase
lasts into week 7. The script lives in the scratchpad and should move to
`scripts/econ-sim.mjs` with the build, so retuning stays measured.

---

## 3. Stardust: the universal resource

### 3.1 Earn rates

| Source | Stardust |
| --- | --- |
| Casual Easy / Medium / Hard | 4 / 8 / 15 |
| Daily Square | 12 |
| Ranked | 20 |
| Clash | as Casual by difficulty, +5 for the win |
| Each mistake / hint | −2 / −1 (minimum 1), as today |
| Duplicate relic smelted | 120 / 400 / 1200 by rarity |
| Season reward | 200–3500 (§1.5) |
| Season Path *(phase 2)* | about 2000 across the season |

### 3.2 Sinks

| Sink | Cost | Why it exists |
| --- | --- | --- |
| Forging parts | 80 / 300 / 900 / 2400 by rarity | The main sink, about 80% of all Stardust |
| Element swap: 3 components → 1 of another element (same tier) | +20 / 40 / 80 / 160 / 320 Stardust by tier | Lets you chase the element you want; burns materials |
| Refine: 5 components → 1 of the next tier (same element) | +50 / 150 / 500 / 1500 | Turns surplus Scrap into progress |
| Ascension of Starforged parts *(phase 3)* | 3000+ per stage | Endgame sink for grinders |
| Mend a missed Daily *(phase 2)* | 300, max 3 a month | Already planned "token to recover missed days" |

### 3.3 How Stardust and drops interact

Drops decide **what** you can make, Stardust decides **how much**. Neither alone
forges anything: a lucky drop with no Stardust waits, and Stardust with no drops
can only refine. That keeps both the "one more square" pull (another drop) and the
long goal (save up for the Starforged forge) alive.

---

## 4. Avatars

### 4.1 Structure: five layers

```
 ┌──────────────────┐   1 Backdrop   the field: shape and colour (round, shield, hex…)
 │  ╭────────────╮  │   2 Sigil      the centrepiece: a brush-drawn emblem or creature
 │  │   ✶ SIGIL  │  │   3 Frame      the ring around it (the same frame generator as the tiles)
 │  │  backdrop  │  │   4 Crest      a small element mark on the frame
 │  ╰────────────╯  │   5 Aura       Runed and Starforged only: animated glow, embers, wind
 └──────────────────┘
```

Every part has an element and a rarity. A full avatar mixes elements freely.
Your affinity's crest is free from the moment you choose it (§13.2); other crests are forged.
The art pipeline already exists: brush icons (`icons/build_*.py`), the Art Deco
frame generator, and CSS animation for auras. Sigils are the expensive art, so
each season has few of them.

### 4.2 Recipes

All components are of the part's own element.

| Part rarity | Components | Stardust | Rusted Crowns |
| --- | --- | --- | --- |
| Forged | 10 Scrap + 4 Forged | 80 | – |
| Tempered | 9 Forged + 4 Tempered | 300 | – |
| Runed | 7 Tempered + 4 Runed | 900 | 1 |
| Starforged | 4 Runed + 2 Starforged | 2400 | 2 |

### 4.3 A season set (48 parts, 12 per element)

| Slot | Forged | Tempered | Runed | Starforged | Total |
| --- | --- | --- | --- | --- | --- |
| Backdrop | 8 | 4 | – | – | 12 |
| Sigil | 6 | 6 | 3 | 1 | 16 |
| Frame | 6 | 4 | 2 | – | 12 |
| Aura | – | 2 | 3 | 3 | 8 |
| **Total** | **20** | **16** | **8** | **4** | **48** |

Season 0 (the MVP) ships half of this: 24 parts.

### 4.4 What makes an avatar unique

| Source | Example | Craftable? |
| --- | --- | --- |
| Season set | "Ember Wyrm" Sigil, Season 1 | Yes, **only during its season**; then vaulted forever |
| Rank-locked | Season 1 Archmage frame | No: season reward |
| Achievement-locked | "100 clean Ranked solves" Sigil, "Full month of Daily" (the existing monthly avatar) | No: earned once |
| Event | Weekend Trial frame | No: event only |
| First editions | The first 100 forges of each Starforged part are numbered: "No. 37" | Shown on the part forever |

Vaulted parts never return in the same form. That promise is what makes an old
season frame a real flex, so it must hold.

### 4.5 Long-term paths *(phase 3)*

- **Patina** (play, not pay): a part counts solves while equipped; at 50 / 250 / 1000
  it gains Patina I / II / III, a visible finish (polish, gilding, glow). It rewards
  loyalty to a look and can't be bought.
- **Ascension**: Starforged parts take 3 stages (Stardust + Runed components) that
  unlock an alternate aura animation. The endgame sink for grinders.

---

## 5. Profile page

### 5.1 What goes on it, and what doesn't

**On it** (each answers "how good / how dedicated is this player?" at a glance):

| Item | Why |
| --- | --- |
| Avatar, large, with aura | The forged identity, the reason to craft |
| Affinity crest + war wins | Which side you fight for (§13.6) |
| Name + equipped title | Chosen flex ("S1 Archmage #37", "Clean Hands") |
| Rank emblem, tier and division, current Elo | Now |
| Peak Elo (all-time) + peak tier this season | Proof of the best day |
| 3 showcase slots (player's choice) | A badge, a part (with edition number) or a stat. Curation beats clutter |
| Season history strip | Peak tier per season, one emblem each: the long-grind story |
| 4 stats | Squares solved, Ranked win rate, fastest Ranked clean solve, best win run |
| Collection | One number per season set ("Season 1: 31 / 48") |

**Not on it:** full match history (noise, and losses on display put people off
playing), Stardust and component balances (private economy), every badge at once (that's the
showcase's job), and per-mode win counts (the 4 stats are enough). The rest sits
behind a "More stats" sheet for the player themself.

### 5.2 Wireframe (phone, 375 wide)

```
┌───────────────────────────────────┐
│ ‹  Profile                        │   subPage header (fixed Back)
├───────────────────────────────────┤
│        ╭─────────────╮            │
│        │   AVATAR    │  aura      │   112px, tap = zoom view
│        ╰─────────────╯            │
│           DARIA                   │   name
│      S1 Archmage #37              │   title (serif, muted)
│  ┌──────┐  ADEPT II   1530 Elo    │   emblem + tier + Elo
│  │emblem│  Peak 1612 · Season: I  │
│  └──────┘                         │
├───────────────────────────────────┤
│ SHOWCASE                          │
│ ┌────────┐ ┌────────┐ ┌────────┐  │   3 slots, player's choice
│ │ part   │ │ badge  │ │ stat   │  │
│ │ No. 37 │ │ 100    │ │ 2:41   │  │
│ └────────┘ └────────┘ └────────┘  │
├───────────────────────────────────┤
│ SEASONS  ◇ ◇ ◆ ◆ ◈                │   one emblem per season, peak tier
├───────────────────────────────────┤
│  412 solved   58% Ranked wins     │   2×2 stats
│  2:41 fastest  14 best run        │
├───────────────────────────────────┤
│ COLLECTION  Season 1  31 / 48  ▸  │   opens the Forge
└───────────────────────────────────┘
```

On wide screens the page follows the existing two-column pattern (avatar card left,
the rest right). Everything uses the type and spacing tokens and works at 200% text.

---

## 6. Leaderboards

### 6.1 Types

| Board | Ranked by | Resets | Phase |
| --- | --- | --- | --- |
| **Affinities** | Monthly war standing (§13.4) | Monthly | 2 |
| **Global** | Elo (active in 14 days) | Never | 2 |
| **Season** | Peak proven tier, then Elo | Each season | 2 |
| **Daily Square** | Fastest clean solve of today's square (audited) | Daily | 2 |
| **Friends** | Elo among Clash partners | Never | 3 (no friends list yet; Clash partners serve) |
| **Weekend Trials** | Total time over the 3 squares | Each event | 3 |
| **Regional** | Elo within an opt-in region | Never | Later (needs a region field and consent) |

The Daily Square board is the fairest: everyone solves the same square.

### 6.2 What a row shows

`#  ·  avatar (static, no aura)  ·  name  ·  title (small)  ·  tier emblem  ·  value`

- The top 3 rows also show the player's frame.
- No badges in rows: one identity line per player, never a clutter strip.
- Your own row is pinned at the bottom when you're off-screen.

### 6.3 Rewards tied to boards

| Board | Reward |
| --- | --- |
| Season, Archmage #1–#100 | Numbered title + gilded frame (§1.5) |
| Daily Square, weekly | Top 50 by best 5 days: weekly badge (cosmetic only: no Stardust, so bots gain nothing) |
| Weekend Trials | Top 10%: event frame; everyone who finishes: event badge |

Speed boards pay cosmetics only, because fast times are what a solver bot fakes best.

---

## 7. Integrity and anti-cheat

Already in place: server-authoritative games, no solutions sent in reward modes,
per-game audit replay (`audit-solve`), unrated results on failed audits,
`private.review_flags`, Ranked bans, Turnstile on new guests.

To add:

| Threat | Defence |
| --- | --- |
| Solver bots | Keep the strict audit; add a **human floor**: a win faster than the square's floor time (from its rating; e.g. no rated 2000+ square under 2:30) is unrated and flagged |
| Robotic input | Move-timing check in the audit: near-constant gaps between placements, or no notes on a hard square, raises a flag (flags, not auto-bans) |
| Spoofed rewards | **Every roll happens in SQL** inside `finish_game`; the client only displays the result. Rolls use `gen_random_bytes`, not a seedable client RNG |
| Replays and double claims | One drop per game: `drops.game_id` is unique; `finish_game` locks the game row |
| Farming with alt accounts | Clash limits (§2.5); anonymous guests need Turnstile; drops start counting after an account's first 3 solved games |
| Rapid-fire games | Rate limit `start_game`: 6 a minute, 120 an hour per account |
| Stealthy economy abuse | Append-only `ledger` of every Stardust, Crown and component change, so any balance can be rebuilt and audited |
| Leaderboard cheating | Speed boards only list audited, unflagged solves; a flag hides the entry until review |

Unrated games still pay Stardust 1 (as today) but **no drop**, so failing the audit
is never worth it.

---

## 8. Economy health and compliance

### 8.1 Inflation control

There is no trading, so inflation can't spread between players; the risk is
long-time players drowning in Stardust and losing the reason to play. Controls:

- Recipe costs scale steeply with rarity, and **refine/swap burn materials**.
- **Vaulting** retires each season's craftable set, so savings carry into a new chase,
  not into an already complete collection.
- Ascension (phase 3) is an open-ended sink for the top 1%.
- Watch these numbers weekly: median Stardust balance by player age, % of Stardust
  spent within 14 days of earning, and completion % at season end (target: casual
  40–55%, hardcore finishing in weeks 6–7).

### 8.2 Live-ops plan

| Cadence | Content |
| --- | --- |
| Every 8 weeks | New season: element spotlight, a 24–48 part set, season rewards, Season Path |
| Every 2 weeks *(phase 3)* | Weekend Trial with an event frame and badge |
| Monthly | Daily Square month-complete Sigil (exists as the monthly avatar) |
| Occasionally | Element Week: double bias for one element |

A small team can run this: one Sigil artist-week per season, frames and backdrops
from the existing generators, auras in CSS.

### 8.3 Money and loot-box rules (for later)

Nothing is sold today, so no loot-box law applies now. Still publish the drop odds
in the app (a "Drop odds" sheet): it costs nothing and builds trust.

If a store comes later:

- **Sell certainty, never chance.** Direct cosmetics at a shown price, or a premium
  **Season Path** track whose rewards are listed up front.
- **Never sell** components, drops, pity skips, rerolls or a currency that buys any of them.
- Rules to check with counsel before selling anything near RNG:
  - App Store guideline 3.1.1 and Google Play's policy require odds disclosure for paid random items.
  - Belgium treats paid loot boxes as illegal gambling.
  - The Netherlands has enforced against them in the past.
  - Germany's youth-protection law (JuSchG 2021) weighs them in age ratings.
  - The UK has industry principles in place.
  - China and South Korea require odds disclosure.
  - Brazil restricts them for minors (2025).
- GDPR: a regional leaderboard needs opt-in, not location inference.

---

## 9. Data model

```sql
-- Seasons
create table public.seasons (
  id smallint primary key,                    -- 0, 1, 2…
  name text not null,                          -- "Embers"
  element text not null check (element in ('fire','water','earth','air')),
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

-- Per player per season: placement, proof wins, peak
create table public.player_seasons (
  player_id uuid references public.profiles(id) on delete cascade,
  season_id smallint references public.seasons(id),
  ranked_wins int not null default 0,
  proof_wins jsonb not null default '{}',     -- {"adept": 7, "elementalist": 2}
  peak_elo int not null default 0,
  proven_tier text,                            -- highest tier with 10 proof wins
  final_rank int,                              -- Archmage #N at season end
  rewarded_at timestamptz,
  primary key (player_id, season_id)
);

-- Profile additions (pity counters; the old `pity` becomes the crown pity)
alter table public.profiles
  rename column pity to crown_pity;
alter table public.profiles
  add column pity_tempered smallint not null default 0,
  add column pity_runed smallint not null default 0,
  add column pity_starforged smallint not null default 0,
  add column peak_elo int not null default 100,
  add column win_run smallint not null default 0,
  add column run_mode text,
  add column title_id text,
  add column showcase jsonb not null default '[]';   -- [{kind, id}] × 3

-- Catalogue (readable by everyone, written by migrations only)
create table public.parts (
  id text primary key,                         -- 's1-sigil-ember-wyrm'
  slot text not null check (slot in ('backdrop','sigil','frame','crest','aura')),
  element text not null check (element in ('fire','water','earth','air')),
  rarity text not null check (rarity in ('forged','tempered','runed','starforged')),
  season_id smallint references public.seasons(id),
  source text not null check (source in ('craft','rank','achievement','event','daily','starter')),
  art text not null,                           -- asset key
  editions_forged int not null default 0       -- numbering for first editions
);
create table public.recipes (
  part_id text primary key references public.parts(id),
  components jsonb not null,                   -- {"tempered": 7, "runed": 4}
  stardust int not null,
  crowns smallint not null default 0
);

-- Inventory
create table public.player_components (
  player_id uuid references public.profiles(id) on delete cascade,
  element text not null,
  rarity text not null check (rarity in ('scrap','forged','tempered','runed','starforged')),
  qty int not null default 0 check (qty >= 0),
  primary key (player_id, element, rarity)
);
create table public.player_parts (
  player_id uuid references public.profiles(id) on delete cascade,
  part_id text references public.parts(id),
  acquired_at timestamptz not null default now(),
  edition int,                                 -- No. 37 (first 100 Starforged forges)
  equipped_solves int not null default 0,      -- patina
  ascension smallint not null default 0,
  primary key (player_id, part_id)
);
create table public.avatar_loadouts (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  backdrop text references public.parts(id),
  sigil text references public.parts(id),
  frame text references public.parts(id),
  crest text references public.parts(id),
  aura text references public.parts(id)
);

-- Every roll, once per game
create table public.drops (
  game_id uuid primary key references public.games(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  rarity text not null,
  element text not null,
  part_id text references public.parts(id),    -- relic drops
  duplicate boolean not null default false,
  upgrade_chance numeric(4,3) not null,
  pity_hit text,                               -- which guarantee fired, if any
  created_at timestamptz not null default now()
);

-- Append-only economy ledger
create table private.ledger (
  id bigserial primary key,
  player_id uuid not null,
  at timestamptz not null default now(),
  reason text not null,                        -- 'solve' | 'drop' | 'craft' | 'refine' | 'swap' | 'smelt' | 'season'
  ref text,                                    -- game id, part id…
  stardust int not null default 0,
  crowns int not null default 0,
  components jsonb                             -- {"fire.tempered": -7}
);

-- Badges and titles
create table public.badges (id text primary key, name text not null, art text not null, season_id smallint);
create table public.player_badges (player_id uuid, badge_id text references public.badges(id),
  earned_at timestamptz default now(), primary key (player_id, badge_id));
create table public.titles (id text primary key, text text not null, season_id smallint);
create table public.player_titles (player_id uuid, title_id text references public.titles(id),
  earned_at timestamptz default now(), primary key (player_id, title_id));

-- Leaderboards: computed on read from profiles/player_seasons/games,
-- plus a frozen snapshot at season end
create table public.season_results (
  season_id smallint references public.seasons(id),
  rank int not null,
  player_id uuid references public.profiles(id) on delete cascade,
  elo int not null,
  primary key (season_id, rank)
);
```

RLS as today: players read their own inventory, everyone reads catalogues and public
profile fields, and all writes go through `security definer` functions.

---

## 10. Drop roll with pity (server)

Called from `finish_game` after a rated, solved game; the result is returned in its JSON.

```sql
-- Uniform [0,1) from the crypto source, not a seedable RNG.
create function private.rand() returns double precision
language sql volatile set search_path = '' as $$
  select ('x' || encode(extensions.gen_random_bytes(7), 'hex'))::bit(56)::bigint / 72057594037927936.0;
$$;

create function private.roll_drop(p_player uuid, p_game uuid, p_upgrade numeric, p_mode text, p_easy boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare
  tiers constant text[] := array['scrap','forged','tempered','runed','starforged'];
  base  constant double precision[] := array[0.62, 0.25, 0.095, 0.03, 0.005];
  mode_el text := case p_mode when 'ranked' then 'fire' when 'clash' then 'water'
                              when 'daily' then 'earth' else 'air' end;
  others text[];
  p public.profiles;
  today_drops int;
  x double precision;
  t int := 1;
  u numeric := least(greatest(p_upgrade, 0), 0.30);
  pity_hit text;
  el text;
  part text;
  dup boolean := false;
begin
  -- daily pace: 1–25 full, 26–50 one in three, then none
  select count(*) into today_drops from public.drops
    where player_id = p_player and created_at >= private.daily_start();
  if today_drops >= 50 or (today_drops >= 25 and private.rand() >= 1.0 / 3) then
    return null;
  end if;

  select * into p from public.profiles where id = p_player for update;

  -- base roll, then at most one upgrade
  x := private.rand();
  while t < 5 and x >= base[t] loop x := x - base[t]; t := t + 1; end loop;
  if t < 5 and private.rand() < u then t := t + 1; end if;
  if p_easy then t := least(t, 2); end if;      -- Casual Easy: Forged at most, no pity

  if not p_easy and today_drops < 25 then
    -- pity, highest guarantee first
    if p.pity_starforged + 1 >= 160 and t < 5 then t := 5; pity_hit := 'starforged';
    elsif p.pity_runed + 1 >= 40 and t < 4 then t := 4; pity_hit := 'runed';
    elsif p.pity_tempered + 1 >= 10 and t < 3 then t := 3; pity_hit := 'tempered';
    end if;
    p.pity_starforged := case when t >= 5 then 0 else p.pity_starforged + 1 end;
    p.pity_runed      := case when t >= 4 then 0 else p.pity_runed + 1 end;
    p.pity_tempered   := case when t >= 3 then 0 else p.pity_tempered + 1 end;
    update public.profiles set pity_tempered = p.pity_tempered, pity_runed = p.pity_runed,
      pity_starforged = p.pity_starforged where id = p_player;
  end if;

  -- element: half the mode's, half the other three
  others := array_remove(array['fire','water','earth','air'], mode_el);
  el := case when private.rand() < 0.5 then mode_el else others[1 + floor(private.rand() * 3)::int] end;

  -- a quarter of Tempered+ drops are a finished part, preferring ones not owned
  if t >= 3 and private.rand() < 0.25 then
    select pt.id into part from public.parts pt
      where pt.rarity = tiers[t] and pt.element = el and pt.source = 'craft'
        and pt.season_id = private.current_season()
      order by (exists (select 1 from public.player_parts pp
                        where pp.player_id = p_player and pp.part_id = pt.id))::int * 3
               + private.rand()   -- owned parts weigh ~4x less
      limit 1;
  end if;

  if part is not null then
    insert into public.player_parts (player_id, part_id) values (p_player, part)
      on conflict do nothing;
    if not found then                            -- duplicate: smelt it
      dup := true;
      update public.profiles set stardust = stardust +
        case tiers[t] when 'tempered' then 120 when 'runed' then 400 else 1200 end
        where id = p_player;
      perform private.add_component(p_player, el, tiers[t], 1, 'smelt', part);
    end if;
  else
    perform private.add_component(p_player, el, tiers[t], 1, 'drop', p_game::text);
  end if;

  insert into public.drops (game_id, player_id, rarity, element, part_id, duplicate, upgrade_chance, pity_hit)
    values (p_game, p_player, tiers[t], el, part, dup, u, pity_hit);  -- unique per game

  return json_build_object('rarity', tiers[t], 'element', el, 'part', part,
    'duplicate', dup, 'pity', pity_hit,
    'pity_left', json_build_object('tempered', 10 - p.pity_tempered,
                                   'runed', 40 - p.pity_runed,
                                   'starforged', 160 - p.pity_starforged));
end;
$$;
```

`private.add_component` upserts `player_components` and writes the ledger;
`private.upgrade_chance(game)` computes `u` from §2.2 using the game's mode,
difficulty, rating, mistakes, hints, speed bonus and the win run.

## 11. Forging (server)

```sql
create function public.forge_part(p_part text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pt public.parts;
  r public.recipes;
  tier text;
  need int;
  have int;
  ed int;
begin
  select * into pt from public.parts where id = p_part for update;   -- also serialises editions
  if pt is null or pt.source <> 'craft' then raise exception 'not forgeable'; end if;
  if pt.season_id is distinct from private.current_season() then raise exception 'vaulted'; end if;
  if exists (select 1 from public.player_parts where player_id = uid and part_id = p_part) then
    raise exception 'already owned';
  end if;
  select * into r from public.recipes where part_id = p_part;

  -- check and take components (all of the part's element)
  for tier, need in select key, value::int from jsonb_each_text(r.components) loop
    select qty into have from public.player_components
      where player_id = uid and element = pt.element and rarity = tier for update;
    if coalesce(have, 0) < need then raise exception 'not enough %', tier; end if;
  end loop;
  update public.profiles set stardust = stardust - r.stardust, crowns = crowns - r.crowns
    where id = uid and stardust >= r.stardust and crowns >= r.crowns;
  if not found then raise exception 'not enough Stardust or Crowns'; end if;
  for tier, need in select key, value::int from jsonb_each_text(r.components) loop
    perform private.add_component(uid, pt.element, tier, -need, 'craft', p_part);
  end loop;

  -- first editions: the first 100 forges of a Starforged part are numbered
  if pt.rarity = 'starforged' and pt.editions_forged < 100 then
    ed := pt.editions_forged + 1;
  end if;
  update public.parts set editions_forged = editions_forged + 1 where id = p_part;
  insert into public.player_parts (player_id, part_id, edition) values (uid, p_part, ed);
  insert into private.ledger (player_id, reason, ref, stardust, crowns)
    values (uid, 'craft', p_part, -r.stardust, -r.crowns);

  return json_build_object('part', p_part, 'edition', ed);
end;
$$;
```

Refine (5 → 1 up) and swap (3 → 1 across) follow the same pattern: lock, check,
spend, write the ledger, return the new counts.

---

## 12. Screens

### 12.1 Reward reveal (after a solve)

It extends the existing result pop-up. The drop is the last beat, after Elo and Stardust:

1. **Stats** (as today): time, mistakes, Elo change with the tier bar filling.
   A promotion pauses here: the emblem stamps in, "Adept II".
2. **Stardust** counts up into the balance chip (0.4s).
3. **The drop**: an ingot slides out of the forge mouth, glowing.
   - The glow **cools into the rarity colour**; anticipation scales with rarity: Scrap
     cools instantly, Tempered hisses with steam (0.6s), Runed lights its runes one by one
     with a haptic tick each, Starforged flares the whole sheet and burns the card in.
   - If an upgrade fired, the ingot visibly re-heats one step ("Upgraded: clean solve").
   - Pity: "Runed or better within 12" under the card, ticking down.
   - A relic shows the part on a mini avatar; a duplicate shows it smelting into Stardust.
4. **Next game** is always available: one tap skips the reveal to its end state.

Reduce motion: no slide, flare or flicker; the card simply appears with its rarity
word and pips. Screen readers hear one literal line: "Drop: Tempered Ember.
Runed or better within 12 drops." (`announce`, never mid-animation).

### 12.2 The Forge (collection and crafting)

- Tabs per slot; a grid of the season's parts. Owned parts are bright; forgeable
  ones glow at the edge; missing ones are dim silhouettes with their recipe.
- Tapping a part opens its recipe: component chips (owned / needed), Stardust,
  Crowns, and **Forge** (hold to forge, with a hammer-strike animation and haptic).
- Material shelf: components by element × rarity, with **Refine** and **Swap**.
- Vaulted seasons are browsable, read-only, so players can see what they missed and
  what others own.

### 12.3 Profile: see §5.2.

---

## 13. Affinities: the elemental tug of war

Every player belongs to one element. Every square they solve, in any mode, adds
**influence** to that element worldwide. Each month the four elements pull against
each other, and members of the winner get the best rewards. Inspired by team
affinities in location games, with their known flaws fixed (below).

### 13.1 The four affinities

**Fire, Water, Earth, Air**, named plainly. Other systems were considered:

| Option | Why not |
| --- | --- |
| Five, with Aether/Spirit | The "special" fifth pulls a crowd and unbalances teams |
| Wu Xing (Wood, Fire, Earth, Metal, Water) | Needs explaining; Metal and Wood don't match the brand |
| Modern sets (Lightning, Ice, Shadow, Light) | Endless; dilutes teams |

Four classical elements need no explanation, already shape the drops and avatar
parts, and make "Elomental" literal. Each affinity's character (one line, shown at
the choice): Fire: *speed and nerve*; Water: *patience, the long line*; Earth:
*steady, every day*; Air: *light touch, many squares*. They are flavour only:
no affinity plays differently.

### 13.2 Choosing

- **When:** right after the player's **third solved square** (guest or signed in),
  as a one-screen ceremony: four crests, the line for each, and the current month's
  standings so a player can join an underdog if they like. Not at sign-up: guests
  play instantly, and by the third solve the choice means something.
- **Lock:** chosen for the season. One switch per season, during its first 7 days;
  your past influence stays with your old element. Prevents bandwagoning mid-war
  without trapping anyone forever.
- **What it gives:** your affinity's crest is your free avatar crest (§4.1),
  drops lean slightly toward your element (+10% of the non-mode share), and your
  crest shows next to your name on every leaderboard row and the profile.

### 13.3 Influence

Earned on every **audited, solved** square, any mode:

| Solve | Influence |
| --- | --- |
| Casual Easy / Medium / Hard | 1 / 2 / 3 |
| Daily Square | 4 |
| Ranked | 3, + 1 per 1000 of the square's rating (max +3) |
| Clash (either side, solved) | 3; +1 for the win |
| Clean solve | +1 |

- **Daily cap:** influence counts on the first 25 solves of the day, the same pace as
  drops (§2.5). A bot farm or a 10-hour binge can't carry an element.
- Unrated or flagged games earn none. Accounts start contributing after 3 solved games.

### 13.4 How a war is won

A **war lasts one calendar month** (matching the Daily Square month), so a season
holds two wars.

**Standing = an element's total influence ÷ its active members** (members with at
least one contributing solve that month). Not the raw total: in team games the
biggest team won by headcount and the others gave up. With the average, a small,
dedicated element can win, and every member's play visibly moves the bar.

Shown as a four-way tug bar of each element's share of the summed averages, plus
"your contribution this month" and the gap to the element above.

### 13.5 Rewards

At the end of each month, for members with **10+ contributing solves** that month
(stops freeloading):

| Place | Stardust | Components of your element | Cosmetic |
| --- | --- | --- | --- |
| 1st | 800 | 2 Tempered | **Victor crest** for that month (vaulted) + war badge |
| 2nd | 500 | 4 Forged | War badge |
| 3rd | 350 | 3 Forged | War badge |
| 4th | 250 | 2 Forged | War badge |

Everyone who took part gets something, so a losing month still pays. Top 10
contributors per element (by capped influence) get a "Standard-bearer" title for
the month: a flex that rewards consistency, not hours, because of the cap.

**Season champion:** the element with the most monthly wins (tie: total standing)
gets a season banner on every member's profile for the next season.

### 13.6 Where it lives

- **Leaderboards:** a dedicated **Affinities** tab first in the list, with the tug bar,
  this month's standings, days left, past months' winners, and each element's top
  standard-bearers. The other boards show each player's crest on their row.
- **Result screen:** one line after the drop: "+5 influence for Fire".
- **Home:** the profile card shows the player's crest; on the last 3 days of a war,
  a slim "Fire leads Water by 3%" strip under the profile card.
- **Profile:** affinity crest, lifetime influence, war wins, standard-bearer titles.

### 13.7 Data

```sql
alter table public.profiles
  add column affinity text check (affinity in ('fire','water','earth','air')),
  add column affinity_switched_season smallint;

create table public.affinity_months (
  month date not null,                        -- first day of the month
  player_id uuid references public.profiles(id) on delete cascade,
  affinity text not null,
  influence int not null default 0,
  solves int not null default 0,
  primary key (month, player_id)
);
-- standings: avg(influence) per affinity over players with solves > 0, cached
-- every few minutes into a small table the Affinities tab reads
create table public.affinity_standings (
  month date not null,
  affinity text not null,
  members int not null,
  influence bigint not null,
  standing numeric not null,
  updated_at timestamptz not null default now(),
  primary key (month, affinity)
);
```

`finish_game` adds influence (respecting the daily cap) in the same transaction as
the drop. A scheduled function (pg_cron) refreshes `affinity_standings` every 5
minutes and settles rewards on the 1st of each month.

### 13.8 Watch-outs

- **Lopsided membership:** show live member counts at the choice; if one element
  passes 40% of new choices for a month, its crest in the picker gets no extra
  promotion (no "recommended" badge), and the underdog gets the "needs you" tag.
- **Colour:** Water needs a blue the palette doesn't have yet. A new token (a muted
  slate-teal) needs design sign-off and a contrast check in `scripts/contrast.ts`.
  Elements are always shown with crest shape plus name, never colour alone.
- **Toxicity:** there's no chat, so no team trash talk; standings speak in numbers only.

---

## 14. Roadmap

### Phase 1: MVP, 2–3 weeks (Season 0)

- Migrations: components, parts, recipes, drops, ledger, pity counters, loadout.
- `roll_drop` inside `finish_game`; `forge_part`, refine, swap.
- 24 parts: 4 crests (free), 8 backdrops, 6 frames, 6 sigils (Forged/Tempered/Runed).
- Result screen drop reveal (§12.1) with Reduce motion and screen-reader text.
- The Forge page and avatar loadout; the profile avatar shows the loadout.
- New tier thresholds and emblems; promotion moment.
- Affinity choice after the third solve; the affinity crest on the avatar.
  (Influence is recorded from day 1, so the first war can start in phase 2 with history.)
- "Drop odds" sheet. Economy sim moved into `scripts/`.
- Brand voice glossary updated with the new terms.

### Phase 2: Season 1, about 4 weeks after phase 1

- Seasons, placement, proof wins, season rewards and vaulting.
- Profile page v1 (§5) with showcase, season history, stats.
- Leaderboards: **Affinities** (the monthly war, rewards on the 1st), Global, Season, Daily Square.
- Titles and badges.
- Season Path (free track) and Mend a missed Daily.
- Integrity: human floor times, move-timing flags, rate limits.

### Phase 3: Seasons 2–3

- Weekend Trials; Friends board from Clash partners.
- Patina and Ascension; numbered first editions on the profile.
- Element Weeks; weekly Daily Square badges.

### Later

- Live 1v1 races (realtime matchmaking, separate Elo).
- Gauntlet tournaments; regional boards (opt-in).
- Store: direct cosmetics and a premium Season Path track only (§8.3).
