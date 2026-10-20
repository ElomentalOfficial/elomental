# UX consult: who Ranked is for, and the new Elo ladder (2026-10-21)

Reviewer: ux-reviewer. Design consult only: no code was changed. The Elo maths (bands, K, loss curve,
protection, the rescale of existing players) belong to game-economy-designer, who is working on them in
parallel. This note covers the player side: who we build Ranked for, what each rank should ask of them, how
it should teach, and whether the owner's five undivided ranks carry a session.

**Owner's brief.** Novice and Apprentice squares are far too hard and will put people off the climb.
Other asks:
- Name the target player: a casual solver or a diehard fan, and what difficulty they enjoy.
- Rank names with no divisions, in this order: Novice, Apprentice, Adept, Archmage, Elomental.
  "Elementalist" goes; "Elomental" becomes the top rank.
- Elo from about 100 to 1600, with protection ending around 200.

**What I read.**
- `CLAUDE.md`, the Revision section of `docs/PROGRESSION_DESIGN.md`, the glossary in
  `docs/BRAND_VOICE.md`, `docs/AUDIT.md` §3.4, and my notes of 2026-10-20 (`docs/review/ux-reviewer.md`).
- The live rules in code:
  - `packages/web/src/profile.ts`: `rankedTarget`, `eloDelta`, `K_CURVE`, `LOSS_CURVE`,
    `PROTECTED_BELOW`, `TIERS`, `parMs`, `speedBonus`.
  - `packages/engine/src/generator.ts`: `ratedProfile`, `PROFILES`.
  - `packages/engine/src/grader.ts` (`estimateRating`) and the technique weights in `techniques.ts`.
  - The Ranked sheet copy in `copy/en.ts`.

---

## 1. Research: how real sudoku players split by difficulty

### What is and isn't public

**No big app publishes how its players split across difficulty levels.** I looked for Sudoku.com
(Easybrain), NYT Games, Good Sudoku, Sudoku Coach, sudokuwiki and the Cracking the Cryptic channel, and found
no first-party figures. Every share below marked *estimate* is my reasoning from indirect evidence, not a
measured number.

### What mainstream "hard" actually asks for

