# Cycles and wipes (2026-10-22)

How Elomental's monthly faction war and its Ranked seasons start, end and pay out. Built on
what was there (influence kept per month, `faction_months`, the `seasons` table); migration
`cycles`. Owner's calls: a **soft Elo reset** each season, **Stardust is permanent**, the
**faction choice lasts the month** (switchable once, in your first 5 days in a faction), a season pays a **badge for
the best rank reached**.

## 1. The idea

Nothing is deleted. Every piece of progress is either keyed by its cycle (so a new cycle simply
starts with no rows) or permanent. "Wiping" is three small steps, run by one scheduler:

```
            hourly cron ─► private.run_cycles(now)
                               │  (skips while cycle_config.hold_until is ahead)
                               ├─► every unsettled past month, oldest first:
                               │     private.settle_faction_month(month)      FACTION → PERMANENT
                               └─► every ended, unclosed season, oldest first:
                                     private.close_season(id)                  SEASON  → PERMANENT
                                       one transaction: snapshot → badges → Elo reset → next season
```

- **Faction month:** influence rows are keyed by month (`affinity_months.month`), so the new
  month needs no reset: the first solve after 00:00 UTC on the 1st writes a new month's row.
  Settling = picking the winner and paying it (badge, Stardust), recorded in `faction_months`.
- **Season:** Elo has to start each season lower, so it's the one real reset. `close_season`
  first copies every player's season into `season_results` (permanent history), grants the
  season badge, then soft-resets Elo, then opens the next season row. All in one database
  transaction: if anything fails, nothing happened, and the next hourly run tries again.
- **Order on the 1st of January and July:** the month is settled before the season closes
  (a faction win's Stardust lands before the season's history is written), always.

Why one transaction and not a step-by-step state machine: at Elomental's size the whole close
is milliseconds of set-based SQL. A transaction is all-or-nothing by itself, so rewards can't be
granted without the reset or the reset without the rewards, and a crash can't leave a half
state to resume. If players ever number in the hundreds of thousands, split it into steps keyed
by `cycle_runs` (the table is already there for that).

## 2. Data by tier

| Data | Tier | Where |
|---|---|---|
| Influence and solves for your side this month | FACTION | `affinity_months (month, player_id)`, rows kept forever as history |
| Faction month result (winner, winners) | PERMANENT | `faction_months` |
| Elo, shown rank (`rank_tier`), loss run | SEASON | `profiles.elo`, `rank_tier`, `ranked_loss_run` (reset by `close_season`) |
| The Season board (best Elo, 20 games) | SEASON | computed from `games` since `season_since()`: a new season starts it empty |
| Faction choice | MONTH | `profiles.affinity`, switchable once a month, in your first 5 days in a faction (faction_switch) |
| Calls of a Spirit this season (its price) | SEASON | counted from the ledger since the season's start |
| A player's season, final Elo, best Elo and rank, games, place, Elo after reset | PERMANENT | `season_results (season_id, player_id)` |
| Account level and XP, Stardust, Spirits, parts and avatars, badges, title, name plate | PERMANENT | `profiles`, `player_parts`, `player_badges` |
| Seasons and their dates | PERMANENT | `seasons (id, name, starts_at, ends_at, closed_at)` |
| Scheduler log | PERMANENT | `private.cycle_runs` |

The parts on offer follow the **parts season**: the newest season that has parts
(`private.parts_season()`), so a new Ranked season can open before its art is ready and drops
keep working. (The beta-only dev tool "Unlock every part" still follows the Ranked season.)

## 3. Config

One row, `private.cycle_config`, changed by SQL (it's the owner's call each time):

| Field | Default | Meaning |
|---|---|---|
| `season_months` | 6 | length of the **next** season opened, 1 to 12 months; seasons always start and end at 00:00 UTC on the 1st |
| `elo_reset` | `soft` | `soft`, `hard` (back to the start) or `keep` |
| `elo_start` | 100 | a new account's Elo, and where a hard reset goes |
| `elo_keep` | 0.4 | soft reset: `start + (elo − start) × keep`, rounded (1600 → 700, 1200 → 540, 800 → 380) |
| `elo_floor_one_rank` | false | on: a soft reset never drops a player more than one rank below the rank shown |
| `season_badge_games` | 20 | Ranked games for the badge, per 6 months of season (a 1-month season asks for 4) |
| `season_badge_wins` | 3 | the badge's rank is the highest rank **won** at least this many times (not one lucky peak) |
| `faction_win_stardust` | 300 | paid to a winning side's members with enough solves |
| `faction_win_solves` | 5 | solves in the month to count and be paid |
| `hold_until` | null | postpones every settle and close until then (the admin "postpone") |

