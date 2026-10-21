# Elomental

## Player-facing text

- Read [docs/BRAND_VOICE.md](docs/BRAND_VOICE.md) before writing or changing any text a player
  can see or hear: labels, buttons, messages, hints, results, errors, share texts, aria-labels.
- All of it lives in [packages/web/src/copy/en.ts](packages/web/src/copy/en.ts), grouped by area.
  Screens import it as `import * as copy from '../copy/en.ts'` and use `copy.game.hint`,
  `copy.result.winLine(...)`, and so on. Never hardcode a player-facing string in a screen.
- Text with numbers or names in it is a small function in `en.ts`; repeated moments with
  several lines use `copy.pick(lines, key)` so a game always shows the same line.
- Use the glossary terms: a **cell** is one of the 81 spaces, a **square** is a whole puzzle;
  **game** (never match), **number** (not digit), **mistake**, **hint**, **Elo**, **Stardust**.
- aria-labels and alt text are literal and never joke. No humor in errors, losses, sign-in,
  account, money or moderation.
- `index.html` (title, meta description) and `public/manifest.webmanifest` can't import the
  module: keep them in line with the guide by hand.
- Run the guide's pre-ship checklist on any new text.

## Accessibility

- Read [docs/ACCESSIBILITY_AUDIT.md](docs/ACCESSIBILITY_AUDIT.md) before any UI work. The bar is WCAG 2.2 AA.
- Colours come only from the design tokens: the palette in `packages/web/src/styles/palette.css`
  (ramps `--c-<hue>-<step>`, and each element, rarity and Home tone's roles `-fill`, `-on`, `-ink`,
  `-line`, `-wash`, `-mark`), then the theme tokens in `tokens.css`. No raw colour values in
  components or screens. palette.css is generated: a new colour is one ramp and one swatch in
  `packages/web/scripts/palette.ts`, then `npm run palette -w @elomental/web`; `npm test` checks
  every role on every surface. Use a role, never a step, in a component; a shape seen alone
  uses `-line`, `-mark` only beside its name or crest.
- `styles.css` only lists the files in `src/styles/` in cascade order (tokens, base, then one file per
  screen or feature). Put a rule in its screen's file; a new file goes where its rules belong in that order.
- Any new colour pair goes into `PAIRS` in `packages/web/scripts/contrast.ts`; `npm test` must pass
  (4.5:1 text, 3:1 large text and UI). Only add to `ACCEPTED` with a reason.
- One rule per set: every member of a set (the four elements, the rarities, a row of tiles or
  tags) gets the same treatment in each theme. If one needs an edge, glow or outline, they all
  take it, through a shared palette role (`-edge` for the rim of every filled tag, chip, segment
  and disc). Compare siblings side by side in both themes before calling UI done.
- Never use colour alone to show a state: pair it with a shape, weight, icon, outline or text.
- Every new control works with mouse, touch, keyboard and screen reader: a real `<button>`/`<a>`
  (activate on `click`, never only on `pointerdown`), a literal accessible name, visible `--focus` ring.
- Pop-ups go through `openModal` (dialog, focus trap, Esc, focus return). Game events a screen reader
  needs go through the game's live region (`announce`), never the clock.
- Run `npm run test:a11y -w @elomental/web` (Playwright + axe) after UI changes.

## Spacing and pages

- Gaps and paddings in page layouts use the spacing tokens in `styles/tokens.css`
  (`--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 24 · `-6` 32), picked by how closely two
  things belong: title → its help line `--space-1`; help line → its control `--space-3`; one item
  → the next in a card `--space-5` with a hairline between; card padding `--space-5` / `--space-4`;
  card → card `--space-4`; group title → its card `--space-3`; group → next group `--space-6`.
  No one-off pixel gaps.
- Long settings pages are split into titled groups (`.setting-group` > `h2` + `.setting` card),
  never one card with everything in it. A topic with more than a handful of options gets its own
  page, reached from one row in Setup.
- Every page under Home or Setup is built with `subPage()` (ui.ts): the header with Back stays
  fixed and only the body scrolls, so Back is always in reach.

## Font sizes

- Use the six type-scale tokens in `packages/web/src/styles/tokens.css`
  (`--fs-caption` 12, `--fs-small` 14, `--fs-body` 16, `--fs-label` 20, `--fs-title` 24,
  `--fs-display` 30), picked by role. They scale with Setup > Accessibility > Text size
  (`--text-scale`), so never add a new fixed `font-size` in px, and check new UI at 200%.
- Only sizes tied to geometry (board numbers, notes, the desktop game controls) and the
  wordmark are computed instead.

## The game and its rules

- What it is: a competitive sudoku web app (Casual, Daily Square, Ranked Elo against a rated
  square, Clash with a friend, Square codes). Players earn parts, forge avatars and frames with
  Stardust, join an affinity (Fire, Water, Earth, Air) and show off on the Profile and
  leaderboard. Theme: the forge and the four elements.
- Audience: players aged 35–45 in 5–15 minute sessions. Clear, calm and satisfying beats flashy;
  every session should show progress.
- Live design: the "Revision" section at the top of
  [docs/PROGRESSION_DESIGN.md](docs/PROGRESSION_DESIGN.md) overrides the older sections below it.
  Leaderboard: [docs/LEADERBOARD_DESIGN.md](docs/LEADERBOARD_DESIGN.md). Last audit:
  [docs/AUDIT.md](docs/AUDIT.md).
- The server settles everything: Elo, Stardust, parts, Spirits and influence are paid by
  `finish_game` in Supabase. Clients never write tables and are never trusted.
- No real money for now, and nothing ever gives an edge in Ranked: Stardust and parts buy looks
  and conveniences only. Never add a new currency without asking.
- Ask before applying a migration or deploying an Edge Function to the live project.

## Specialists

Subagents in `.claude/agents/`. Use them, and have the relevant one review work before calling it
done:

- `game-economy-designer`: drop rates, guarantees, Stardust earn and sinks, forge prices, Elo pace
- `ui-designer`: colours, tokens, type, spacing, how every component looks in each state
- `ux-reviewer`: flows, clarity and fun for the 35–45 audience
- `qa-tester`: tests features end to end and reports bugs
- `backend-security-reviewer`: Supabase functions, RLS, anti-cheat, data integrity
