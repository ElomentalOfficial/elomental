# Supabase backend

Project `elomental` (ref `xekeiwaxxsmvalezgtyj`, Frankfurt, free plan).
The app talks to it from `packages/web/src/backend.ts`.

## What lives here

| Table | Holds | Clients can |
| --- | --- | --- |
| `profiles` | name, Elo, ranked games, Stardust, crowns, pity | read their own row |
| `games` | every signed-in game: seed, server start time, result, payout | read their own games |
| `clashes` | Clash codes and their difficulty | read (signed in) |
| `squares` | Square codes: the exact puzzle behind each code | only through the functions below |

Clients never write to tables. Everything goes through these functions
(signed-in players only):

- `start_game(mode, difficulty?, date_key?, clash_code?)` picks the seed
  (Ranked and Casual are random; Daily uses the date; Clash uses the code),
  picks the Ranked target rating from Elo (private.ranked_target: the player's Elo up to
  1200, then a third as fast, up to 1800 at 3000 Elo, so a square stays about 10–15 minutes;
  the client generates a puzzle rated close to it), and starts the
  server clock. Each
  player gets one Daily per day and one attempt per Clash code. Leaving a
  Ranked game open and starting another counts the first one as a loss.
- `finish_game(...)` settles the game once. It checks that the grid is a valid
  sudoku and rejects impossibly fast solves (under 15/30/45 s). Ranked and
  Clash are timed by the server. It then pays out Stardust, parts, Spirits and Elo. Ranked Elo
  is priced as an even match against the player's own Elo (held to 150..3000,
  private.ranked_opponent); a square easier than its target (the audited rating,
  clamped to target ± 350, with 100 of slack) is discounted, a harder one earns nothing extra;
  par (10 to 15 minutes, for the speed bonus) goes by the target.
- `get_clash(code)` and `my_clashes()` return both players' Clash results.
- `leaderboard(limit)`: the top players by Elo.
- `set_display_name(name)`
- `square_code(givens, difficulty, rating)` and `get_square(code)`: every
  puzzle's shareable square code (8 characters, shown as K7P2-QX9M). The same
  puzzle always gets the same code, and the code stores the puzzle itself, so
  it keeps working whatever changes in the generator. A shared square plays
  as Casual.

Migrations are in `migrations/` (already applied to the project).

## Dashboard settings

Done (2026-10-17):

1. **Authentication → URL Configuration** (moved to the custom domain on 2026-10-19)
   - Site URL: `https://elomental.online/`
   - Redirect URLs: `https://elomental.online/**`, `https://www.elomental.online/**`,
     `https://barsmin.github.io/elomental/**` (old address, for links sent before the move)
     and `http://localhost:5173/**`
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON.**
   Every guest gets a hidden account on first launch, so their games are
   settled on the server from the start. Signing up with an email later keeps
   all of their Stardust, Elo and Daily streak. Anonymous guests never appear
   on the leaderboard. Supabase recommends turning on a captcha for anonymous
   sign-ins before launch.
3. **Email provider → Secure email change: OFF.** A guest account has no old
   email to confirm.
4. **Attack Protection → Captcha: Cloudflare Turnstile** (widget "Elomental" in
   Cloudflare, hostnames elomental.online and localhost). The site key is in
   packages/web/src/backend/client.ts; the secret key lives only in Supabase.
   The app sends a token with the guest sign-up and the sign-in email
   (backend/captcha.ts). Turn it on only after an app version with the site
   key is live, or new guests and sign-in emails are refused.

How sign-up works with the default emails (link only): a guest enters an
email, and Supabase sends a confirmation link. Tapping it confirms the email on
the server, wherever it opens (Safari included). The app waits on screen and
continues by itself once the account has the email.

**Emails go through Brevo** (custom SMTP, Authentication → Emails → SMTP
Settings): host `smtp-relay.brevo.com`, port 587, sender name "Elomental"
from the founder's Gmail address (verified as a Brevo sender). The SMTP
login and key live only in Supabase and Brevo.
- Without it, Supabase's built-in mailer only delivers to members of the
  Supabase team, so players couldn't sign up.
- Auth email rate limit: 30/hour (Authentication → Rate Limits); Brevo's free
  plan sends up to 300/day.
