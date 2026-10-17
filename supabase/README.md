# Supabase backend

Project `elomental` (ref `xekeiwaxxsmvalezgtyj`, Frankfurt, free plan).
The app talks to it from `packages/web/src/backend.ts`.

## What lives here

| Table | Holds | Clients can |
| --- | --- | --- |
| `profiles` | name, Elo, ranked games, Stardust, crowns, pity | read their own row |
| `games` | every signed-in game: seed, server start time, result, payout | read their own games |
| `clashes` | Clash codes and their difficulty | read (signed in) |

Clients never write to tables. Everything goes through these functions
(signed-in players only):

- `start_game(mode, difficulty?, date_key?, clash_code?)` picks the seed
  (Ranked and Casual are random; Daily uses the date; Clash uses the code),
  picks the Ranked target rating from Elo (the player's Elo, kept within
  150-3200; the client generates a puzzle rated close to it), and starts the
  server clock. Each
  player gets one Daily per day and one attempt per Clash code. Leaving a
  Ranked game open and starting another counts the first one as a loss.
- `finish_game(...)` settles the game once. It checks that the grid is a valid
  sudoku and rejects impossibly fast solves (under 15/30/45 s). Ranked and
  Clash are timed by the server. It then pays out Stardust, Rusted Crown drops
  and Elo. A Ranked puzzle's reported rating must be within 350 of its target,
  and its par time (for the speed bonus) grows with the rating.
- `get_clash(code)` and `my_clashes()` return both players' Clash results.
- `leaderboard(limit)`: the top players by Elo.
- `set_display_name(name)`

Migrations are in `migrations/` (already applied to the project).

## Dashboard settings

Done (2026-10-17):

1. **Authentication → URL Configuration**
   - Site URL: `https://barsmin.github.io/elomental/`
   - Redirect URLs: `https://barsmin.github.io/elomental/**` and `http://localhost:5173/**`
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON.**
   Every guest gets a hidden account on first launch, so their games are
   settled on the server from the start. Signing up with an email later keeps
   all of their Stardust, Elo and Daily streak. Anonymous guests never appear
   on the leaderboard. Supabase recommends turning on a captcha for anonymous
   sign-ins before launch.
3. **Email provider → Secure email change: OFF.** A guest account has no old
   email to confirm.

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

Signing in to an *existing* account from the installed iPhone app uses the
`handoff` Edge Function (functions/handoff, migration signin_handoffs):
1. The app starts a request (an id plus a secret it keeps) and the email link
   carries the id.
2. The page the link opens (Safari) asks "Sign in the app?" and shows a
   two-digit code that matches the one in the app.
3. Once confirmed, the app collects a one-time sign-in token with its secret.

Requests last 10 minutes and work once.

Now that custom SMTP is on, you could also add a typed code (`{{ .Token }}`) to the
**Magic link or OTP** and **Change email address** templates, as a fallback
to the hand-off.

## Not covered yet

- Every player can still generate the solution on their own device, because
  the puzzle is built from the seed in the browser. The server clock and the
  minimum solve time limit how much that helps, but the full fix is to check
  each move on the server.
- Mistakes and hints are reported by the client. The server only caps them at
  3 each.
- Local guest progress (from before this update, or while anonymous sign-ins
  are off) stays on the phone. It isn't moved into an account, because the
  server can't verify it.
