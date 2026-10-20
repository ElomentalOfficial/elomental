# Leaderboard — design and build (2026-10-20)

Decisions agreed with the owner before building:

| Question | Answer |
| --- | --- |
| What the winning faction gets each month | A dated winner's badge on the card, and 300 Stardust, for every player who added influence to the winning side that month |
| Friends | **Follow**, one-way: no requests, no notifications, nothing to accept or decline |
| Regional | An optional **country** the player picks in Setup (off by default); the Country view ranks only players who set one |
| Seasonal | **Elo gained this season** (since Season Alpha began), so new and returning players can top it |

Words used on screen follow `docs/BRAND_VOICE.md`: the factions are the **affinities** (Fire, Water, Earth, Air) and the monthly fight is their **influence**; "war" stays out of the UI.

---

## 1. Vision and key decisions

**The leaderboard is a calm trophy room, not a stock ticker.** Players are 35–45 and come for a few minutes at a time. One view at a time, one question answered per view: *where am I, who's near me, who's best.*

- **Clarity first.** Every row reads left to right in the same order: place, avatar, name, rank, Elo. Text never below 14px; numbers in the label size (20px) with tabular figures, so columns line up.
- **Prestige second.** The top 3 get a metal medallion (gold, silver, bronze); places 4–100 a quiet laurel tick. No glow, no confetti, no animation on rows: prestige is shown by materials, not motion.
- **Decoration last.** Cosmetics live in fixed slots (§4) that are always the same size, so a decorated player and a new one line up perfectly; a missing cosmetic leaves a clean default, never an empty hole.
- **Your place is always one tap away.** A "You" bar is pinned to the bottom of every view, with your place in *that* view; "Show me" jumps to your spot with the players just above and below.
- **Friends is the default view** once you follow anyone: comparing with people you know is more motivating than rank 48,000 of everyone.
- **Lists change every 5 minutes, not every second** (§5.4): a list that reshuffles under your thumb is unreadable; the snapshot time is printed ("Updated 3 min ago"). Your own Elo is always live.
- **Only server-settled, rated, unflagged results count.** The rankings read Elo the server computed (`finish_game`), and leave out guests, hidden players and anyone restricted by Review.

## 2. Patterns from the best, and mistakes to avoid

Borrowed (patterns, never names or art):

- **Pinned own row** (common in ranked competitive games): your row stays visible at the bottom while you scroll the top of the list. We pin it and add a "Show me" jump.
- **"Around me" window** (mobile strategy and card games): rather than a page number, show the 10 above and 10 below you, which is the only part of a huge ladder that feels reachable.
- **Tier ladder with distribution** (team-shooter and MOBA ranked screens): seeing "Adept: 31% of players" turns a number into a goal. One sheet, opened from the rank emblem.
- **Friends-first** (car-football and brawler games default social views to friends): we make Friends the default once you follow someone.
- **Profile card as a showcase** (collectible card games and MOBAs): a fixed frame with a few slots the player curates (a showcase of three) rather than a dump of everything owned.
- **Season ladders separate from all-time** (auto-battlers, card games): Seasonal ranks what you did *this* season, so the all-time list doesn't freeze newcomers out.
- **Team progress as one bar** (faction events in mobile games): a single proportional bar with the leader named in words.

Mistakes to avoid:

- **Live-ticking ranks** that jump while you read; tiny rank text; unexplained abbreviations.
- **A wall of badges and effects on every row** (rows become unreadable once cosmetics arrive): rows get exactly three cosmetic slots (avatar frame, name plate, faction mark).
- **Hiding your own rank** when you're far down ("unranked" for anyone below 10,000): we always show your number.
- **Leaderboards that include cheated scores** until someone reports them: we read only settled, unflagged Elo, and Review can restrict a player, which removes them on the next refresh.
- **Friend requests that become spam and pressure**: one-way follow, private.
- **Search that needs an exact name or a #tag**: we match partial names and typos; names are unique already, so no tags are needed.

## 3. Layout spec

### 3.1 Phone (390 wide)

```
┌───────────────────────────────┐
│ ‹  LEADERBOARD                │ header (subPage), Back fixed
├───────────────────────────────┤
│ AFFINITIES · OCTOBER          │ faction card (§3.3), tap → sheet
│ [Fire████|Water██|Earth███|Air█]
│ Fire leads Water by 12% · 11 days left
│ You: +54 influence · 12th in Fire
├───────────────────────────────┤
│ 🔍 Find a player…             │ search field (§3.4)
├───────────────────────────────┤
│ [Friends][Global][Fire][Season][Country]  segmented, scrolls sideways
│ Updated 3 min ago     Ranks › │ tier sheet link
├───────────────────────────────┤
│ ① (av) Name on plate   2840  │ top-3 medallion
│ ② (av) Name            2790  │
│ ③ …                           │
│ 4  (av) Name  ▣ Adept   930  │ rows: place · avatar+frame · name/plate · tier · Elo
│ …                             │
│      [ Show more ]            │ 50 per page
├───────────────────────────────┤
│ YOU  #48,012  (av) Daria 1530 [Show me] │ pinned bar
└───────────────────────────────┘
```

