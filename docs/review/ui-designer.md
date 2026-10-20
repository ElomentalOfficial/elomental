# UI review: ui-designer

Branch `full-review`, 2026-10-20. Read-only review. No project files were changed apart from this report and the screenshots.

## How this was checked

- **Screens.** 200 screenshots in `docs/review/ui/`, named `<screen>-<theme>-<text size>.png`. A `-full.png` version shows a scrolling page in full. Each screen was shot in dark and light at 100% and 200% text size, at 375×812 @2x. The screens: welcome, home, toast, Ranked/Clash/Square code/mend sheets, Casual, Daily, Leaderboard and three of its tabs, player card, player page, Profile, Forge, part sheet (owned and locked), odds sheet, Affinity, Setup, a keyboard focus ring, Accessibility, statement, Leaderboard and card, and the game. The game was shot empty, with a cell selected, with a wrong number, in notes mode, with the hint coach, paused, at the result with an Epic drop, and with the shortcuts sheet open.
- **Harness.** `C:\Users\Barsmin\Desktop\Claude\icons\review-ui\shoot.mjs` (Playwright). It aborts every `*.supabase.co` request by default, mocks a signed-in player, and closes the realtime websocket. Screens are mounted through Vite module imports. On each screen it measures text under 14px, text past the screen edge, clipped text, Federo set in bold, and text that ignores Text size. It also runs axe (WCAG 2.2 A/AA). The raw data is in `icons/review-ui/data/*.json`.
- **Contrast.** `node scripts/contrast.ts` passes: no required pair fails, and the seven `ACCEPTED` pairs fall short by design. I added a second pass, `icons/review-ui/extra-contrast.mjs`, for colour pairs the app draws that `PAIRS` doesn't list. Those results are quoted below.
- **Static scan of `styles.css`** (6,675 lines) and the shared UI files. It looked for raw colours, px font sizes, spacing off the scale, radii, opacity used on text, and accent used as a text colour.

Severity: **Critical**: a group of players can't use a screen. **High**: a WCAG AA failure, or a layout break at a size we support. **Medium**: a clear inconsistency or a narrow AA gap. **Low**: polish and hygiene.

---

## Findings

### UI-1 · High · In the dark theme, Lava is used as a text colour and fails contrast everywhere