| Source | Levels | What the top levels need | Givens |
| --- | --- | --- | --- |
| **Sudoku.com** | Easy, Medium, Hard, Expert, Master, Extreme ([rules page](https://sudoku.com/sudoku-rules/)) | **Easy to Expert: singles only** (mostly hidden singles in a box). Master: a few hidden pairs. Extreme: locked candidates (pointing/claiming), naked pairs, an occasional Skyscraper. | Easy 38, Expert 30–32, Master 24–30, Extreme 22–28 |
| **NYT Sudoku** | Easy, Medium, Hard | Medium: pairs and locked candidates. Hard: pairs, locked candidates, an occasional triple; **no X-Wing or Swordfish**. | Easy 38, Medium 23–26, Hard 22–26 |
| **HoDoKu** (expert tool) | Easy, Medium, Hard, Unfair, Extreme | "Medium" is singles, locked candidates, pairs and triples ([docs](https://hodoku.sourceforge.net/en/docs_cre.php)). | n/a |
| **sudokuwiki** (Andrew Stuart) | Basic, Tough, Diabolical, Extreme ([solver](https://www.sudokuwiki.org/sudoku.htm)) | Basic: singles, pairs, pointing, box/line, triples. Tough: X-Wing, Y-Wing, Swordfish, XYZ-Wing, Simple Colouring. Diabolical: XY-Chain, X-Cycles, Medusa, Jellyfish. Extreme: finned fish, ALS, forcing chains. | n/a |
| **Sudoku of the Day** | Beginner to Diabolical, by summed technique cost ([difficulty](https://www.sudokuoftheday.com/difficulty)) | Ordered by cost: singles 100, candidate lines 350, naked pair 750, hidden pair 1500, triples 2000–2400, X-Wing 2800, Swordfish 8000. | n/a |
| **Good Sudoku** (Zach Gage) | 5 levels ([App Store](https://apps.apple.com/us/app/good-sudoku-by-zach-gage/id1489118195)) | Each level lists the techniques it needs; techniques can be practised on their own and are tracked as learned. The hardest puzzles need XYZ-Wings, hidden quads, Jellyfish and Swordfish. Daily puzzles get harder through the week ([MacStories](https://www.macstories.net/reviews/game-day-good-sudoku/)). | n/a |

**About the Sudoku.com and NYT rows.** They come from one source,
[SudokuPulse](https://sudokupulse.com/articles/sudoku-difficulty/), a competing site that ran "a sample"
of each app's puzzles through its own solver. It gives no sample size, so treat those rows as indicative. The
direction fits everything else I found:
- The mass-market apps' *top* labels sit inside sudokuwiki's "Basic" group and HoDoKu's "Medium".
- X-Wing is where the expert tools start "Tough".

**Clue counts across third-party guides** (they overlap and vary by site,
e.g. [sudokugames.org](https://www.sudokugames.org/blog/sudoku-difficulty-levels-explained-easy-to-extreme)):

| Level | Givens |
| --- | --- |
| Easy | 36–45 |
| Medium | 28–35 |
| Hard | 24–30 |
| Expert | 22–27 |

The guides agree that technique matters more than the count.

### Solve-time norms

[Pelánek (2011/2014)](https://ar5iv.labs.arxiv.org/html/1403.7373) studied 1,700+ puzzles solved by
thousands of people on three portals:
- **Mean solve time is 8 minutes on fed-sudoku.eu**, which is mainly used by expert solvers.
- **It is 23 minutes on sudoku.org.uk**, which draws the general public.
- Difficulty comes from two things: how complex each step is, and how few next steps the player has to choose
  from. Easy squares offer many ways forward; hard ones offer few.

That is why taking clues away and adding a technique are two separate difficulty dials.

### The audience

The [Sudoku Guru 2026 survey](https://sudoku-guru.com/info/research-2026/) asked 9,470 players of one app
family. Its age shares are internally inconsistent (they add up to 108%), so use them as a direction only:
- 35–44: about 16%.
- 55+: about 47%.
- About 60% play 3+ times a week.

The 35–45 band is real but not the bulk of sudoku players. The bulk is older and more casual still.

**Cracking the Cryptic** has about 708k subscribers
([Wikipedia](https://en.wikipedia.org/wiki/Cracking_the_Cryptic)). No viewer demographics are public. It
proves a large fan base enjoys watching hard logic, not that those viewers play hard squares themselves.

### Difficulty, churn and learning

- [Roohi et al. 2020](https://arxiv.org/abs/2008.12937), a model fit to *Angry Birds Dream Blast*: less
  skilled and less persistent players are the most sensitive to high difficulty and quit earliest.
- The ["85% rule"](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579) (Wilson et al., *Nature
  Communications* 2019): learning is fastest at about 85% success. It was derived for simple learning
  algorithms, so it is a direction ("mostly succeed, sometimes stretch"), not a game-tested number.

### My estimate of the split (estimate, not data)

| Player type | Share | Comfort zone |
| --- | --- | --- |
| Casual | ~55–65% | Singles, plus pointing found by intuition |
| Improvers | ~25–35% | Pairs and triples with notes; curious about X-Wing |
| Diehards | ~5–10% | Fish, wings, chains |

The reasoning: the two biggest consumer brands top out around pairs and locked candidates, and still sell
those levels as "Expert", "Master" and "Hard".

---

## 2. What Ranked serves today (verified in code)

How a square is made:
- `rankedTarget(elo)` = your Elo (held to at least 150) up to 1200, then climbs a third as fast.
- `ratedProfile` carves the square:

| Target | Square |
| --- | --- |
| < 260 | Singles, ≥30 clues |
| < 650 | Up to pairs and triples, carved to 24 |
| < 1150 | Fish and wings, carved to 22 |

The technique weights put rough Elo on each technique (`100 + 45 × weight + 6 × effort`):

| Technique | Elo |
| --- | --- |
| Pointing | ~300 |
| Naked pair | ~355 |
| Hidden pair | ~405 |
| Triples | ~510–560 |
| X-Wing | ~710 |

**How that lines up against the mainstream:**

| Elomental Ranked today | Reached after | Mainstream equivalent |
| --- | --- | --- |
| Elo 100–260: singles, 30+ clues | first 5–6 wins | Sudoku.com Hard to Expert |
| Elo 260–500: pointing, then pairs, at **24 clues** | wins 6–12 | Sudoku.com Extreme / NYT Hard by technique, **at the sparse end of NYT Hard by clues** |
| Elo 500–650: triples at 24 clues | wins 12–18 | Harder than NYT Hard |
| Elo 650+: **X-Wing at 22 clues** | about 2 weeks of 2 games a day | sudokuwiki "Tough"; beyond anything the big apps label |

**For comparison, Casual Hard** is a pair or triple at 28 clues. So **Casual Hard is easier than Ranked from
about the 8th win**. A player who finds Casual Hard a stretch is served harder squares in Ranked's second
rank.

### The structural cause: the climb settles where you lose two games in three

A Ranked game is priced as an even match against your own Elo. So:
- **A win pays K/2.**
- **A loss costs K/2 × the loss factor.** The factor is 0 below 500, 0.5 at 500, rising to 1 at 1200.

Elo stops climbing where wins and losses cancel: **win share = factor ÷ (1 + factor)**.

| Elo | Loss factor | Where the climb settles (win share) |
| --- | --- | --- |
| below 500 | 0 (protected) | **No floor: anyone who wins now and then climbs to 500** |
| 500 | 0.5 | about **33%** |
| 800 | ~0.71 | about 42% |
| 1200 | 1 | about 50% |

The speed bonus on wins pulls these a few points lower still. In plain words:
- Protection carries every player up to 500, onto pair-and-triple squares at 24 clues, whatever their skill.
- From there the half-price loss lets Elo keep rising until the player wins about **one game in three**.
- **The low ranks are built to sit just past the player's level.** This is why the owner is right, and the fix
  isn't only "easier squares at Novice": the pricing needs changing too (see §6, item 2).

The time rules make it worse:
- **Par** is 10 minutes up to a 400 rating (`parMs`).
- The sheet promises "About 10 min".
- A general-public solver averages **23 minutes** on a daily square (Pelánek). On a 24-clue triples square,
  a casual player passes 2× par (20 min) and takes the −25% slow cut, on the games they do win.

---

## 3. Personas

Four, three inside the 35–45 band and one just outside it. Shares are my estimates (§1).

### P1 · Dana, 41, "the daily-paper solver" (casual, the majority)

- **Plays:** Sudoku.com Medium/Hard or NYT Easy/Medium on her phone, at lunch and on the sofa. 10–15
  minutes. Rarely takes notes.
- **Enjoys:** singles, with the occasional pointing step she finds without knowing its name. A clean solve
  with no mistakes. Beating her own time.
- **Quits at:**
  - a square she can't crack after 15 minutes;
  - losing a game she spent a whole session on;
  - jargon ("X-Wing", "Elo protection");
  - feeling stupid.
- **Progress means:** solved, clean and quicker than last week; a streak; a badge that moves. **Not** a
  rating.

### P2 · Ian, 38, "the improver" (engaged intermediate)

- **Plays:** NYT Hard, Sudoku.com Master/Extreme, uses notes, knows naked pairs. Has watched a Cracking the
  Cryptic video and "kind of gets" X-Wing. Commute plus evening; 2–3 squares a day.
- **Enjoys:** being stretched by one new idea at a time, then making it his own. A rating that proves he
  has improved.
- **Quits at:**
  - a plateau with no explanation;
  - losses that feel unfair ("what was I supposed to see?");
  - hints that punish the very learning he's trying to do.
- **Progress means:** a new technique learned, a promotion, the Elo line going up over weeks.

### P3 · Dee, 44, "the diehard" (expert)

- **Plays:** sudokuwiki Tough/Diabolical and HoDoKu. Watches Cracking the Cryptic. Solves a hard square in
  8–12 minutes. 5+ squares a day in bursts.
- **Enjoys:** fish, wings and chains; speed; the leaderboard.
- **Quits at:**
  - a long run of trivial squares before the real game starts;
  - a ceiling reached in a few weeks;
  - top squares that feel random rather than hard.
- **Progress means:** her number, her place, the top rank and its numbered list.

### P4 · Ruth, 58, "the steady relaxer" (just outside the band, and the largest age group in the survey)

- **Plays:** lots of Easy/Medium, 20–30 minutes at a time, every day. Dislikes clocks.
- **Enjoys:** calm, completion, the Daily ritual.
- **Quits at:** time pressure, losing, anything that feels like a test.
- **Progress means:** the Daily calendar filling up, the collection growing.
- Ranked is not for her, and that's fine *if Casual and Daily keep her*. She matters here as the player
  Ranked must never trap: the Home button for Ranked mustn't be the obvious "real" mode for someone who
  will only be hurt by it.

---

## 4. Case studies: each persona's first two weeks of Ranked today

These use the live rules (start 100, K 60 below 600, protected below 500, half-price losses at 500, par
10–15 min, three mistakes end the game). The Elo steps are worked from the formulas in `profile.ts`. The
win chances are my judgement of each persona against the technique and clue count served.

### Dana: 1 Ranked a day, alongside the Daily

| Days | What happens | How it feels |
| --- | --- | --- |
| 1–5 | Five singles squares at 30+ clues. She wins all five, mostly in 10–14 minutes, at about +30–34 Elo each. "Promoted: Novice II" on day 3. | **Good: the best moment Ranked gives her.** |
| 6 | Elo about 290. Her first **24-clue** square, with a pointing step. Six fewer givens than anything she plays elsewhere. She scans for 20+ minutes and guesses twice. Three mistakes, lost. "No Elo lost: your rating is protected below 500." | Her rating is safe, but her lunch break is gone. |
| 7–10 | Wins one, loses two. A naked pair, then a hidden pair. Hidden pairs effectively need full notes, and she doesn't keep them. The win that does come is over 20 minutes, so it takes the −25% slow cut. The sheet still says "About 10 min." | Ranked now feels like a test she keeps failing. |
| 11–14 | Protection keeps lifting her (losses are free) toward 400–500: triples. She wins perhaps one in four. | |

**Where she quits: day 7–10, after the second 20-minute loss in a row.** She goes back to the Daily and Casual
and never opens Ranked again. The rank she shows on Profile and the leaderboard ("Novice I") then freezes for
good. **Severity: Critical.** This persona is the majority, and the first two ranks lose her inside two weeks.

### Ian: 2–3 Ranked a day

| Days | What happens | How it feels |
| --- | --- | --- |
| 1–2 | Six singles squares, 6–9 minutes each, often with the speed bonus. A little dull, but quick wins feel fine. | |
| 3–5 | Pointing and pairs at 24 clues: his home ground. He wins about 70%. Promoted twice. Protection ends at 500. | **The best stretch.** |
| 6–8 | Triples at 24 clues, then X-Wing squares at 22 clues around Elo 650. "Promoted: Apprentice III". The Hint button explains a fish in one line but costs 25% of the gain. A wrong guess on a fish square soon reaches three mistakes. He loses about half, at −15 to −18 each. | |
| 9–14 | He goes up and down between 600 and 720. The next promotion (800) never comes. Nothing tells him that X-Wing is what he's missing, or where to learn it. | |

**Where he quits: around day 12–16, on the plateau at Apprentice III.** He might push through if he decides
to learn X-Wing on YouTube, but the app gives him no help with it. **Severity: High.** Ian is the persona the
"climb" exists for, and it stalls without telling him why.

### Dee: 5–8 Ranked a day

| Days | What happens | How it feels |
| --- | --- | --- |
| Day 1 | Six singles squares in 3–5 minutes each, at the +25% speed bonus. "Is this it?" | **The quit risk.** If her first session is only these, she may judge the app as "for beginners" and leave. |
| Days 2–4 | Pairs, then X-Wings by about win 18. She's engaged. | |
| Days 5–14 | Wings and fish, then chains from Elo about 1150. Squares follow her Elo to 1200 and then climb a third as fast. Under the owner's 1600 cap, the top squares would be L4 chains at most. | |

**Where she quits: day 1 if unlucky; otherwise she's fine for two weeks.** Her later risk is the ceiling:
with a 1600 top and squares levelling off, she could reach Elomental in 2–4 weeks and have nothing left but
the numbered list. **Severity: Medium** (a small share, but she fills the leaderboard).

### Ruth: 1 Ranked every other day

- **Days 1–6:** she wins three singles squares, but at 22–28 minutes each, past 2× par. All three take the
  slow cut ("over 20 min wins less").
- **Day 8:** her first 24-clue square. She concedes.

**Where she quits: by the end of week 1 at the latest.** She sees Ranked as "the timed mode that tells me I'm
slow". **Severity: Low for Ranked**, because she isn't its player. The lesson is that the Ranked sheet must be
honest about length, which it now partly is.

---

## 5. Recommendations

### 5.1 Build Ranked around Ian, the improver, and make the first two ranks Dana's

- **Ian is the core persona.** In sudoku, "climbing" means learning techniques. He is the only persona for
  whom a rating that rises as he learns is the whole fun, and the 35–45 improver who watches a video and wants
  to try it is a large, loyal group (*estimate* 25–35%).
- **Dana must win Novice and Apprentice, and feel at home in Adept.** These ranks should sit inside her comfort
  zone (singles, then pointing and the obvious pairs). A promotion should feel like "I'm good at this", not
  like an exam. If she settles at Adept with about 70% wins, she keeps a reason to play one Ranked square a
  day.
- **Dee gets a fast start and a real top.**
  - A short placement (§5.4) skips her past the bottom in her first session.
  - Elomental squares are genuinely hard: chains, colouring, finned fish.
  - The numbered list carries her after that.
- **Ruth is served by Casual and Daily.** Ranked's job toward her is only honesty: length, stakes, and no
  pressure to play it.

**The target feel**, my player-side requirement for the economy agent:
- A player at their settled rank wins **about 3 games in 4**. The 85% rule and the churn study both point to
  "mostly succeed, sometimes stretch".
- A new rank's first squares are winnable on the first or second try.
- **Two losses in a row should never be followed by a harder square.** How that is priced is the economy
  agent's call. Whatever is chosen, say it plainly on the sheet ("Matched to your recent games"), never as a
  hidden handicap.

### 5.2 One rank, one school of technique

Each rank adds one family of techniques. **Within a rank, clue count is the dial. Never cut clues at the same
step as a new technique is added.** Today both happen at the 260 step (pointing arrives and clues fall from 30
to 24), and that double step is what breaks Dana.

| Rank | New techniques its squares may need | Givens | Feels like | Engine level |
| --- | --- | --- | --- | --- |
| **Novice** | Singles only: full house, hidden single, naked single | 36 → 30 | Sudoku.com Easy to Expert | L1 |
| **Apprentice** | Pointing and claiming, then the naked pair (at most 3–4 such steps a square, like `casualMedium`) | 32 → 28 | NYT Medium, Sudoku.com Master | L2 (subset) |
| **Adept** | Hidden pairs, naked and hidden triples | 30 → 25 | NYT Hard, Sudoku.com Extreme, Casual Hard | L2 (full) |
| **Archmage** | X-Wing, XY-Wing, Swordfish, XYZ-Wing; later in the rank, Skyscraper, Two-String Kite, W-Wing | 28 → 23 | sudokuwiki Tough | L3, plus the "turbot" end of L4 |
| **Elomental** | Simple Colouring, X-Chain, XY-Chain, Remote Pairs, ALS-XZ; finned fish at the very top | 26 → 22 | sudokuwiki Diabolical/Extreme | L4–L5 |

**What the table implies:**
- **Rank boundaries should line up with technique entry points**, so a promotion always means "a new kind of
  square". The engine's natural bands already fall close to the owner's 100–1600 range, but the economy
  agent sets the actual numbers:

  | Engine band | Rating |
  | --- | --- |
  | Singles | ~150–190 |
  | Pointing | ~300 |
  | Pairs | ~355–405 |
  | Triples | ~510–560 |
  | X-Wing | ~710 |
  | Chains | 1150+ |

- **Adept is the rank most players should settle in.** It is as hard as the hardest label in the biggest
  apps. Archmage is where Ranked goes beyond what mainstream apps offer, and should feel that way.
- **"One new idea per square":** a square needs at most one technique newer than the rank's earlier ones, and
  mostly steps the player already knows. (`maxAdvancedSteps` and `requires` in `PROFILES` already do this for
  Casual.)
- Par is the next thing to re-fit to real solve times, as already planned at about 200 wins. The sheet's
  "About N min" must be true for the *median player at that rank*, not for the engine. Pelánek's 8 vs 23
  minutes says the gap can be large.

### 5.3 Yes, Ranked should teach, briefly and once

The evidence:
- Good Sudoku's whole design is "say which techniques each level needs, and let players practise them". Its
  reviewers' main complaint was that the lessons were too brief to stick.
- Sudoku Coach (per a [user write-up](https://crescendo.bearblog.dev/sudoku/), which I couldn't confirm
  first-hand) teaches through a campaign.

Teaching turns "the squares got harder and I lose" into "I've reached a new rank and learned something".

**Proposal, in four parts:**

1. **A one-time "New at Apprentice" card**, shown on the Ranked sheet the first time the player opens it at
   the new rank. Never mid-game, and never as a pop-up stacked on the result.
   - What it holds:
     - one small worked diagram;
     - two plain sentences;
     - **Show me**: a 30-second animated example on a mini board that stays until dismissed (the
       Good Sudoku reviewers' complaint);
     - **Got it** as the primary button.
   - It's skippable. It can be reopened from the Ranks sheet ("Techniques at this rank").
   - At most once per rank, so five times in a player's life.
   - Draft copy, to go into `copy/en.ts` and through the brand-voice checklist:
     - "New at Apprentice: pointing."
     - "If a number can only go in one line of a box, it can't go anywhere else on that line."
2. **The first hint for a technique you've never solved is free in Ranked**: no Elo cut. The hint text names
   the technique ("First: Pointing"; the copy exists in `copy.hints`). Every later hint costs as today. This
   stops the hint penalty from punishing the moment of learning. Abuse is bounded at one hint per technique,
   ever.
3. **The result names the hard step**, on wins and losses. Today a loss explains nothing. The square already
   carries `hardest` from the generator.
   - On a loss, a plain, literal line with no humour: "The key step was an X-Wing." Plus a link: "See how it
     works".
   - On a first win with a new technique: "First X-Wing." This also feeds the marks in §5.5.
4. **Optional practice, later (Low):** "Try one" on the card opens an unrated square that needs that
   technique, using `requires` in the generator. Casual Hard stops at triples, so today there is nowhere to
   practise an X-Wing except in a rated game.

The card goes through `openModal`, or sits inline on the sheet. Check the top edge on a phone and on a wide
screen at 200% text, as for any new surface.

### 5.4 A short placement for experienced solvers

- Offer it on the first Ranked sheet only: "Played harder sudoku before? Take 3 placement squares."
- The squares step up: singles, then pairs, then an X-Wing.
- Each one won clean in time moves the starting rank up one.
- Losing a placement square costs nothing and simply ends placement.

It fixes Dee's day-1 boredom without making Dana face an X-Wing. The pricing is the economy agent's call.

---

## 6. The rank names and the ladder

### 6.1 Order and names: Novice, Apprentice, Adept, Archmage, Elomental

**What works:**
- **No divisions** suits this audience. "Adept II" (with III lowest) is a gamer convention that reads
  backwards to anyone who hasn't played League or Hearthstone. A single word reads at a glance on the
  Profile, the show-off card and a leaderboard row.
- **Novice → Apprentice → Adept → Archmage** is an ordering most adults read correctly without explanation.
- **Elomental at the top makes the brand the prize:** "I'm Elomental" is ownable and memorable, and "Elomental
  #12" works for the numbered list that Archmage carried before.

**What needs fixing:**

1. **High · The "Elomentalist" name plate is one letter-group away from the top rank, and it's bought.**
   - The plate costs 12,000 Stardust (`copy.common.plates`, `copy.forge` price line). Next to a rank called
     Elomental, players will read the plate as the rank's badge.
   - That breaks the core rule that showing off is *earned*: a bought plate that looks like the top rank is
     exactly the "pay to look like the best" signal this audience distrusts. It also leaves two near-identical
     coined words to learn.
   - **Fix:** rename the plate.
     - My suggestion is **"Stardust plate"**: it says honestly what it is (a Stardust purchase) and keeps the
       metal ladder Bronze, Silver, Gold, then something past metal.
     - Owners keep it. The rename happens in place, with no refund dance.
     - ui-designer to confirm the look; the name goes through `docs/BRAND_VOICE.md`.
   - **Effort:** low (copy, glossary, one id).
2. **Medium · The app name and the rank collide in sentences.** "Clash me on Elomental", the page title and the
   sign-in copy all use the app name.
   - Rules for the guide: the rank always appears with its context ("Rank: Elomental", "Promoted: Elomental",
     "Elomental · 1540 Elo"). It never stands alone in a sentence where the app could be meant. It's never
     pluralised ("the Elomentals").
   - aria-labels stay literal: "Sam, rank Elomental, 1540 Elo".
3. **Medium · Existing players get renamed.** Today's Archmage needs 3000+ and Elementalist 2000+. A rescale to
   100–1600 changes every label. The economy agent owns the mapping; the player side needs:
   - one quiet line on Profile the first time ("Ranks have changed. Your rank is now Archmage."), not a
     pop-up;
   - no player's rank going *down* in name because of the rescale alone.
4. **Low · Archmage → Elomental needs one line of meaning.** "Archmage" reads as the top of a fantasy ladder, so
   a coined word above it needs saying once: on the Ranks sheet, "Elomental: the top rank". The §5.2 technique
   line ("chains and colouring") also tells a diehard why it's above Archmage.
5. **Glossary and code to update** (whoever builds it):
   - the glossary row in `BRAND_VOICE.md`, which currently describes divisions and "Promoted: Adept II";
   - `copy.common.ranks` and the now-unused `copy.common.rankDivision`;
   - `TIERS` and `DIVISIONS` in `profile.ts`;
   - the Ranks sheet copy (`tiersTitle`, `tiersIntro`);
   - the demo's `eloHelp` ("From 0 to 4800").

### 6.2 Do five undivided ranks carry a 5–15 minute session? Not alone.

The arithmetic (the economy agent will refine it):
- Five ranks over about 1,500 Elo is about 300 Elo a rank.
- At about +30 per win and a 70–75% win share with honest losses, a rank takes **roughly 20–40 Ranked games**.
- For Dana and Ian at 1–3 Ranked games a day, that is **one to four weeks between promotions**, longer at the
  top.

**What the player needs:** something that visibly moves **every session**, something new **every week or
so**, and a promotion **every few weeks**. Divisions used to fill the middle tier. Without them, fill it with
things that are earned, read at a glance, and don't need a new name:

1. **The bar, every session.** A progress bar under the rank on the Profile and the Ranked result, with "120
   Elo to Archmage" (`copy.common.toNextRank` exists). It must show on the result *every* Ranked game, wins and
   losses. This is the cheapest and strongest "one more square" line. It was UX-7 last review: check the
   result shows it, not only the Profile.
2. **Technique marks, every week or two.** Each rank shows 2–3 small marks, one per technique family in §5.2.
   A mark lights the first time you win a Ranked square that needed it ("First X-Wing").
   - On the emblem it reads "Archmage ●●○".
   - It's earned, it teaches, and it rewards completion, which is this audience's main driver.
   - It never expires and never needs a grind: the generator makes the next square that needs it.
   - ui-designer owns how the marks look.
3. **Easy first promotions, then longer ranks.** The bands should be narrow at the bottom and widen going up:
   - **Apprentice in the first or second session**, Adept within 1–2 weeks for Ian.
   - Archmage is a month-plus goal; Elomental is for the top ~5–10%.
   - Owner and economy agent set the numbers. This is the player-side intent.
4. **Rank floors at the bottom**, instead of a numeric protection that ends at 200 *and* a half-price loss.
   - Once you've reached Apprentice you can't drop back to Novice, and the same for Adept. Hearthstone's
     ranked floors are the well-known precedent
     ([explainer](https://wecoach.gg/blog/article/the-hearthstone-ranked-system-explained)).
   - The owner wants protection ending around 200, and that is fine *only if* Novice is singles-only and wins
     about 90%. A floor at each early promotion keeps the "I can't lose what I earned" feeling that makes
     losses bearable for this age group.
   - Above Adept, Elo moves freely and demotions stay quiet (as §1.2 says today).
   - Whether a floor is Elo held at the rank's start or only the label is the economy agent's call. The player
     side only needs the name never to step back.
5. **Season proof wins, monthly** (AUDIT #8, still unbuilt): "10 wins at Adept this season" with a dated
   badge. They give the settled player a goal after the climb levels off.

**What not to add:**
- daily Ranked streaks with guilt ("Don't lose your streak!");
- countdowns to the season end on Home;
- "only 3% reach Archmage" pressure copy.

These are the manipulations this audience quits over.

---

## 7. Prioritised list

| # | Severity | Problem | Fix | Impact | Effort | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Critical** | Novice and Apprentice squares go past NYT Hard within about 8 wins; Dana (the majority) quits in week 2 (§4) | Rank-by-technique table §5.2: singles-only Novice, then pointing and naked pair, never adding a technique and cutting clues at the same step | Keeps the largest group in Ranked | M (generator profiles per rank) | engine, economy |
| 2 | **Critical** | Protection plus half-price losses make the climb settle where players win about 1 in 3 (§2) | Target about 3 wins in 4 at the settled rank; honest losses or easier serving; no harder square after two losses | Ranked stops feeling like a test you fail | M | economy |
| 3 | High | Ian's plateau at the X-Wing wall has no explanation and nowhere to learn | One-time technique card per rank, a free first hint per new technique, the result naming the hard step (§5.3) | Turns the wall into the fun | M | ux, ui, web |
| 4 | High | The "Elomentalist" plate (bought) looks like the "Elomental" rank (earned) | Rename the plate, e.g. "Stardust plate"; owners keep it | Protects "earned, not bought" | S | brand, ui |
| 5 | High | Five undivided ranks leave weeks with nothing visibly moving | Bar on every Ranked result, technique marks, narrow early ranks (§6.2) | The "one more square" line every session | S–M | ux, ui, economy |
| 6 | Medium | "About 10 min" isn't true for casual solvers at 24 clues; the slow cut hits their wins | Re-fit par per rank to real solve times; the sheet shows the median for the player's rank | Trust | S once data exists | economy |
| 7 | Medium | Day-1 boredom for experienced solvers | Optional 3-square placement (§5.4) | Keeps the leaderboard's top | M | economy, web |
| 8 | Medium | The brand name and the rank name collide in sentences | Context rules in the voice guide; literal aria | Clarity | S | brand |
| 9 | Medium | Renaming and rescaling existing players | One quiet Profile line; no name goes down from the rescale alone | Avoids "I was demoted" anger | S | economy, web |
| 10 | Low | Casual Hard (28 clues, pair/triple) is easier than Ranked's second rank; nowhere to practise fish | Keep Casual as the comfort mode; add the "Try one" practice square later | Coherent difficulty story | M | engine, web |

### What already works and should stay

- Elo **never resets**.
- **Demotions are quiet.**
- The Ranked sheet now states length, stakes and pauses before Start.
- **Hints are confirmed before the first one in Ranked.**

---

## Sources

- Sudoku.com rules and levels: https://sudoku.com/sudoku-rules/
- SudokuPulse, technique and clue analysis of Sudoku.com and NYT levels (competitor site, unknown sample):
  https://sudokupulse.com/articles/sudoku-difficulty/
- sudokuwiki.org strategy groups (Andrew Stuart): https://www.sudokuwiki.org/sudoku.htm
- Sudoku of the Day difficulty and technique costs: https://www.sudokuoftheday.com/difficulty
- HoDoKu, creating sudokus and levels: https://hodoku.sourceforge.net/en/docs_cre.php
- Good Sudoku, App Store description: https://apps.apple.com/us/app/good-sudoku-by-zach-gage/id1489118195
- MacStories review of Good Sudoku: https://www.macstories.net/reviews/game-day-good-sudoku/
- Sudoku Coach user write-up: https://crescendo.bearblog.dev/sudoku/
- Clue-count guide (one of several, consistent ranges):
  https://www.sudokugames.org/blog/sudoku-difficulty-levels-explained-easy-to-extreme
- Pelánek, Difficulty Rating of Sudoku Puzzles: https://ar5iv.labs.arxiv.org/html/1403.7373
- Sudoku Guru 2026 player survey: https://sudoku-guru.com/info/research-2026/
- Cracking the Cryptic: https://en.wikipedia.org/wiki/Cracking_the_Cryptic
- Roohi et al., Predicting Game Difficulty and Churn Without Players: https://arxiv.org/abs/2008.12937
- Wilson et al., The Eighty Five Percent Rule for optimal learning: https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- Hearthstone ranked floors: https://wecoach.gg/blog/article/the-hearthstone-ranked-system-explained