Changing `season_months` mid-season changes nothing now: the current season's `ends_at` is fixed
when it opens. To end the current season at another date, use `private.set_season_end` (§6).

Reward tables: the faction prize is the two numbers above; the season badge is
`season-<id>-<rank>` for the highest rank won 3 times (`season-0-adept`), one badge, no Stardust.

Only players who played Ranked in the season are reset: someone away for a season keeps their
Elo (economy review: repeated resets while away would punish absence). The keep is the owner's
call: a firm 40% with no floor, so each season is a real climb (the economy review had suggested
60% with a one-rank floor; both are one config change away).

## 4. The jobs

- `private.run_cycles(p_now)`: what the hourly cron calls (`'5 * * * *'`). Catches up on
  anything missed (a database that was paused for a week settles every month it missed, in
  order, then closes the season). Logs each step in `cycle_runs`.
- `private.settle_faction_month(month)`: as before, now reading its prize from the config.
  Idempotent: a month already in `faction_months` returns at once.
- `private.close_season(id, p_now, p_dry_run)`: idempotent (a closed season returns at once).
  Dry run returns who gets what and each Elo before and after, writing nothing.
- Games in flight: a Ranked game started before the end and finished after counts in the new
  season, on the reset Elo. No maintenance window: the close locks the profiles table for its
  milliseconds, so a game finishing at that instant waits and lands after the reset (without the
  lock its result could be overwritten: security review). (The trade-off: a game finished at 00:00:30 lands in the
  new season. A lock window would make players wait instead, for no fairer result.)

## 5. What the app gets

- `public.cycle_info()`: the server's time, this month (start, end), this season (id, name,
  start, end). The app counts down with its own clock corrected by the server's, and shows
  local times; everything is stored and computed in UTC.
- `public.cycle_news()` and `public.cycle_news_seen()`: the "While you were away" sheet on Home
  after a season or a faction month ended since the player last looked: each season's best
  rank, badge and new Elo, each month's result for their side. A player away for three seasons
  sees all three; everything was already paid and reset while they were gone.

## 6. Admin (SQL editor; founders, with Claude)

| Need | How |
|---|---|
| Preview a close | `select private.close_season(0, now(), true);` |
| Close now (manual trigger) | `select private.set_season_end(0, now()); select private.run_cycles();` |
| Postpone everything | `update private.cycle_config set hold_until = '2027-07-03';` |
| Move a season's end | `select private.set_season_end(0, '2027-08-01');` (the next season then ends on its own 1st-of-month boundary) |
| Roll a close back | `select private.reopen_season(0);`: Elo back to before the reset (keeping any change since), its badges removed, the next season removed if no game was played in it |
| Look at what ran | `select * from private.cycle_runs order by at desc;` |

## 7. Edge cases

| Case | Handling |
|---|---|
| Months of 28 to 31 days, leap years | Boundaries are always the 1st, computed with `date_trunc('month')` plus whole months in UTC: 29 February never appears as a boundary |
| A season postponed to the 3rd | The next season still ends on a 1st: `date_trunc('month', start) + months` |
| Cron missed for days | `run_cycles` settles every missing month oldest first, then closes the season |
| Crash or error mid-close | One transaction: rolled back whole, the next hourly run does it again |
| Run twice, or by hand while the cron runs | A closed season and a settled month return at once; the close locks its season row first, so two runs can't both pass the check |
| Faction month and season end the same night | Month first, then season, inside the same run |
| Player offline across several cycles | Paid and reset with everyone; "While you were away" lists each |
| Game started before the end, finished after | Counts in the new season, on the reset Elo |
| Game finishing during the close itself | Waits on the profiles lock, then applies to the reset Elo: never lost, never counted twice |
| A close that keeps failing | Logged hourly in `cycle_runs` as `failed`; the season stays current. Check `cycle_runs` after each 1st of January and July |
| Rollback details | `reopen_season` restores Elo but not the loss run or a faction switch made in the removed season; a re-close resets only what was played since |
| A restricted (banned) player | Their season counts from the restriction, as the Season board does; no badge unless 20 games after it |
| Test (dev) accounts | No badge and no faction prize, as for every other reward |
| New season without parts yet | Drops and the Forge keep offering the newest set that exists |
| `season_months` changed | Applies to the next season opened, never the current one |
| Rollback after players played on | Elo goes back by the reset's amount, keeping their games since |