### 3.2 Larger screens (≥ 900 wide)

```
┌──────────────────────────────────────────────────────────────┐
│ ‹  LEADERBOARD                                               │
├──────────────────────────────────┬───────────────────────────┤
│ 🔍 Find a player…                │ AFFINITIES · OCTOBER      │
│ [Friends][Global][Fire][Season]…│ bar, leader, time, prize  │
│ Updated 3 min ago       Ranks › │ You: +54 · 12th in Fire   │
│ ① …                              │ Top in Fire: 1. … 2. … 3. │
│ ② …                              ├───────────────────────────┤
│ …                                │ YOUR CARD (mini show-off) │
│ [ Show more ]                    │ RANKS: 5 tiers + share    │
└──────────────────────────────────┴───────────────────────────┘
```
The list column is capped at the phone column width × 1.4 so lines stay short; the right column holds what the phone puts in sheets.

### 3.3 The affinities this month (strength bar)

- The leader first: its element mark on its colour, its name, "Leading", and its share (30%).
- One bar of four segments, strongest first, each as wide as its share of **strength**, the side's influence per active player (how the month is won, so small sides can still win), over the four together; the shares are rounded to add to exactly 100%.
- Under it, the four sides named with their shares; then "Strength: each side's influence per active player, as a share of 100%. The strongest side wins the month."
- Then "12 days left · Winners get a badge and 300 Stardust", and yours: "You: +54 influence · 12th in Fire" (or "Choose an affinity to join in").
- Element colours sit only on shapes; all text is in the text colour, so it reads on every surface.
- Details → sheet: the four elements with members, total influence and per-player strength; the prize; last month's winner; **top 10 in your affinity** (hidden players left out).
### 3.4 Search

- A field at the top. Typing (3+ characters, after 300 ms pause) searches names: prefix matches first, then similar names (typo tolerant, trigram similarity), up to 20 results; each shows avatar, name, rank, place.
- A result opens the show-off card, which has **Follow** and **Show on leaderboard** (jumps the Global view to that player).
- Rate limit: 30 searches a minute per player (server-side); past that, "Slow down a moment" for the rest of the minute.
- Names are unique (set_display_name refuses a taken one), so duplicates can't be confused; similar names are told apart by avatar, rank and place.

### 3.5 Show-off card

```
┌──────────────────────────────┐
│ [card background — later]    │
│        ( avatar + frame )    │ avatar slot (alive = moves), frame slot
│        [ Name on plate ]     │ name plate slot (+ name effect, later)
│   ▣ Adept · 🔥 Fire · RO     │ tier emblem, title, faction, country (if shown)
│   1530 Elo · Peak 1612 · #48,012
│   140 solved · 80 ranked     │ stats line (if shown)
│   🏅 Winner Oct 2026 …       │ badges row (up to 4, then "+n")
│   SHOWCASE  [ ][ ][ ]        │ 3 chosen parts
│ [ Follow ]  [ Full profile ] │
└──────────────────────────────┘
```
- A new player sees: Happy avatar, no plate, tier emblem, Elo, and three dashed showcase outlines on *their own* card only (others see the row collapsed when empty). Nothing looks broken.
- Hidden players aren't listed or searchable; a stale link shows "This player keeps their card private."
- Restricted players (Review) don't appear in rankings; their card says "Not ranked".

## 4. Cosmetic slot map

| Slot | Row | Card | Today | Store, later phase |
| --- | --- | --- | --- | --- |
| Avatar picture | 40px | 128px | Avatars (11 + Happy) | New avatars; animated versions via Polish |
| Avatar frame | ring | ring | Frames (12) | Premium frames |
| Name plate | behind name | behind name | 4 plates | Plate styles, seasonal plates |
| Name effect | — | on the name | — | Shimmer, ink, embers (respect Reduce motion) |
| Card background | — | top band | default surface | Backgrounds, animated ones |
| Banner | — | behind the avatar, top of card | — | Banners (seasonal, faction) |
| Badges | — | 3 chosen (the newest if none chosen); all on the full profile | Monthly affinity wins | Store badges and event badges (`public.badges.source`: earned, store, event) |
| Emote | — | small button on the card | — | Emotes played on open (sound off by default) |
| Row accent | left edge 3px | — | — | Never sold: rows stay uniform |

Monetization notes: rows get only avatar, frame and plate, so paying never makes the list harder to read; every slot has a free default; badges come earned, bought or from events, and each says where it came from, so a bought badge never passes for a won one; animated cosmetics pause under Reduce motion; cards render the same size whatever is equipped, so cosmetics can't push content around.

