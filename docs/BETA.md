# Beta: beta.elomental.online

Everything is tried on beta first; live (elomental.online) only changes when the owner says
"push it live".

| | Beta | Live |
|---|---|---|
| Branch | `beta` | `main` |
| Site | beta.elomental.online, GitHub Pages of `Barsmin/elomental-beta` | elomental.online, GitHub Pages of `Barsmin/elomental` |
| Deploy | `.github/workflows/beta.yml` on every push to `beta` | `.github/workflows/pages.yml` on every push to `main` |
| Database | Supabase project `elomental-beta` (`skuxlbukdynqsetnyqzw`, eu-central-1) | Supabase project `elomental` (`xekeiwaxxsmvalezgtyj`) |
| Looks | "Beta" tag in the corner, "Beta ·" in the tab title (`src/beta.ts`) | as is |

The app picks its project when it's built (`src/backend/client.ts`: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_KEY`, `VITE_ENV`); with none set it builds for live. The beta workflow refuses to
build without the beta project, or with the live one.

## How a change goes live

1. Work lands on `beta`: it deploys to beta.elomental.online against the beta project; a new
   migration is applied to the beta project first.
2. The owner tries it there.
3. On "push it live": the migration is applied to the live project (asked for each time), then
   `beta` is merged into `main`, which deploys elomental.online.

## One-time setup

The owner's accounts; done once.

1. **GitHub: the beta site's repository.** Create `Barsmin/elomental-beta`, public (GitHub
   Pages on a free account needs a public repository; it only ever holds the built site, like the
   live one), empty, no README.
2. **GitHub: a deploy token.** Settings (your account) > Developer settings > Fine-grained
   tokens > Generate: repository access only `Barsmin/elomental-beta`, permission Contents: Read
   and write. In `Barsmin/elomental` > Settings > Secrets and variables > Actions > Secrets, add
   it as `BETA_DEPLOY_TOKEN`.
3. **Supabase: the beta project.** Done 2026-10-21: `elomental-beta` (free plan, eu-central-1),
   every migration in `supabase/migrations` applied word for word (fetched from commit 8908850,
   recorded under the live versions), `audit-solve` deployed (the same bundle as live), and
   compared with live: functions, columns, grants, policies, triggers and scheduled jobs match.
   In `Barsmin/elomental` > Settings > Secrets and variables > Actions > Variables, add
   `BETA_SUPABASE_URL` = `https://skuxlbukdynqsetnyqzw.supabase.co` and `BETA_SUPABASE_KEY` = the
   beta project's publishable key (Settings > API Keys).
4. **Supabase beta: sign-in.** Authentication > URL Configuration: Site URL
   `https://beta.elomental.online`, and the same under Redirect URLs. Authentication > Sign In /
   Providers: allow anonymous sign-ins and email, as on live. Email templates as on live
   (`supabase/templates`).
5. **Cloudflare Turnstile.** The "Elomental" widget > Hostnames: add `beta.elomental.online`.
   In the beta project, Authentication > Attack Protection: the same Turnstile secret as live.
6. **DNS.** A `CNAME` record: name `beta`, target `barsmin.github.io`.
7. **First deploy.** Push the `beta` branch (Claude). In `Barsmin/elomental-beta` > Settings >
   Pages: source "Deploy from a branch", branch `gh-pages`, folder `/`; custom domain
   `beta.elomental.online`; Enforce HTTPS once the certificate is ready (up to a day).
8. **Founders.** Sign in on beta and make your account a founder there (Claude, in the beta
   project's `private.founders`).

## Notes

- A free Supabase project pauses after a week without use: open it in the dashboard to wake it.
- Beta starts empty: the leaderboard shows test accounts only.
- beta.elomental.online tells search engines to stay away (`robots.txt`, written by the
  workflow).
