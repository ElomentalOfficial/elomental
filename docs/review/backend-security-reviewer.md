# Backend security and integrity review

Reviewer: backend-security-reviewer · Branch `full-review` · 2026-10-20 · Read-only review: no project
file other than this one was changed, nothing was applied or deployed, and the live project
(`xekeiwaxxsmvalezgtyj`) was only read with `SELECT`s, the table list, the migration list, the Edge
Function list and the advisors. No personal data was read. Founder accounts are counted, never named.

**Scope.** All 35 migrations in order (later function versions replace earlier ones; the current
`finish_game` is the one in `20261020054008_dev_mode.sql`), the `audit-solve` and `handoff` Edge
Functions (the live `audit-solve` matches the repo), `supabase/tests/economy.mjs`, and
`packages/web/src/backend/*.ts`.

**Proofs.** These are throwaway PGlite scripts, outside the repo, in `C:\Users\Barsmin\Desktop\Claude\icons\review-sec\`:

| Script | What it proves | Run |
| --- | --- | --- |
| `harness.mjs` | Replays every migration in memory with the same stand-ins as `economy.mjs` (`auth.uid()`, `auth.jwt()` aal) | (imported) |
| `exploits.mjs` | SEC-1, 2, 5, 6, 8, 9 and the verified-safe checks, calling the real public functions as a player | `node exploits.mjs` |
| `bot.mts`, `copyrate.mts` | SEC-3: the exact engine code `audit-solve` runs, against a scripted solver and a plain copier | `node --experimental-strip-types bot.mts` |
| `security.test.mjs` | Draft for `supabase/tests/security.mjs`. Each check describes the safe behaviour, so today it prints **8 FAIL**; once the fixes below land, it should pass | `node security.test.mjs` |

In the proofs, waiting is simulated by moving `games.started_at` back. The server clock sees exactly
that after a real wait.

## Summary table

| ID | Sev | Title | Effort |
| --- | --- | --- | --- |
| SEC-1 | Critical | Casual, Daily and Clash pay for any valid grid, with unlimited games open at once and no daily Stardust cap | Interim S, full L |
| SEC-2 | Critical | Ranked puzzle rating is client-controlled (losses via `p_rating`, wins via the `givens` sent to `audit-solve`) | M |
| SEC-3 | Critical | The solve audit passes a scripted solver, misses ~20% of plain copies, and is an unlimited oracle | L |
| SEC-4 | High | One of the two founder accounts has no verified MFA factor, so aal2 is one enrolment away for anyone who gets that inbox | S |
| SEC-5 | Critical (bounded) | Ranked and Clash pauses take up to 15 minutes off the server clock, which is enough for the full +25% speed bonus | S |
| SEC-6 | Medium | Dev mode leaks into competitive data: the dev-mode founder is #1 on the live leaderboard, and dev tools write no ledger rows | S |
| SEC-7 | Low | Snapshot lag: hidden players stay listed for up to 5 minutes, and banned players show up in search | S |
| SEC-8 | Medium | No rate limits on `start_game`, `square_code` or `audit-solve`: unbounded rows and CPU from free guest accounts | M |
| SEC-9 | Low | Unused `handoff` Edge Function still deployed with `verify_jwt=false`; it can mint magic-link tokens | S |
| SEC-10 | Low | The Founder title is given to an unconfirmed sign-up | S |
| SEC-11 | Low | Grant hygiene: `squares` grants full DML + TRUNCATE to anon; default privileges; no non-negative balance constraint | S |
| SEC-12 | Low | A player banned mid-game still gets Elo for the open Ranked game; unrated wins can flood the review queue | S |

Ratings follow the brief: anything that pays unearned rewards or Elo is Critical.

---

## SEC-1 · Critical · Casual, Daily and Clash pay for any valid grid, with unlimited games open at once

**Where:**
- `public.finish_game`, `20261020054008_dev_mode.sql:187-192`: the only check on a win is
  `private.valid_solution(p_grid)` plus the minimum time.
- `public.start_game` (casual), `20261017192343_ranked_restrictions.sql:111-115`.
- The payout, `dev_mode.sql:208-213` and `:236-286`.

**What's wrong.**
- The server never knows the puzzle. Casual, Daily and Clash games store only a seed, and the
  client builds the puzzle from it. A shared square even ignores the seed (`game.ts:191-198`).
  `finish_game` accepts any 81-character grid that is a valid sudoku, so one memorised grid "solves"
  every Casual, Daily and Clash game.
- `start_game('casual')` has no limit on open games. Several can run at once and one wait covers
  all of them.
- Casual and Clash Stardust has no daily cap. Only parts (first 9 solves a day), Spirit rolls
  (same 9) and influence (first 25) are capped.
- Difficulty is chosen by the client, so a farmer always picks Hard: 15 Stardust and 3 influence.

**Exploit (`exploits.mjs`, SEC-1):**
```
open casual games at once: 20
20 finishes with the SAME grid (not the puzzle's solution): +300 Stardust, 3 parts, profile stardust 300
Daily (seed daily:2026-10-20) "solved" with the same fixed grid: +12 Stardust, month {"done":1,...}
Clash ZZZZZZ (medium) with the same fixed grid: +8 Stardust, time 46s
```
A script that opens N Casual Hard games, waits 46 s and finishes them all earns 15·N Stardust a
minute, with no human solving at all. Anonymous guest accounts are free (captcha permitting), so the
same script also fills every account's 3 parts a day and 25 influence solves a day. Influence decides
the monthly faction war, and the winning faction pays 300 Stardust plus a badge to every member who
took part (`settle_faction_month`, `leaderboard.sql:475-501`). A farm can decide who wins.

**Impact.** Unlimited Stardust: every forge, plate and the Stardust half of "bring to life" bought
without playing. Parts and influence come at the full daily cap without solving. The faction war can
be rigged. Live today: one account has 38 open games, and 171 games are open in total.

**Fix.**

1. *Full fix (L): the server knows each puzzle's answer.* Add `games.givens` and
   `games.solution_hash`, filled at start by a small `start-game` Edge Function. The engine is
   deterministic: generator.ts:81 says "Same seed, same puzzle". A shared square takes its givens
   from `public.squares`, and the function solves them. Then `finish_game` compares hashes.
2. *Interim (S, SQL only):* allow one open Casual game, cap the Clash games open at once, and cap
   Casual and Clash Stardust per day. This stops the multiplier, but a bot that waits 46 s per game
   still farms up to the cap.

```sql
-- 2026xxxx_sec1_game_integrity.sql (draft)
alter table public.games add column givens text check (givens ~ '^[0-9]{81}$'),
                         add column solution_hash text;
-- written only by the start-game Edge Function (service role)
create function private.set_puzzle(p_game uuid, p_givens text, p_solution text) returns void
language sql security definer set search_path = '' as $$
  update public.games set givens = p_givens,
         solution_hash = encode(extensions.digest(p_solution, 'sha256'), 'hex')
   where id = p_game and finished_at is null and givens is null;
$$;
revoke execute on function private.set_puzzle(uuid, text, text) from public, anon, authenticated;

-- Interim: close stale open Casual games (as abandoned, no payout), then one open at a time.
update public.games g set finished_at = now(), won = false, seconds = 0
 where g.mode = 'casual' and g.finished_at is null
   and g.id <> (select id from public.games x where x.user_id = g.user_id and x.mode = 'casual'
                  and x.finished_at is null order by started_at desc limit 1);
create unique index games_one_open_casual on public.games (user_id) where mode = 'casual' and finished_at is null;
-- start_game('casual'): first close the player's open casual game as abandoned:
--   update public.games set finished_at = now(), won = false, seconds = 0
--    where user_id = uid and mode = 'casual' and finished_at is null;

-- finish_game, after the valid_solution check:
--   if p_won and g.solution_hash is not null
--      and encode(extensions.digest(p_grid, 'sha256'), 'hex') <> g.solution_hash then
--     raise exception 'invalid_solution';
--   end if;
-- and, once every client sends givens, refuse to pay when g.solution_hash is null.
-- Interim daily cap on Casual/Clash Stardust (first 20 solves of the UTC day pay in full):
--   if p_won and g.mode in ('casual', 'clash') and solved_today >= 20 then dust := least(dust, 1); end if;
--   (solved_today must then be counted before the Stardust is set; it is counted later today.)
-- Also keep the submitted grid for later review: games.grid text, set to p_grid on a win.
```

**Existing players.** Nothing changes for players' balances. Grids were never stored, so past
farming can't be told apart from honest play in the data; the ledger and `games.seconds` (runs of
wins at exactly the minimum time, many games started within seconds) are the only signals. The
migration closes about 170 stale open games as abandoned, with no payout and no Elo; they are
Casual or Clash, and Ranked is untouched.

**Effort.** Interim S. Full fix L (Edge Function, client change, rollout window while old clients
send no givens).

---

## SEC-2 · Critical · Ranked puzzle rating is client-controlled

**Where:**
- `public.finish_game`, `dev_mode.sql:203-205`:
  `clamp_rating(..., coalesce(audit rating, p_rating, g.rating), target)`.
- `private.clamp_rating`, `20261017112718_ranked_cap_4800.sql:12-21` (target ± 350).
- `audit-solve`, `supabase/functions/audit-solve/index.ts:60-82`: `givens` comes from the request
  body and is never compared with the game's seed.

**What's wrong.**
1. *Losses.* A loss has no audit, so the rating is the client's `p_rating`, clamped to target ± 350.
   Sending target + 350 makes the player the heavy favourite's opponent: the "expected" score drops
   from 0.5 to 0.12, and the loss shrinks by about 75%.
2. *Wins.* `audit-solve` grades and solves whatever `givens` the client sends. It stores that
   puzzle's rating and solution, and `finish_game` then demands only that the grid equals that
   solution. An attacker plays a puzzle of their choice, rated target + 350 (or one already solved,
   or an easy one), and receives Elo for a puzzle 350 points harder than the one they actually
   played. The server never checks that the puzzle is the one the seed would generate.

**Exploit (`exploits.mjs`, SEC-2), both players at Elo 1600:**
```
loss, honest p_rating=target:          1600 -> 1582 (-18)
loss, forged p_rating=target+350:      1600 -> 1596 (-4)
win, honest puzzle at target, 25 min:  1600 -> 1615 (+15, bonus 0.1)
win, attacker givens graded target+350, 46 s: 1600 -> 1631 (+31, bonus 0.25)
```
`bot.mts` shows the server would grade attacker-chosen givens at 844 / 1461 / 2065 for targets
600 / 1200 / 1800. Each one sits near the top of the window, and each passes the audit.

**Impact.** About twice the Elo per win and about a quarter of the loss. Elo climbs steadily even at
a 50% win rate. The leaderboard, the season ranking and faction ranks all sort by Elo. Ranked
influence (`3 + rating/1000`) is inflated too.

**Fix (M).**
```sql
-- 2026xxxx_sec2_ranked_rating.sql (draft): Ranked never takes a rating from the client.
alter table public.games add column target_rating integer;   -- start_game ranked: = target
-- finish_game, replacing the clamp_rating call:
--   g.rating := case
--     when g.mode = 'ranked' then
--       case when p_won and unrated is null and (g.audit ->> 'givens') = g.givens   -- SEC-1 column
--            then private.clamp_rating(g.difficulty, (g.audit ->> 'rating')::integer, g.target_rating)
--            else g.target_rating end                                             -- losses: the target, always
--     else private.clamp_rating(g.difficulty, p_rating, null) end;
```
In `audit-solve`, compare the givens with the game's own puzzle before grading. Either use the
`games.givens` stored at start (SEC-1), or regenerate the puzzle:
```ts
const { data: game } = await admin.from('games')
  .select('id, user_id, mode, finished_at, seed, rating, difficulty, givens').eq('id', body.gameId).maybeSingle();
// ...
if (game.givens && body.givens !== game.givens) {
  audit = { copied: true, reason: 'givens are not this game\'s puzzle' };
} else { /* grade as today, and store givens: body.givens in the audit */ }
```

**Existing players.** Elo already earned stays; there is no reliable way to recompute it, because
`games.rating` was overwritten with the clamped value and the target was never stored separately.
From now on, keep `target_rating` on each game so this can be audited later. As a one-off look, the
owner can list Ranked losses whose stored rating sits 300 or more above `elo_before`.

**Effort.** M.

---

## SEC-3 · Critical · The solve audit passes a scripted solver and is an unlimited oracle

**Where:** `packages/engine/src/audit.ts` (synced to `supabase/functions/_shared/engine/audit.ts`)
and `audit-solve/index.ts:33-97`.

**What's wrong.**
- The audit asks one thing: was each placement a single, or close to one, when it was made? A program
  that solves by logic, placing singles and applying techniques when stuck, is by construction what
  the audit calls "worked out". Move timestamps (`at`) are accepted but never checked against the
  server clock or human pace.
- Even the plainest copy, the solution typed in reading order, escapes on about 1 in 5 puzzles.
- `audit-solve` can be called any number of times per open game. It returns `{copied}` straight
  away, and the full verdict plus the solution are readable from the player's own `games.audit` row
  (RLS lets players read their own games). That makes it a free oracle for tuning a bot.

**Proof:**
```
bot.mts       target 600:  bot 56 moves -> copied=false | reading-order copy -> copied=false
              target 1200: bot 57 moves -> copied=false | reading-order copy -> copied=true
              target 1800: bot 54 moves -> copied=false | reading-order copy -> copied=false
copyrate.mts  reading-order copy flagged 11/15 (300), 12/15 (800), 13/15 (1500), 12/15 (2500)
```

**Impact.** Rated Ranked wins, with Elo, Stardust 20 and parts, for a bot that never shows a human
pattern. The README calls the client-side solution a known gap ("Not covered yet"). The audit closes
less of it than the review flow assumes.

**Fix (L, layered; none is complete without move-by-move server play):**
```ts
// audit-solve: one audit per game, and the moves must fit the server's clock.
const { data: game } = await admin.from('games')
  .select('id, user_id, mode, finished_at, started_at, paused_seconds, audit').eq('id', body.gameId).maybeSingle();
if (game.audit) return reply({ error: 'already_audited' }, 409);              // no oracle
const elapsedMs = Date.now() - Date.parse(game.started_at) - game.paused_seconds * 1000;
const last = moves.at(-1)?.at ?? 0;
const gaps = moves.slice(1).map((m, i) => m.at - moves[i].at).sort((a, b) => a - b);
const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
if (last > elapsedMs + 5000 || median < 1500) audit = { copied: true, reason: 'timing' };
// return only { ok: true }, never the verdict
```
```sql
-- The verdict and solution stop being readable by the player while it matters.
create table private.game_audits (game_id uuid primary key references public.games (id) on delete cascade,
                                  audit jsonb not null, at timestamptz not null default now());
alter table private.game_audits enable row level security;
-- audit-solve writes there (service role, via a private security definer function);
-- finish_game reads it; public.games.audit is dropped after a data copy.
```
Longer term, record moves on the server as they happen: a `play_move` RPC with server timestamps.

**Existing players.** No change. The 14 clean live Ranked wins keep their Elo.

**Effort.** L.

---

## SEC-4 · High · One founder has no verified MFA factor

**Where:** `private.is_admin`, `20261020055607_founder_mfa.sql:18-26`; live `auth.mfa_factors`.

**What's wrong.** `is_admin` accepts any session at `aal2` for a confirmed founder email. Live, one
founder has a verified TOTP factor; the other has only an unverified one (counts only, read-only
query). Supabase Auth lets an account with no verified factor enrol and verify a new one from an
`aal1` session.

**Exploit.**
1. Get into that founder's inbox, or steal an `aal1` session. A magic link is enough.
2. `mfa.enroll()` a new TOTP factor, verify it, and the session becomes `aal2`.
3. `admin_search` now returns players' emails, `admin_moderate` can ban or clear anyone, and dev
   mode is open. This is exactly the threat `founder_mfa` was written to stop.

**Fix (S).**
1. *Operational, now:* the second founder verifies a factor, or that email is removed from
   `private.founders` until they do.
2. *SQL:* pin each founder to their own factor, so a factor enrolled later grants nothing.

```sql
-- 2026xxxx_sec4_pin_founder_factor.sql (draft)
alter table private.founders add column factor_id uuid;   -- set by the owner in the SQL Editor
create or replace function private.is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from auth.users u
       join private.founders f on lower(f.email) = lower(u.email)
       join auth.mfa_factors m on m.id = f.factor_id and m.user_id = u.id and m.status = 'verified'
       where u.id = p_user and u.email_confirmed_at is not null);