## 5. Data and API

### 5.1 Tables and columns (migration `leaderboard`)

- `profiles` + `country text` (ISO-3166 alpha-2), `lb_hidden boolean` (leave every list and search), `card_stats boolean` (stats line on the card), `showcase text[]` (≤ 3 owned badge ids).
- `badges (id, source)`: the catalogue; `source` is earned, store or event.
- `follows (follower, followee, created_at)`: one-way; max 500 per player; read your own only.
- `player_badges (player_id, badge, earned_at)`: e.g. `win-2026-10-fire`.
- `faction_months (month, winner, settled_at)`: the settled monthly results.
- `private.search_hits (player_id, minute, n)`: rate limit.
- `private.lb` (materialized view, refreshed every 5 minutes): every rankable player (registered, rated at least once, not hidden, not restricted) with `global_rank`, `faction_rank`, `country_rank`, `season_gain`, `season_rank`, and what a row shows (name, plate, avatar, frame, alive, title, affinity, country, Elo).

### 5.2 Functions (all `security definer`, `search_path = ''`, signed-in only)

| Call | Returns |
| --- | --- |
| `lb_page(view, page, scope)` | 50 rows of a view: `global`, `friends`, `faction` (scope = element, default yours), `season`, `country` (scope = code, default yours) |
| `lb_around_me(view, scope)` | 10 above, you, 10 below (you computed live if you're hidden or new) |
| `lb_me(view, scope)` | your place and total in that view, for the pinned bar |
| `lb_tiers()` | for each rank: Elo floor and share of ranked players, counted by the rank shown (`rank_tier`, with its 50-Elo grace; `ranked_ladder`) |
| `lb_search(query)` | ≤ 20 players, prefix then trigram similarity; rate-limited |
| `player_card(player)` | the show-off card, with privacy applied |
| `follow(player)`, `unfollow(player)` | — |
| `set_card_privacy(...)`, `set_country(code)`, `set_showcase(parts[])` | — |
| `faction_board()` | standings, leader, time left, prize, your influence and place, top 10 in your affinity |

### 5.3 Indexes

`private.lb`: unique `(id)`, `(global_rank)`, `(affinity, faction_rank)`, `(country, country_rank)`, `(season_rank)`. `profiles`: GIN trigram on `lower(display_name)`, btree on `lower(display_name) text_pattern_ops` for prefixes. `follows (follower)`. `affinity_months (month, affinity, influence desc)`.

### 5.4 What's live and what's on an interval

| Live | Every 5 minutes | Monthly |
| --- | --- | --- |
| Your own Elo, influence, and card; follow/unfollow; search | All ranks and places (snapshot `private.lb`) | Faction settlement: winner, badges, 300 Stardust (1st of the month, 00:05 UTC) |

Why: ranking hundreds of thousands of players on every request is expensive and makes the list jump while you read it; a 5-minute snapshot is cheap (indexed by rank, so a page or an "around me" window is a range read) and still fresh enough for a game where a ranked match takes 10+ minutes. Your own numbers are live because that's what you're watching.

## 6. Implementation

- `supabase/migrations/…_leaderboard.sql`: everything in §5.
- `packages/web/src/backend/leaderboard.ts`: the calls.
- `packages/web/src/screens/leaderboard.ts`: the page, the affinity card and sheet, search, the tier sheet.
- `packages/web/src/playerCard.ts`: the show-off card (also used by the full profile of another player).
- `packages/web/src/screens/privacy.ts`: Setup > Leaderboard and card (country, hide me, stats, country on card).
- Profile: a Badges section (every badge you own; choose the three on your card).
- `packages/web/src/badges.ts`: badge medals (vector) and names.
- Tests: `supabase/tests/leaderboard.mjs` and `season.mjs` (ranks, around-me, privacy, follows, search, settlement), e2e a11y.

## 7. States and readability

- **Loading:** rows keep their height with a quiet placeholder bar (no spinner jumping); the pinned bar shows "Finding your place…".
- **Empty:** Friends with nobody followed: "Follow players to compare with them here" + search focus. Country without a country set: "Choose your country in Setup to see this list" + button. A faction with no one yet: "Nobody in Water yet this month."
- **Not ranked yet** (no rated game): pinned bar says "Play a Ranked game to get your place".
- **Hidden:** pinned bar: "You're hidden. Your place would be #1,204." with a way to Setup.
- **Offline / error:** "The leaderboard needs a connection." with Try again; the last snapshot stays if it was loaded.
- **Readability check:** text ≥ 14px (names and Elo 16–20px), all colour pairs in `scripts/contrast.ts`, top-3 medallions carry the number in text, elements are named in words beside their colour, 200% text size tested, every control a real button with a literal label, the card opens through `openModal`.