- **Where:** `styles.css`:
  - result title and Elo gain: `.good` at 2306, set in `game.ts:931` and `game.ts:999`
  - `.month-head h2` at 1967–1973
  - `.day.today` at 2055
  - `.coach-count` at 4743
  - `.signup .field-error` at 1647 and `.setting .field-error` at 1733
  - `.signup .waiting` at 1659 and `.signup-done` at 1679
  - `.btn-outline` at 587, used by the guest sign-up form in `accountForm.ts:53`
  - `.clash-code span` at 3663, `.drop-note.good` at 2957, `.sheet .clash-challenge` at 3524, `.review-games summary` at 1560

  Screenshots: `result-dark-100.png` (SOLVED), `daily-dark-100.png` (OCTOBER 2026, today's 20), `game-hint-dark-100.png` (Hint · 1 / 3).
- **Evidence:** Lava `#a85b37` measures:
  - **3.02:1** on the page
  - **2.48:1** on `--surface` and on the modal
  - **2.07:1** on `--surface-2`

  axe flags `.coach-count` at 2.48:1 at both 100% and 200%. The result title is 24px/800, so it counts as large text, but it still fails 3:1. Error messages are 14px at 2.48:1, so the text a player most needs to read is the hardest to read. The light theme passes, because Crimson on the page is 7.68:1.
- **Fix:**
  - Add a text-only token, `--accent-text`. In dark it is `#e69c74`, a lighter Lava: 6.72:1 on the page, 5.52:1 on surface, 4.60:1 on surface-2, 4.75:1 on chosen-bg. In light it is `var(--c-crimson)`.
  - Replace every `color: var(--accent)` used for text with it, and add the pairs to `PAIRS`.
  - Errors also get an alert icon and stay in `--text`, so an error is never shown by colour alone. In the light theme, the accent is currently the body text colour.
  - Keep `--accent` for fills.
- **Effort:** S–M

### UI-2 · High · Forge breaks at 200% text

- **Where:** `forge-dark-200.png`, `forge-dark-200-full.png`, `forge-light-200.png`. `styles.css`: `.forge-head` at 2579 (`grid-template-columns: 112px 1fr`), `.part-grid` at 2634, `.plate-grid` at 5691 (`minmax(104px, 1fr)`).
- **Evidence:**
  - The probe finds intro text, "Fire · 2nd this month" and "Stardust" running to x=415 on a 375px screen.
  - The part grid stays at three columns, so rarity tags are cut ("ommc" for Common, from x=−10) and "Equipped · Alive" and "Disappointed" spill out of their cards.
  - The plate cards run into each other ("ReplacedReplaced").
- **Fix:**
  - Change both grids to `repeat(auto-fill, minmax(calc(104px * var(--text-scale)), 1fr))`.
  - Under `html[data-large-text]`, stack `.forge-head` with the avatar above the text (`grid-template-columns: 1fr`, avatar centred).
  - Give `.part-state` and `.part-name` `overflow-wrap: anywhere`.
- **Effort:** S

### UI-3 · High · Affinity cards are cut off at 200%

- **Where:** `affinity-dark-200.png`, `affinity-light-200.png`. `.affinity-grid` at `styles.css:2442` (`1fr 1fr`).
- **Evidence:** The right column runs from x=213 to 379: "WATER" and "Needs you" are clipped, and the Air card is cut the same way.
- **Fix:** Use `grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(150px * var(--text-scale))), 1fr))`. That gives one column at 200% and two at 100%.
- **Effort:** S

### UI-4 · High · Leaderboard at 200%: the affinity legend overlaps itself and the "You" bar covers a third of the screen

- **Where:** `leaderboard-dark-200.png`, `leaderboard-light-200.png`. `styles.css`: `.lb-strength-legend` at 6010 (`repeat(4, minmax(0, 1fr))`), `.lb-me` at 6245, `.lb-name.name-plate` at 6193.
- **Evidence:**
  - The four percentages run together as "30%26%23%21%".
  - The Earth dot sits on top of "Wate[r]".
  - The sticky "YOU #48 of 12,480" bar is about 270 of 812px tall.
  - The top-3 name plate "Silent Architect" runs past the row (x 144–404).
- **Fix:**
  - Change the legend to `repeat(auto-fit, minmax(calc(72px * var(--text-scale)), 1fr))`, which wraps to 2×2.
  - Under `data-large-text`, make `.lb-me` a single line with the text and Show me, and drop the avatar. Or make it non-sticky, as the last item of the list.
  - Give `.plate-text` `max-width: 100%` with an ellipsis inside the plate.
- **Effort:** M

### UI-5 · Medium · Some text ignores Text size because the page has no base font size

- **Where:** `html, body` at `styles.css:246–257` set no `font-size`, so anything without a token inherits the browser's 16px. Also `.reward` at 2355, `.odds td/th` at 2533–2549 and `.weekday` at 1997, plus `stat-icon` (16px), `.reward svg` (24px), `.segment-icon` (20px) and the action icons.
- **Evidence:** At 200%, the probe finds:
  - "+14 Stardust" on the result at **16px**, sitting between lines at 40px (`result-dark-200.png`)
  - the odds percentages at 16px
  - Daily's weekday letters at 16.1px, and day numbers capped at 19.4px by `cqi`

  Icons stay at their pixel size, so at 200% the Stardust and Spirits icons on Home and the Hint and Undo icons look like specks (`home-dark-200.png`, `game-selected-dark-200.png`).
- **Fix:**
  - Set `body { font-size: var(--fs-body) }`.
  - Give `.reward` and `.odds td` explicit tokens.
  - Size inline icons in `em` (for example `.stat-icon { width: 1em; height: 1em }`, `.reward svg { width: 1.5em }`).
- **Effort:** S

### UI-6 · Medium · In a game at 200%, Hint, Undo and Notes stack into full-width rows and Notes ends up below the screen

- **Where:** `game-selected-dark-200.png`. `html[data-large-text] .actions-row` at `styles.css:4991` (`grid-auto-flow: row; 1fr`).
- **Evidence:** Each action is about 110px tall, and Notes starts at y≈775 of 812. The screen scrolls, but a player has to scroll back and forth between the board and Notes during a game.
- **Fix:** At large text, keep three columns and stack the icon over the label (`.action { flex-direction: column }`). Fall back to rows only above 200% or below 340px wide.
- **Effort:** S–M

### UI-7 · Medium · The "one accent per screen" rule is broken by selection states

- **Where:**
  - `.segment.on` at `styles.css:1778` uses `--primary-bg`.
  - `.part-card.state-ready` at 2684 and `.plate-card.state-ready` at 5718 use an accent outline.
  - Toast at 3786, `.affinity-tag` at 2503, `.sheet-icon.clash` at 2212, `.play-badge` at 4331.

  Screenshots: `accessibility-dark-100.png`, `setup-dark-100-full.png`, `privacy-dark-100.png`, `forge-dark-100-full.png`, `leaderboard-dark-100.png`.
- **Evidence:**
  - Accessibility shows four Lava-filled options at once and has no primary action. Setup shows two, Privacy two.
  - The Leaderboard has a Lava selected tab, a Lava "Show me" button and the Fire tile.
  - In the Forge, 16 of 23 part cards and the plates have an accent outline, a wall of terracotta. In dark that outline is 2.48:1 against the card.
  - The Clash sheet's badge is Lava right above a Lava primary button.
- **Fix:**
  - Selected segment: `--surface` fill with a 2px `--select` ring and a check icon, the pattern Casual's difficulty picker already uses. One new token, `--seg-on-bg`.
  - "Ready to forge": keep the text, add a small anvil glyph, use a `--field-border` outline.
  - Keep the accent for the screen's primary button.
  - Make sheet badges neutral (`--surface-2`), as Square code already is.
- **Effort:** M

### UI-8 · Medium · Three different segmented controls and four tertiary button styles

- **Where:**
  - Casual `.difficulty` (3309–3333): neutral fill, a 1.5px ring, serif title case, pips.
  - `.segment` (1766): Montserrat 800, uppercase, accent fill.
  - `.lb-tabs` (6077): the same segments but scrolling sideways.
  - Clash difficulty: plain `.btn`.
  - Tertiary buttons: `.link-btn` (muted serif, underlined), the coach's "CLOSE" (uppercase Montserrat, muted), `.btn` (filled), `.btn-outline`.

  Screenshots: `casual-dark-100.png`, `setup-dark-100-full.png`, `leaderboard-dark-100.png`, `clash-sheet-dark-100.png`, `game-hint-dark-100.png`.
- **Evidence:**
  - The leaderboard tabs are cut at the right edge ("SEASON") with no fade or other sign that they scroll, and "Country" sits off screen at x 382–479 at 100% in both themes.
  - At 200%, Text size's options wrap into rows of different widths (`accessibility-light-200.png`).
- **Fix:**
  - One `.segmented` component with one selected style (see UI-7).
  - On the leaderboard, either wrap the tabs into two rows or add the same `fade-*` edge mask the scrolling pages use.
  - Text size options: `grid-template-columns: repeat(auto-fit, minmax(calc(64px * var(--text-scale)), 1fr))`.
  - One tertiary button: `.link-btn`.
- **Effort:** M

### UI-9 · Medium · Section and card titles come in eight or more styles, and names change case between screens

- **Where:** `.setting h2` (1357, 16px uppercase), `.setting-group > h2` (1232, 14px muted uppercase), `.casual-label` (3301, 12px muted uppercase; inside the card on one section, outside on the next), `.forge-heading` (2620, 20px), `.profile-section h2` (5790, 20px), `.lb-faction-head h2` (5941, 16px), `.month-head h2` (1967, 20px in Lava), `.life-section h3` (2733, 20px).

  Accessibility's card titles are in title case ("Text size"), while Setup's are uppercase ("THEME"). Setup also doesn't use `.setting-group` titles, which CLAUDE.md asks for on settings pages.

  Names: Home shows "DARIA", Profile "Daria", the player card "MIRA VANCE", the player page "Mira Vance".
- **Fix:**
  - Three roles:
    - page title: the `subbar h1`
    - group title: the `.setting-group > h2` style
    - card title: one `.card-title` class, `--fs-label`/800, one case decision
  - Group Setup into Account / Display / Help.
  - Show player names as typed everywhere. Drop `text-transform` on `.profile-name` and the card name.
- **Effort:** M

### UI-10 · Medium · Text that carries meaning sits below the 14px floor

- **Where:** `styles.css` uses `--fs-caption` (12px) for `.stat-chip` labels ELO / STARDUST / SPIRITS (1177), `.weekday` (2000), `.affinity-standing` "2nd this month · 41 active players" (2491), `.affinity-tag` "Needs you" (2505), `.casual-label` "NEW GAME" (3303), `.log-status` (3726), `.hint-count` (4463), `.coach-count` (4744), `.badge-tag` "ON YOUR CARD" (6485). The floor is stated at `styles.css:2703`.
- **Evidence:** The probe finds each of these at 12px (`home`, `casual`, `daily`, `affinity`, `profile`, `game-hint` in `data/dark-100.json`).
- **Fix:** Move them to `--fs-small`. Keep `--fs-caption` only for ids and decorative units such as the "Elo" under a score.
- **Effort:** S

### UI-11 · Medium · Federo is shown in a fake bold

- **Where:** `index.html` loads only Federo's regular weight. Bold Federo is set on:
  - `.rarity-tag` (2697, `font-weight: 700`, picking up the serif inside sheets)
  - `.odds-section h3` (2558, inherits the serif and the bold of h3)
  - `.card-numbers` (6414)
- **Evidence:** The probe lists "Rare", "Epic", "Common", "Mythic", "Guarantees", "Parts you already have" and "3120 Elo · Peak 3204 · #1" as Federo at weight 700. Synthetic bold smears the strokes (`odds-sheet-dark-100.png`).
- **Fix:** Set these to `font-family: var(--font)`, or to `font-weight: 400`. Add a rule to the design notes: Federo is never bolder than 400.
- **Effort:** S

### UI-12 · Medium · Light-theme contrast gaps that `PAIRS` doesn't cover

- **Where and evidence** (from `extra-contrast.mjs`):
  - `--field-border` on `--surface` is **2.73:1**. This is the name field inside the Setup card; the existing pair only checks it against the modal.
  - `--muted` on `--chosen-bg` is **4.19:1**: your own leaderboard row's sub-line, chosen cards.
  - `.profile-rank` (1105, `opacity: 0.8`) is **4.06:1** on the Home profile card.
  - `.plate-card.state-replaced .plate-sample` (5729, `opacity: 0.45`) is **2.04:1**: the "Bronze" and "Silver" names in `forge-light-100.png`.
  - The `.lb-row.placeholder` loading rows (6147, `opacity: 0.6`) are 2.70:1.
- **Fix:**
  - Light `--field-border` to `#7a7b64`: 3.48:1 on surface, 4.27:1 on the page, 3.06:1 on mud. Recheck High contrast after.
  - Drop the opacity on `.profile-rank` and use `--muted`.
  - For the Replaced state, use a dashed `--field-border` plate instead of opacity.
  - Add these pairs, with surface and chosen-bg, to `PAIRS`.
- **Effort:** S

### UI-13 · Medium · The Clash code boxes have no visible edge

- **Where:** `.code-box` at `styles.css:3565` (`inset 0 0 0 1.5px var(--line)`). Screenshot: `clash-sheet-dark-100.png`.
- **Evidence:** `--line` on the modal is **1.06:1** in dark and **1.23:1** in light. Only the active box has an outline, so the six slots barely read as fields. This is the same problem audit item M12 fixed for `.text-field`.
- **Fix:** Use `inset 0 0 0 1px var(--field-border)` for the edge, and keep `--select` for the active box.
- **Effort:** S

### UI-14 · Medium · Keyboard focus and selection look the same

- **Where:** `--focus` = `--select` in both themes (`styles.css:105/109` and `186/189`). `button:focus-visible` at 432, the selected difficulty at 3329, `.text-field:focus` at 1703, `.review-search:focus-within` at 1392 (uses `--accent`). Screenshot: `focus-ring-dark-100.png`.
- **Evidence:** The focused "Save name" gets the same Bright ring as a selected option. In Casual, focusing "Medium" while "Easy" is selected shows two near-identical rings. Fields and search use a third and a fourth focus treatment.
- **Fix:**
  - Make the focus ring a double ring: `outline: 2px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 6px var(--bg)`. Selection uses fill and a check, never a ring alone.
  - Fields and search use the same `--focus` ring.
- **Effort:** S

### UI-15 · Medium · Prestige vs clutter: leaderboard rows carry five prestige marks and Mythic doesn't look special in the Forge

- **Where:** `leaderboard-dark-100.png` and `leaderboard-light-100.png`, top rows. `--plate-glow` at `styles.css:138` and `216`. `forge-dark-100-full.png`, Shocked (Mythic).
- **Evidence:**
  - Row 1 has a medal ring, a framed avatar, a glowing plate, a Lava Archmage emblem and an affinity crest in a 64px row.
  - In light, the gold glow (`rgba(240,205,120,0.8)`) reads as a yellow smudge.
  - In the Forge, a Mythic or Alive part card looks exactly like a Common one except for its tag.
  - Common rows do stay clean.
- **Fix:**
  - On rows: no plate glow (keep it on the card and the page), and one emblem.
  - Mythic cards: a static rarity-coloured inner edge and a small corner foil (no motion).
  - Alive parts: a small "alive" glyph beside the state text.
- **Effort:** M

### UI-16 · Medium · High contrast mode isn't checked by `contrast.ts` and keeps the failing Lava text

- **Where:** `scripts/contrast.ts:156–162` (`themes()` reads only the base dark and light blocks). `styles.css:4909–4921`.
- **Evidence:** The `--grid-line` and `--field-border` overrides and `--muted: var(--text)` are never measured. High contrast doesn't touch `--accent`, so UI-1 stays at 2.48:1 in "High" contrast too.
- **Fix:**
  - Let `themes()` return `dark-hc` and `light-hc` by merging the `[data-contrast='high']` blocks, and run `PAIRS` for all four.
  - In HC dark, set `--accent-text` to `--text`.
- **Effort:** S–M

### UI-17 · Low · A disabled primary button still looks like the primary action

- **Where:** `.btn:disabled { opacity: 0.45 }` at `styles.css:2994`. Screenshots: `clash-sheet-dark-100.png` ("Join clash"), `square-sheet-dark-100.png`.
- **Evidence:** The label is 1.54:1 on a faded Lava. Disabled controls are exempt from 1.4.3, but it reads as a broken primary rather than "not yet".
- **Fix:** `--disabled-bg: var(--surface-2)` and `--disabled-text: var(--muted)`, with no opacity, plus a short "Enter a code first" hint in the field's help line.
- **Effort:** S

### UI-18 · Low · Spacing and corner radii are off the scale

- **Where:**
  - Spacing: 140 px values in `styles.css` that aren't 4, 8, 12, 16, 24 or 32. Page-level ones:
    - `.modal` padding 34/24/26 (2169)
    - `.profile-card` padding 22/18/18 (915)
    - `.result` gap 18 (2316)
    - `.setup` gap 16px written as a literal (1261)
    - `.subbar` margin 8px (1192)
    - Casual card padding 18/18/16 (3360)
    - `.coach-card` padding 18/20/16 (4722)
    - `.tile` gap 14 and padding 10 (756)
    - `.pause-cover` gap 14 (4312)
  - Radius: `var(--radius)` (6px) is used 22 times, `10px` 12 times and `12px` 13 times (modal, leaderboard rows 10, `.lb-me` 12, affinity, part and reveal cards 12).
- **Evidence:** In `profile-dark-100-full.png`, the Forge and the leaderboard, cards on one page have different corners.
- **Fix:** Add `--radius-lg: 12px` and use the two tokens only. Map the page-level values to `--space-*`: modal `--space-6 --space-5 --space-5`, result gap `--space-4`, profile card `--space-5 --space-4`.
- **Effort:** M

### UI-19 · Low · Raw colours left in the CSS

- **Where:** `styles.css`:
  - The coach spotlight and finger repeat Lava as `rgba(168, 91, 55, …)` five times (4679–4710), plus the shade `rgba(20, 21, 17, 0.68)` (4665).
  - Black shadows at 3788, 4518, 4727 and 6256.
  - The coach-open page colours `#1a1b16` and `#5f5f55` (358, 363).

  The `html` background literals at 281/285 are deliberate (iOS samples them).
- **Fix:** `color-mix(in srgb, var(--c-lava) 45%, transparent)`, a `--shadow` token per theme, and a `--coach-shade` token.
- **Effort:** S

### UI-20 · Low · Decorative motion loops forever on idle screens

- **Where:** `styles.css`:
  - the feather float (3194, 3207)
  - the Clash fist bump every 5s (3398–3406)
  - the Ranked flame flicker (2259)
  - the Mythic reveal shine (2920, infinite)
  - the coach finger (4683)
- **Evidence:** Reduce motion stops all of them (4873). With motion on, the Casual page and the result card never come to rest. The brief asks for short motion with a purpose; Alive is the only loop that carries meaning.
- **Fix:** Use `animation-iteration-count: 2` (then rest) for the feather, fists, flame and Mythic shine. Keep `infinite` only for `.avatar-face.alive`.
- **Effort:** S

### UI-21 · Low · Leaderboard rows show below the pinned "You" bar

- **Where:** `leaderboard-dark-100.png` and `-light-100.png`, at the bottom. `.lb-me` at `styles.css:6245`.
- **Evidence:** The next row's "Archmage" peeks out under the bar, because the sub-body's `--space-5` bottom padding sits below the sticky edge. The bar also uses radius 12 while the rows use 10.
- **Fix:**
  - `.leaderboard .sub-body { padding-bottom: 0 }`.
  - Give `.lb-me` a `--bg` skirt (`box-shadow: 0 var(--space-5) 0 var(--bg)`) and `--radius-lg`.
- **Effort:** S

### UI-22 · Low · Numbers are formatted three ways

- **Where:** Home shows "6400" Stardust, the Forge "12000 Stardust", the leaderboard "12,480" and the player card "2,840 solved". `home.ts:79–81`, `forge.ts`, `copy/en.ts`.
- **Fix:** One `formatNumber` built on `Intl.NumberFormat('en')`, used for every Elo, Stardust and count. The wording side belongs to the ux-reviewer; flagging only.
- **Effort:** S

### UI-23 · Low · Sheet icon badges don't match

- **Where:** `.sheet-icon.clash` uses `--accent`, `.sheet-icon.square` uses `--surface-2`, `.sheet-icon.ranked` uses Lava, `.sheet-icon.casual` uses Forest (`styles.css:2205–2240`).
- **Fix:** One rule: a sheet badge takes its mode tile's colour (Casual Forest, Ranked Lava), and the Casual sub-sheets (Clash, Square code) use neutral `--surface-2`. That also removes Lava from the Clash sheet (UI-7).
- **Effort:** S

### UI-24 · Low · The Affinity cards repeat one placeholder face

- **Where:** `affinity.ts:43` (`avatarSvg({ frame: … })` with no avatar). Screenshot: `affinity-dark-100.png`.
- **Evidence:** All four cards show the same pink "happy" face. The face carries no meaning, and the element crest the leaderboard uses is missing here.
- **Fix:** Put the element crest (the `.strength-dot` icon at about 40px) inside the element frame, or the player's own avatar.

  For the ux-reviewer: "Needs you" is `aria-hidden` and isn't part of the card's label.
- **Effort:** S

### UI-25 · Low · Home stat chips don't line up

- **Where:** `home.ts:65` (`stat('', copy.common.elo)` has no icon). Screenshot: `home-dark-100.png`.
- **Evidence:** "1530" sits about 18px higher than "6400" and "1", because only Stardust and Spirits have an icon row.
- **Fix:** Give Elo its tier emblem as the icon, or reserve the icon row with `min-height` on `.stat-chip`.
- **Effort:** S

### UI-26 · Low · Empty band between the board and the keypad on a 375×812 phone

- **Where:** `game-selected-dark-100.png`, about 140 CSS px between the board and the keypad. `.controls { margin-top: auto }` at `styles.css:4339`.
- **Fix:** Let `--key-h` grow into that space, up to about 72px, so the keys are larger for this audience. Or centre the board and controls as one group.
- **Effort:** S

### UI-27 · Low · The layout test never visits the screens that break

- **Where:** `e2e/layout.spec.ts:20–22` runs as a guest with the backend aborted.
- **Evidence:** Forge, Affinity, Leaderboard, Profile and the player card are never visited at 125–200%, and those are the screens with the 200% breaks (UI-2 to UI-4).
- **Fix:** Add a signed-in fixture with fulfilled mocks (as in `icons/review-ui/shoot.mjs`) and add those screens to the layout spec's routes.
- **Effort:** M

### UI-28 · Low · CSS tidiness issues

- **Where:** `styles.css`:
  - a rule glued to the previous `}` at 853 (`}.area-daily`), 6048 and 6052
  - two declarations on one line at 170
  - `.subbar` declared twice, at 1188 and 1246
- **Fix:** Run a formatter (Prettier, CSS only) once.
- **Effort:** S

### UI-29 · Low · Shortcuts sheet is uneven

- **Where:** `shortcuts-dark-100.png`.
- **Evidence:**
  - The arrow keys wrap, leaving ↓ alone on a second line.
  - The ↑ and ↓ glyphs are smaller than ← and →.
  - The descriptions are right-aligned, far from their keys.
- **Fix:** Make the key group `white-space: nowrap` (or 2×2), use SVG arrows, and left-align the descriptions in a two-column grid.
- **Effort:** S

---

## What's already good

- **Colours stay in tokens.** The TypeScript UI files (`ui.ts`, `playerCard.ts`, `plates.ts`, `badges.ts`, `avatar.ts`, `reward.ts`, `icons.ts`, every screen) contain no raw colours or inline px styles. The only literals are canvas and meta colours (`fabric.ts`, `grain.ts`, `theme.ts`), and those have a reason.
- **Font sizes stay on the scale.** Exactly one px font size exists, the wordmark, which the rules allow.
- **The contrast script passes in both themes, and so does axe.** No required pair fails. axe finds no violations on 33 of the 34 screens in dark and light at 100% and 200% (the exception is the hint coach, UI-1). No screen scrolls sideways at 375px.
- **The board is the calmest, clearest thing in the app.**
  - Your numbers differ from givens by both weight and tone.
  - Wrong cells carry a corner slash.
  - The double selection ring survives on a Forest fill.
  - The 3×3 boxes have a 3:1 outline.

  It reads well in both themes (`game-selected-*-100.png`, `game-wrong-light-100.png`).
- **Rarity and element are never shown by colour alone.** Rarity is always written on its tag. Elements carry a name and a crest in the tug bar. Mythic and Epic reveals are skippable and turn off with Reduce motion through one global rule.
- **Pop-ups are consistent.** They share one frosted backdrop, one frame, one close button and one heading style, and a long one scrolls (`odds-sheet`, `clash-sheet` at 200%).
- **At 200%, most screens reflow properly.** Home, Setup, Accessibility, Casual, Clash, Daily and the game all reflow and scroll cleanly. The breaks are limited to the signed-in progression screens (UI-2 to UI-4).

## Suggested order

1. UI-1 and UI-12 (tokens and pairs), then UI-16 so the script keeps them honest.
2. UI-2, UI-3, UI-4 and UI-5 (200% reflow), then UI-27 so it stays fixed.
3. UI-7, UI-8, UI-9 and UI-14 (one segmented control, one title system, one focus ring).
4. The rest.
