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