$$;
revoke execute on function private.is_admin(uuid) from public, anon, authenticated;
```

**Existing players.** None. A founder without a pinned factor loses Review and Dev mode until the
owner sets `factor_id`.

**Effort.** S.

---

## SEC-5 · Critical (bounded) · Pauses take up to 15 minutes off the server clock

**Where:** `public.pause_game` / `resume_game`, `20261017061526_ranked_pause.sql:11-35`;
`finish_game` wall clock, `dev_mode.sql:181-185`; speed bonus, `:218-223`.

**What's wrong.** Ranked and Clash allow 3 pauses of up to 300 s each, and all of that is taken off
the server time. Only the client hides the board. A player (or a second device, or a screenshot)
keeps solving while paused.

**Exploit (`exploits.mjs`, SEC-5):**
```
16 real minutes -> server time 60s, speed bonus 0.25 (par for 1600 is 1680s)
```
The win gets the full +25% speed bonus. In Clash, the time shown to the friend is 15 minutes faster
than it really was.

**Impact.** Up to +25% Elo on every Ranked win, and unbeatable Clash times. It is bounded by the
need for an audited win, but it is still unearned Elo.

**Fix (S).** Pauses still stop the shown clock, but the speed bonus and the Clash result use the real
elapsed time minus a small allowance.
```sql
-- finish_game (draft): pauses stop the shown clock, not the bonus.
--   raw := greatest(extract(epoch from now() - g.started_at)::integer, 0);
--   secs (shown) stays as today for Casual/Daily; for Ranked/Clash:
--   secs := greatest(raw - least(g.paused_seconds, 120), 0);   -- at most 2 free minutes
--   bonus := private.speed_bonus(raw - least(g.paused_seconds, 120), g.rating);
```
This needs an `economy-designer` / `ux-reviewer` decision on the allowance.

**Existing players.** None.

**Effort.** S.

---

## SEC-6 · Medium · Dev mode leaks into competitive data

**Where:** `public.dev_action`, `founder_mfa.sql:68-111`; the dev exceptions in `finish_game`
(`dev_mode.sql:150, 191, 195, 239`); `private.lb`, `leaderboard.sql:88-111`.

**What's wrong.**
- A founder in dev mode gets unaudited Ranked wins and instant solves, and can set any Elo with
  `dev_action('elo')`.
- That same account is not left out of `private.lb`.
- `fill`, `empty`, `elo` and `unlock_all` change balances without a `private.ledger` row, so the
  ledger no longer adds up to the balance.

**Live:**
- 1 of the 2 leaderboard rows belongs to the dev-mode founder, at global rank 1.
- That account has 1 unaudited Ranked win.

**Proof:**
```
global after dev_action elo 4800: 1.Calm Decoder(4800) 2.Annabel(2000) ... | ledger rows for the founder: 0
```

**Fix (S).**
```sql
-- 2026xxxx_sec6_dev_isolation.sql (draft)
alter table public.profiles add column dev_touched boolean not null default false;
-- dev_set_mode(true): update public.profiles set dev_touched = true ... ;
-- private.lb players CTE: ... and not p.dev_touched     (drop + recreate the materialized view)
-- dev_action: for fill/empty/elo/unlock_all also
--   insert into private.ledger (player_id, reason, ref, stardust, spirits)
--   values (uid, 'dev_' || p_action, p_value, <new - old stardust>, <new - old spirits>);
update public.profiles p set dev_touched = true
 where p.dev_mode or exists (select 1 from private.founder_log l where l.founder_id = p.id and l.action = 'dev_on');
