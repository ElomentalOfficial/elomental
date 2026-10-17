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
  chooses the Ranked difficulty from Elo, and starts the server clock. Each
  player gets one Daily per day and one attempt per Clash code. Leaving a
  Ranked game open and starting another counts the first one as a loss.
- `finish_game(...)` settles the game once. It checks that the grid is a valid
  sudoku and rejects impossibly fast solves (under 15/30/45 s). Ranked and
  Clash are timed by the server. It then pays out Stardust, Rusted Crown drops
  and Elo.
- `get_clash(code)` and `my_clashes()` return both players' Clash results.
- `leaderboard(limit)`: the top players by Elo.
- `set_display_name(name)`

Migrations are in `migrations/` (already applied to the project).

## Dashboard settings (do once)

These settings can't be changed through the API, so set them by hand in the
Supabase dashboard:

1. **Authentication → URL Configuration**
   - Site URL: `https://barsmin.github.io/elomental/`
   - Redirect URLs: add `https://barsmin.github.io/elomental/**` and `http://localhost:5173/**`
2. **Authentication → Emails → Magic Link** template. Add the code so players
   can type it into the home-screen app. On iPhone a link opens Safari, not
   the installed app, so only the code signs in the installed app itself.
   ```html
   <h2>Your Elomental sign-in</h2>
   <p>Enter this code in the app:</p>
   <p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a> on this device.</p>
   ```
3. **Authentication → Sign In / Providers → Email**: keep Email enabled. The
   app only ever sends a code or link, so players never set a password.
4. Later, before launch: **Authentication → Emails → SMTP**. Supabase's
   built-in mailer only sends a few emails per hour, so set up your own SMTP
   provider (for example Resend or Postmark).

## Not covered yet

- Every player can still generate the solution on their own device, because
  the puzzle is built from the seed in the browser. The server clock and the
  minimum solve time limit how much that helps, but the full fix is to check
  each move on the server.
- Mistakes and hints are reported by the client. The server only caps them at
  3 each.
- Guest progress (from before signing in) stays on the phone. It isn't moved
  into the account, because the server can't verify it.
