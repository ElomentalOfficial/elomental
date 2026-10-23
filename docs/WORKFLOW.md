# Workflow: how changes are made and shipped

How Claude (or anyone) works on Elomental, on any machine. Deploy details are in
[BETA.md](BETA.md); the look rules in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Beta only, until asked

Every change lands on beta only. Never merge into `main` or touch the live Supabase project
(`xekeiwaxxsmvalezgtyj`) unless the owner asks for a live deploy in that message. Don't ask "deploy
to live?" after each change; say it's on beta.

After building a change:

1. Commit on the working branch (`full-review`), then push it and `HEAD:beta`. New migrations go
   to the beta Supabase project first.
2. Push an empty `Deploy beta <sha>` commit to `ElomentalOfficial/elomental-beta`'s `main` so the
   beta deploy starts at once (BETA.md explains why).
3. Check that `https://beta.elomental.online/version.txt` shows the new sha. It usually takes about
   a minute but has taken up to 15: wait in the background, don't assume it failed.

When the owner asks for live: migrations first if the app needs them (or the app first if the old
app would break), then merge into `main`, and check `npm run builds`.

## Git identity

Elomental work is committed and pushed as **Elomentalgame**: commits authored
`Elomental <345817444+Elomentalgame@users.noreply.github.com>` (repo-local git config), remotes
`https://Elomentalgame@github.com/ElomentalOfficial/...` with that account's own sign-in. The
owner's personal account (Barsmin) and global git identity are for their portfolio only: never
push Elomental work as Barsmin.

## Setting up a machine

- Clone or copy the repo; set the repo-local git identity above and sign in as Elomentalgame.
- `npm ci` and `npx playwright install` (never copy `node_modules` between machines: some
  packages are built for one OS).
- Windows only: git isn't on PATH there; GitHub Desktop's bundled git is at
  `%LOCALAPPDATA%\GitHubDesktop\app-<version>\resources\app\git\cmd\git.exe`. Write commit messages
  to a UTF-8 file without BOM and commit with `-F`.
- Firefox wouldn't launch under Playwright on the Windows machine; the owner checks Firefox by hand.

## Checks

- `npm test` and `npm run test:a11y` in `packages/web` (Playwright and axe).
- Contrast: `node scripts/contrast.ts` (exit 0 is a pass). Palette: `npm run palette` after
  editing `scripts/palette.ts`.
- **Seeing a screen:** a temporary Playwright spec in `packages/web/e2e` named `zz-*.spec.ts`
  (never committed, deleted afterwards) using `fixtures.ts` `signedIn()`, which fakes the server.
  Set the viewport, wait about 1.5s for Home's tiles to settle before clicking one, screenshot to
  a scratch folder and look at the PNG. Run it with `--project=dark` (the projects are `dark` and
  `light`; set the theme in localStorage `elomental:theme` to see the other). Games can't start
  with the signed-in fakes: render the game as a guest.

## Working with the owner

- **Own the design calls.** Choose between specialist proposals, push back on the owner's ideas
  when there's a better one, and change existing things when it improves the system. State the
  decision and the reason in one line, and what was rejected and why. ("Don't agree with me
  only"; "have a bit of ownership".) Still ask before live deploys and migrations.

## Open threads

- **Stardust sink (parked by the owner).** Name plates became level rewards (2026-10-21), removing
  a sink of about 32,500 Stardust; a regular player may hold 35–40k by day 180 with little to
  spend it on (estimate, unverified: run `scripts/audit-sim.mjs`). Already weighed, don't re-pitch
  blindly:
  - Element finishes on owned parts (rim, stud inlay, sheen): the owner dropped it.
  - Buying faction influence: pay-to-win (the 300-per-player monthly cap keeps the board fair).
  - A season crest bought in stages: too close to buying plates. Board looks: only you see them.
  - **Open candidate:** the faction "Offering": Stardust given to your side's forge in steps of
    250, monthly flame tiers on the faction card and members' badges, never counted in the
    standings. Start minimal. Run the simulator first.