```
The best fix is a separate test account for dev mode, kept apart from the founder's public one.

**Existing players.** The founder's dev-touched account leaves the leaderboard. Nobody else changes.

**Effort.** S.

---

## SEC-7 · Low · Snapshot lag: hidden players stay listed, banned players show in search

**Where:** `private.lb_range`, `leaderboard.sql:169-197` (reads the 5-minute snapshot only);
`public.lb_search`, `:302-335` (filters out hidden players live, not restricted ones).

**Proof:**
```
Beatrix hides herself; lb_page still lists her until the next refresh: true
Annabel banned from Ranked; lb_search still returns: Annabel place=2
```

**Impact.** "Hide me" takes up to 5 minutes to work, which is a privacy expectation. A banned
player's name and stale place stay findable. `player_card` already filters both live, so the screens
disagree with each other.

**Fix (S).**
```sql
-- lb_range: every branch filters live
--   from private.lb r join public.profiles p on p.id = r.id
--   where ... and not p.lb_hidden and not private.ranked_restricted(r.id)
-- lb_search: ..., case when private.ranked_restricted(p.id) then null else r.global_rank end as place
--   (or leave restricted players out of search, as the owner prefers)
```
Places can show small gaps until the next refresh, which is acceptable.

**Existing players.** None.

**Effort.** S.

---

## SEC-8 · Medium · No rate limits on writes that any guest can make

**Where:**
- `start_game` (any mode), `ranked_restrictions.sql:88-151`.
- `square_code`, `20261017224247_square_codes.sql:23-53`: any givens, plus a difficulty and rating
  chosen by the client.
- `audit-solve`, up to 600 moves with `countSolutions` and `grade` on every call.
- Unrated "unchecked" Ranked wins each add a `review_flags` row.

**Proof:**
```
200 open games in one call loop; 50 square codes registered (any givens, client-chosen difficulty/rating)
```
Live: one account holds 38 open games.

**Impact.**
- Table growth and Edge Function CPU from free anonymous accounts.
- Unplayable or mislabelled shared squares ("hard", rating 9999, multiple solutions).
- A flooded founders' review queue.
- `lb_search` has a limit of 30 a minute, but only per account.

**Fix (M).** One generic limiter:
```sql
create table private.rate_hits (key text not null, minute timestamptz not null, n integer not null default 0,
                                primary key (key, minute));