- Before launch, consider a domain of our own (e.g. login@elomental.app,
  verified in Brevo or Resend): mail "from" a Gmail address sent by a third
  party is more likely to land in spam.

**Removed (full review B11):** the `handoff` Edge Function and its `signin_handoffs`
table (migration `ranked_integrity`). It let the installed iPhone app sign in when the
email's link opened in Safari; the typed code below replaced it. Delete the function
in the dashboard (Edge Functions → handoff) if it's still listed.

**Typed code (2026-10-19):** every sign-in email also carries a code
(`{{ .Token }}`) that can be typed into the app on any device, for when the
link won't open or opens somewhere else (`verifyEmailCode` in
packages/web/src/backend/signIn.ts). The **Magic link**, **Confirm signup** and
**Change email address** templates (Authentication → Emails → Templates) must
show `{{ .Token }}`; without it the app asks for a code the email doesn't have.

**Branded templates:** `node supabase/templates/build.mjs` writes
`magic-link.html`, `confirm-signup.html` and `change-email.html` (subject for all
three: `{{ .Token }} is your Elomental code`). Their button opens
`{{ .SiteURL }}?token_hash=…&type=…&r={{ .RedirectTo }}`, so the link stays on
elomental.online and mail scanners that pre-open links can't use the token up;
the app verifies it on load (`signInFromEmailLink`). Paste them into the
dashboard only once an app version with `signInFromEmailLink` is live.

## Reviewing flagged players

Ranked wins typed in from a solver are left unrated and flagged (Edge
Function `audit-solve`, migrations `solve_audit*` and `ranked_integrity`). The audit runs
once per game: it regenerates the puzzle the game dealt from the server's seed and checks
the solved one is it, checks the moves' timing against the server clock (half the moves
quicker than 0.7 s apart, or moves after the game's own clock, count as scripted), and
replays the moves. Its verdict is kept in `private.game_audits`, which players can't read.
`start_game` and `square_code` are rate limited (`private.hit`: 20 starts, 10 new codes a
minute per player).

**In the app:** sign in with a founder account, then Setup → Review. Three
tabs:
- **To review**: one row per player with flags still open, worst first, 25
  at a time. Open a row for why and the buttons: "It was a mistake", a Ranked
  ban (30 days or until lifted) and "Lift ban". A decided player leaves the
  queue and the next row opens. "Again" marks a player decided on before.
- **Banned**: everyone banned from Ranked right now.
- **History**: every decision, newest first, with who made it.

The search field above the tabs finds one player's whole case (open flags,
ban, every decision) by name, email or account ID, part of either is
enough (`admin_search`, migration `review_search`). Use it when a player
writes in about a ban.

Only founders see the entry, and the server checks again
(`admin_review_page` and `admin_moderate`, migrations `admin_review` and
`review_log`). Every decision, from the app or the SQL helpers below, goes
into `private.moderation_log`.

**In Supabase:** open the Table Editor and switch the schema to **private**:

- `review_by_player`: one row per flagged player, the ones to review first,
  with a plain summary and whether they may play Ranked.
- `review_queue`: one row per flagged game: when, verdict and why.

Then act in the SQL Editor with the player's name:

```sql
select private.clear_flags('Quiet Logician');            -- it was a mistake
select private.restrict_ranked('Quiet Logician', 30);    -- no Ranked for 30 days
select private.restrict_ranked('Quiet Logician');        -- no Ranked until lifted
select private.lift_ranked('Quiet Logician');            -- Ranked again
```

A restriction never touches the account: Elo, Stardust, Daily and Clash stay,
and Casual, Daily and Clash keep working. Restricted players are left off the
leaderboard while it lasts. You can also tick `reviewed` and add a `note` on
a row of `review_flags` by hand.

## Not covered yet

- Every player can still generate the solution on their own device, because
  the puzzle is built from the seed in the browser. The server clock, the
  minimum solve time, the Ranked audit's timing check and the daily caps limit
  how much that helps (a bot that plays at a human pace still passes); the full
  fix is to check each move on the server. Casual, Daily and Clash games aren't
  checked against their puzzle (the owner chose Ranked only in B11): their caps
  bound what a script earns.
- Mistakes and hints are reported by the client. The server only caps them at
  3 each.
- Local guest progress (from before this update, or while anonymous sign-ins
  are off) stays on the phone. It isn't moved into an account, because the
  server can't verify it.
