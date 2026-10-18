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
- Colours come only from the design tokens in `packages/web/src/styles.css` (`--c-*` palette, then the
  theme tokens). No raw colour values in components or screens.
- Any new colour pair goes into `PAIRS` in `packages/web/scripts/contrast.ts`; `npm test` must pass
  (4.5:1 text, 3:1 large text and UI). Only add to `ACCEPTED` with a reason.
- Never use colour alone to show a state: pair it with a shape, weight, icon, outline or text.
- Every new control works with mouse, touch, keyboard and screen reader: a real `<button>`/`<a>`
  (activate on `click`, never only on `pointerdown`), a literal accessible name, visible `--focus` ring.
- Pop-ups go through `openModal` (dialog, focus trap, Esc, focus return). Game events a screen reader
  needs go through the game's live region (`announce`), never the clock.
- Run `npm run test:a11y -w @elomental/web` (Playwright + axe) after UI changes.

## Font sizes

- Use the six type-scale tokens at the top of `packages/web/src/styles.css`
  (`--fs-caption` 12, `--fs-small` 14, `--fs-body` 16, `--fs-label` 20, `--fs-title` 24,
  `--fs-display` 30), picked by role. They scale with Setup > Accessibility > Text size
  (`--text-scale`), so never add a new fixed `font-size` in px, and check new UI at 200%.
- Only sizes tied to geometry (board numbers, notes, the desktop game controls) and the
  wordmark are computed instead.