alter table private.rate_hits enable row level security;
create function private.hit(p_key text, p_per_minute integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into private.rate_hits values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, minute) do update set n = private.rate_hits.n + 1 returning n into v;
  if v > p_per_minute then raise exception 'slow_down'; end if;
end $$;
revoke execute on function private.hit(text, integer) from public, anon, authenticated;
-- start_game:  perform private.hit('start:' || uid, 20);
-- square_code: perform private.hit('square:' || auth.uid(), 10);  plus a lifetime cap per creator (e.g. 500)
-- pg_cron: delete from private.rate_hits where minute < now() - interval '1 hour';
```
Also:
- `square_code` should grade the givens on the server (in an Edge Function) rather than trusting
  `p_difficulty` and `p_rating`.
- `audit-solve` gets one audit per game (SEC-3).
- Keep Turnstile on for anonymous sign-ins. The project setting can't be read from SQL, so confirm it
  in the dashboard.

**Existing players.** None. The 162 existing squares stay.

**Effort.** M.

---

## SEC-9 · Low · Unused `handoff` Edge Function still deployed with `verify_jwt=false`

**Where:** `supabase/functions/handoff/index.ts:46-108`. Live: ACTIVE, `verify_jwt: false`.
`public.signin_handoffs` has 32 rows.

**What's wrong.**
- The README says the app no longer calls it, and `signIn.ts:45` only strips an old `handoff`
  parameter.
- It still accepts unauthenticated `start` requests for any email, which writes rows and keeps
  emails in a table.
- On `claim`, it mints a magic-link `hashed_token` for an approved account. Any future bug in
  `approve` would be account takeover, through code that nothing uses.

**Fix (S).**
1. Delete the function in the dashboard (owner approval needed).
2. Then drop the table in a migration (this deletes its 32 rows of emails, which only grow a privacy
   liability):
```sql
drop table public.signin_handoffs;
```

**Existing players.** None. Only the pending, expired hand-off rows go.

**Effort.** S.

---

## SEC-10 · Low · The Founder title is given to an unconfirmed sign-up

**Where:** `private.apply_founder_title`, `20261017093724_founder_title.sql:11-24`. It fires on
insert with no `email_confirmed_at` check.

**Proof:**
```
unconfirmed sign-up with a listed founder email -> profile title: Founder
same account, aal2, unconfirmed: founder_status = {"founder":false,"unlocked":false}
```
Admin powers are not affected. Today both listed founder emails already have accounts, so this only
bites when a new founder email is added before that person signs up. Then anyone could request a
code for that email and carry a public "Founder" badge on the leaderboard and card.

**Fix (S).**
```sql
create or replace function private.apply_founder_title() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.email_confirmed_at is not null
     and exists (select 1 from private.founders f where lower(f.email) = lower(new.email)) then
    update public.profiles set title = 'Founder' where id = new.id;
  end if;
  return new;
