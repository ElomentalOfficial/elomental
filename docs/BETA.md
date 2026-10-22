# Beta: beta.elomental.online

Everything is tried on beta first; live (elomental.online) only changes when the owner says
"push it live".

| | Beta | Live |
|---|---|---|
| Branch | `beta` | `main` |
| Site | beta.elomental.online, GitHub Pages of `ElomentalOfficial/elomental-beta` | elomental.online, GitHub Pages of `ElomentalOfficial/elomental` |
| Deploy | `.github/workflows/deploy.yml` in `elomental-beta`: within about 10 minutes of a push to `beta` | `.github/workflows/pages.yml` here, on every push to `main` |
| Database | Supabase project `elomental-beta` (`skuxlbukdynqsetnyqzw`, eu-central-1) | Supabase project `elomental` (`xekeiwaxxsmvalezgtyj`) |
| Looks | "Beta" tag in the corner, "Beta ·" in the tab title (`src/beta.ts`) | as is |

The app picks its project when it's built (`src/backend/client.ts`: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_KEY`, `VITE_ENV`); with none set it builds for live. The beta deploy names the beta
project and refuses to build against the live one.

## How the beta deploy works

No token: `ElomentalOfficial/elomental` is public, so `elomental-beta` builds it itself.
Every 10 minutes its workflow compares the `beta` branch with the build the site serves
(`version.txt`) and builds only when `beta` has moved: typecheck, tests, build, then publish with
the repository's own Pages permission. A push to `elomental-beta` deploys at once, so Claude,
after every push to `beta`, also pushes a one-line nudge there (about a minute end to end); the
10-minute check catches pushes made any other way. By hand: `elomental-beta` > Actions >
Deploy beta.elomental.online > Run workflow. Once a month it makes an empty commit, because GitHub
pauses timed workflows in repositories without activity for 60 days.

## Build names

Every build is named by its number, the commit's date and short hash: **Build 412 · 22 Oct 2026
· 8a78566** (beta: "Beta build …"). The number is the count of commits up to that build, so it
only goes up, and live and beta built from the same code share it. It's at the bottom of Setup,
and each site publishes it as `build.json`. `npm run builds` shows both and how far apart they
are ("beta is 7 commits ahead of live"). Stamped by `packages/web/vite.config.ts`; both deploys
check out the whole history so the count is right.

## How a change goes live

1. Work lands on `beta`: it deploys to beta.elomental.online against the beta project; a new
   migration is applied to the beta project first.
2. The owner tries it there.
3. On "push it live": the migration is applied to the live project (asked for each time), then
   `beta` is merged into `main`, which deploys elomental.online.

## One-time setup

The owner's accounts; done once.

1. **GitHub.** Done 2026-10-21: `ElomentalOfficial/elomental-beta`, public, holding only the
   deploy workflow and a README. Elomentalgame is the organization's owner (Barsmin, the owner's
   personal account, is not a member); this computer commits and pushes as Elomentalgame.
2. **Supabase: the beta project.** Done 2026-10-21: `elomental-beta` (free plan, eu-central-1),
   every migration in `supabase/migrations` applied word for word (fetched from commit 8908850,
   recorded under the live versions), `audit-solve` deployed (the same bundle as live), and
   compared with live: functions, columns, grants, policies, triggers and scheduled jobs match.
3. **DNS.** Done 2026-10-21: `beta` and `www` are CNAMEs to `elomentalofficial.github.io`;
   elomental.online is verified for ElomentalOfficial (TXT `_github-pages-challenge-elomentalofficial`).
4. **Pages.** In `elomental-beta` > Settings > Pages: Source "GitHub Actions"; custom domain
   `beta.elomental.online`; Enforce HTTPS once the certificate is ready.
5. **Supabase beta: sign-in.** Done 2026-10-22: Site URL `https://beta.elomental.online/` and
   Redirect URL `https://beta.elomental.online/**`; anonymous sign-ins and email on, as on live;
   custom SMTP as on live (sender name "Elomental Beta"); the three templates from
   `supabase/templates`.
6. **No Turnstile on beta**: the beta build sets no site key, so there's no captcha there.
7. **Founders.** Done 2026-10-22: the owner's email is in the beta project's `private.founders`.
   Review needs a pinned authenticator: set one up on beta, then pin it
   (`private.pin_founder_factor`).

## Testers (invite only)

Beta is for invited testers only. The beta project runs `hook_before_user_created` as its
Before User Created auth hook (Authentication > Auth Hooks), with sign-ups on and anonymous
sign-ins off: only emails on the tester list (`private.beta_testers`) and founders get an
account. The app shows only its sign-in until one of them signs in (`src/beta.ts`), and any
other email is told it isn't on the tester list.

Testers are managed in the app: Setup > Founder tools > Beta > Testers (founders, with their
authenticator code). Add an email; they sign in on beta.elomental.online with it. Remove one:
they're off the list and their beta account is deleted.

## Founder tools: beta and live

Dev mode, the testing tools, Show founders and Testers are beta only. The beta project has
`private.app_flags` `dev_tools` on; live has it off, so the server refuses them there and the
live app shows Review (and the founders' activity log) only.

## Email (both projects)

Sent through Brevo (the Elomentalgame account), SMTP login `bf6722001@smtp-brevo.com`, from
`noreply@elomental.online`. elomental.online is authenticated in Brevo (brevo-code TXT, DKIM
`brevo1`/`brevo2._domainkey`, DMARC `p=none`) and branded: Brevo's tracked links go through
`mail.elomental.online` (CNAMEs `mail`, `r.mail`, `img.mail`), not `sendibt3.com`, which ad
blockers stop.

## Notes

- A free Supabase project pauses after a week without use: open it in the dashboard to wake it.
- Beta starts empty: the leaderboard shows test accounts only.
- beta.elomental.online tells search engines to stay away (`robots.txt`, written by the deploy).