end $$;
drop trigger on_auth_user_email_title on auth.users;
create trigger on_auth_user_email_title after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.apply_founder_title();
update public.profiles p set title = null where p.title = 'Founder' and not exists (
  select 1 from auth.users u join private.founders f on lower(f.email) = lower(u.email)
  where u.id = p.id and u.email_confirmed_at is not null);
```

**Existing players.** None. Live, both titled accounts are confirmed founders.

**Effort.** S.

---

## SEC-11 · Low · Grant hygiene and balance constraints

**Live catalogue:**
- `public.squares` grants `anon` and `authenticated` the full set `arwdDxtm` (`square_codes.sql`
  never revoked), so only RLS (with no policies) stands between them and the table. `D` is
  TRUNCATE, which ignores RLS. It isn't reachable through PostgREST, but it is one mistake away.
- `follows`, `badges`, `player_badges` and `faction_months` grant SELECT to `anon`. That's harmless
  today, because the policies are `to authenticated`.
- Supabase's default privileges grant every new public table and function to `anon`, so each
  migration must remember its revokes. The newest ones all did.
- `profiles.stardust` and `profiles.spirits` have no `>= 0` check. Every spend path guards it, but a
  constraint is the last line.

**Fix (S).**
```sql
revoke all on public.squares from anon, authenticated;
revoke all on public.follows, public.badges, public.player_badges, public.faction_months from anon;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter table public.profiles add constraint profiles_balances_nonnegative check (stardust >= 0 and spirits >= 0);
```
Live has 0 rows with a negative balance, so the constraint validates.

**Existing players.** None.

**Effort.** S.

---

## SEC-12 · Low · A player banned mid-game still gets Elo for the open Ranked game

**Where:** `start_game` checks `ranked_restricted` (`ranked_restrictions.sql:100`); `finish_game`
does not.

**Proof (`security.test.mjs`):**
```
FAIL SEC-12 banned player's open Ranked win is unrated (1000 -> 1028)
```

**Fix (S).** In `finish_game`, after the audit block:
```sql
-- if g.mode = 'ranked' and p_won and unrated is null and private.ranked_restricted(uid) then
--   unrated := 'restricted';
-- end if;
```
Also skip `review_flags` inserts for `'unchecked'` when the player already has 20 or more open flags,
so one account can't fill the founders' queue.

**Existing players.** None.

**Effort.** S.

---

## Proposed test: `supabase/tests/security.mjs`

Copy `C:\Users\Barsmin\Desktop\Claude\icons\review-sec\security.test.mjs` into the repo, with the
harness setup inlined as in `economy.mjs`, and add it to `npm run test:db`. Today's output, where
every FAIL is an open hole:
```
FAIL SEC-1 one open Casual game per player (open: 2)
FAIL SEC-1 a valid grid that isn't this puzzle's solution pays nothing (dust 15)
FAIL SEC-2 forged p_rating doesn't soften a loss (-18 vs -4)
FAIL SEC-6 dev-mode account not on the leaderboard (listed: 1)
FAIL SEC-6 dev tools leave a ledger trail (0 rows)
FAIL SEC-7 a hidden player leaves the list straight away
FAIL SEC-10 unconfirmed sign-up gets no Founder title (Founder)
FAIL SEC-12 banned player's open Ranked win is unrated (1000 -> 1028)
```
Note that the second SEC-1 check needs the server-side solution (`games.solution_hash`); its test
must set that column for the game, the way the Edge Function will.

## Verified safe

Each item was checked in code, and by proof or the live catalogue where noted.

**Replays and settlement**
- **No double settle.** `finish_game` locks the game `FOR UPDATE` and refuses `already_finished`
  (proof). It also refuses other players' games with `no_game` (proof).
- **Daily caps hold under races.** Concurrent finishes serialise on the profile `FOR UPDATE` lock
  before `solved_today` is counted. Under READ COMMITTED, the second finish re-reads a fresh profile
  and counts the first game.
- **`too_fast` and `invalid_solution` are enforced** (proof). Ranked and Clash time comes from the
  server only. Casual and Daily take the client's seconds, capped at the wall clock (paused time
  excluded), and must still be at least the minimum.

**Spending**
- **No negative balance or double spend.** `forge_part` (catalogue row lock plus PK), `polish_part`
  (part row lock), `buy_plate` (profile lock), `mend_daily` (profile lock, PK, 3 a month) and every
  Stardust or Spirit debit are conditional updates (`where stardust >= cost`) that raise when nothing
  was updated. Live: 0 negative balances.
- **Duplicate parts, badges and faction pay-outs.** `player_parts`, `player_badges`, `drops` and
  `faction_months` primary keys with `on conflict do nothing`; `settle_faction_month` is idempotent
  (proof in `economy.mjs`, run twice).

**Functions and grants**
- **Every function** in `public` and `private` has `search_path=''`.
- **Every public RPC** has anon EXECUTE revoked and is granted to `authenticated` only (live
  `has_function_privilege`).
- **Every private function** is revoked from anon and authenticated, and the `private` schema has no
  USAGE for either (live). `private.lb`, `ledger`, `founders`, `founder_log`, `review_flags` and
  `moderation_log` can't be reached (proof: "permission denied for schema private").
- **RLS** is on for every table. Player tables are readable only by their owner (`profiles`,
  `games`, `drops`, `player_parts`, `avatar_loadouts`, `affinity_months`, `daily_mends`, `follows`,
  `player_badges`); `clashes`, `squares` and `signin_handoffs` have no client policy. No client
  INSERT, UPDATE or DELETE grants except on `squares` (SEC-11).
- **pg_graphql is not installed.** No second API surface.
- **Extensions:** `pg_trgm`, `pgcrypto` and `uuid-ossp` live in `extensions`; `pg_cron` is in
  `pg_catalog` (Supabase default); `cron` has no anon or authenticated USAGE. The advisor's
  `cron.job` warning is noise.
- **pg_cron jobs** (`lb-refresh` every 5 minutes, `faction-settle` on the 1st at 00:05 UTC) run as
  `postgres` and call only private functions.

**Founders and moderation**
- **Admin needs both an aal2 session and a confirmed founder email**, checked on every call
  (`admin_*`, `founder_activity`, `dev_*`, `dev_on` inside `finish_game` and `drop_part`).
  `auth.jwt()` comes from the verified JWT and can't be set through PostgREST. A plain player at aal2
  gets `not_admin` (proof). The gap is the one in SEC-4.
- **`founder_log` and `moderation_log`** are written only by security definer functions, and no
  client can write them.

**Data exposure**
- **Leaderboard and search responses carry no emails or personal data.** They return id, name,
  title, Elo, plate, avatar, frame, affinity, country and place. Anonymous guests are excluded
  everywhere (`lb`, `lb_search`, `follow`, `player_card`, `faction_board` top 10). Admin email
  search is founders-only.
- **Clash:** the table can't be read; `get_clash` and `my_clashes` show only finished results;
  Clash never touches Elo. Ranked restart counts the open game as a loss (no fishing). Restricted
  players can't start Ranked.
- **`equip_part`'s dynamic SQL** uses `%I` on a whitelisted slot. `set_showcase` and `follow` check
  ownership and visibility; follows are capped at 500.
- **No secrets in the repo.** The publishable key and Turnstile site key in `client.ts` are public
  by design. The service role key appears only through `Deno.env` in the Edge Functions.

**Advisors.** 38 "security definer executable by authenticated" findings are intended (that is the
API). "RLS enabled, no policy" on the private tables, `clashes` and `squares` is intended. "Leaked
password protection" doesn't apply, because sign-in uses only email codes and links.

Not verified (dashboard-only settings): that the Turnstile captcha is actually switched on for
anonymous sign-ins and OTP emails, and the Auth rate limits.
