# Elomental accessibility audit

Status: **Phases 3–4 done** on the `accessibility` branch (results in section 6). Sections 1–5 are the original audit, kept as written.
Standard: WCAG 2.2 AA everywhere, AAA text contrast where it costs the design nothing.
Audited: `main` at `0d6fb0a` (2026-10-18), dark and light themes, phone (320×568, 375×812) and desktop (1024×768, 1302×735).

## How this was audited

| Method | What it covered |
| --- | --- |
| Code review | `index.html`, `styles.css` (all theme tokens), `ui.ts` (screens, modals, toasts), `gestures.ts`, `screens/game.ts` (board, keys, keyboard handler, rendering), `home.ts`, `setup.ts`, `daily.ts`, `tutorial.ts`, `hintCoach.ts`, `radial.ts`, `copy/en.ts` |
| Contrast script | Resolves every theme token and computes WCAG ratios for 47 colour pairs per theme, compositing translucent colours and element opacity over what they sit on (`a11y-contrast.mjs`, to be added to the repo in Phase 3) |
| Colour-blind simulation | Machado et al. (2009) matrices at full severity for protanopia, deuteranopia and tritanopia, applied to every cell state; distinguishability measured as CIELAB ΔE and luminance ratio |
| axe-core 4.10.2 | Injected into the live dev build: Home, Casual sheet, game screen (WCAG 2.0/2.1/2.2 A+AA and best-practice rules) |
| Live checks | Keyboard activation of every control, Tab order, touch target sizes, 320px layout, Esc on pop-ups, focus after a pop-up opens |
| Not run | Lighthouse (not available in this environment), eslint-plugin-jsx-a11y (the app has no JSX and no ESLint). Real screen readers (VoiceOver, TalkBack, NVDA) need a human test: see the end of this report |

Severity: **critical** = a group of players cannot play or finish a game; **major** = a WCAG AA failure or a serious barrier with a workaround; **minor** = AAA, best practice, or polish.

---

## 1. Issues

### Critical

| ID | Where | What | WCAG | Suggested fix |
| --- | --- | --- | --- | --- |
| C1 | `game.ts:984-1000` keypad, Notes, Undo | These buttons only listen for `pointerdown`. Keyboard (Enter/Space), switch access and desktop screen readers send `click`, so the keypad, Notes and Undo **do nothing** when activated that way (verified: focusing "5" and pressing Enter left the cell empty). Number keys 1–9 on a physical keyboard still work, but only through a global handler. | 2.1.1 Keyboard, 4.1.2 Name, Role, Value | Handle `click` for activation; keep the instant `pointerdown` path for touch and ignore the click that follows it. |
| C2 | `game.ts:309-317` board | `role="grid"` with 81 `gridcell`s directly inside nine box `div`s: no `row` elements (axe: `aria-required-children`, `aria-required-parent` ×81). Cells are not focusable (`tabindex` −1, no roving focus), the selected cell is not exposed (`aria-selected`), so screen reader users cannot move through the board or know where they are. | 1.3.1 Info and Relationships, 4.1.2, 2.1.1 | Render the DOM in rows (9 `role="row"`, each with 9 cells) and draw the 3×3 boxes with CSS; one focusable cell at a time (roving `tabindex`), `aria-selected`, arrow keys move DOM focus. |
| C3 | `index.html:7`, `gestures.ts` | Pinch and double-tap zoom are blocked (`maximum-scale=1, user-scalable=no` plus gesture guards, axe `meta-viewport` critical), every size is fixed `px`, and there is no in-app text size. Players with low vision have no way to enlarge text. | 1.4.4 Resize Text | Add an in-app **Text size** control up to 200% (WCAG technique G178) that scales the type tokens, and make every screen reflow and scroll at 200%. Decide whether to drop `user-scalable=no` (see Decisions). |
| C4 | `ui.ts:95` `openModal` (every pop-up: Casual, Ranked, Clash, Square code, results, account) | No `role="dialog"` / `aria-modal`, focus stays on the page behind (verified: `document.activeElement` = `BODY` after opening), Tab walks into the hidden page, **Esc does not close**, focus is not returned to the opener. The win/loss result appears silently to a screen reader. | 2.4.3 Focus Order, 4.1.2, 2.4.11 Focus Not Obscured, 2.1.1 | One accessible dialog primitive: label from the sheet's heading, move focus to the first control (or heading), trap Tab, Esc closes when dismissible, restore focus. |

### Major

| ID | Where | What | WCAG | Suggested fix |
| --- | --- | --- | --- | --- |
| M1 | game | No live region: a wrong number, mistakes used, a hint placed, a completed row/column/box, the win or loss and "paused" are only visual or a vibration. | 4.1.3 Status Messages | A polite `aria-live` region for game events ("Wrong number. 2 mistakes left."), assertive only for game over; never announce the clock. |
| M2 | `copy.game.a11y.cell` | Cell label is "Row 1, column 3: 5": no box, not whether the number is **given** or **yours**, not wrong, not selected. | 1.3.1 | "Row 1, column 3, box 1. 5, given." / "…7, your number." / "…empty, notes 1 4 9." |
| M3 | `styles.css` `--cell-user: var(--cell-text)` | Given and entered numbers look identical by design. Players can't see which cells they may change (affects everyone, especially players who rely on structure). | 1.3.1; brief: never colour alone | Entered numbers in a lighter weight (500 vs 600) and the theme accent colour; givens stay as they are. Two cues: weight + colour. |
| M4 | `game.ts:416` wrong numbers | A wrong number shows for 1.4s, then fades away. The only cue is the fill colour, and in light theme the wrong fill (Crimson) and the same-number fill (Forest) are nearly identical for deuteranopia (ΔE 8.2, ratio 1.27). | 1.4.1 Use of Color, 2.2.1 (time-limited information) | Add a shape cue to wrong cells (a diagonal slash in the corner) and announce it; a setting to keep a wrong number visible until the next move. The mistake rule itself is unchanged. |
| M5 | dark theme: primary buttons, toasts, hint badge, Notes on, Ranked tile, same-number cells | Bright on Lava is **4.45:1** (needs 4.5:1 for text under 24px). axe flags the Casual "Play" button. | 1.4.3 Contrast (Minimum) | Lava `#B1613C` → `#A85B37` (4.91:1). Visually the same terracotta, one step deeper. |
| M6 | `button:focus-visible` | Focus ring is the accent: Lava on the dark modal is **2.74:1**; cells have no focus style at all; the selection ring is the only "focus" on the board. | 2.4.7 Focus Visible, 1.4.11 Non-text Contrast, 2.4.13 (AAA) | A dedicated `--focus` token (Second bright in dark, 9.9:1; Crimson in light, 7.7:1), 2px + 2px offset everywhere, including cells. |
| M7 | light theme, selected cell on a same-number fill | The selected cell almost always holds the focused number, so it is Forest-filled; its Crimson ring is **1.35:1** on Forest: the selection disappears. | 1.4.11 | Double ring: 2px Bright inside 2px Crimson (Bright on Forest 5.69:1). |
| M8 | Casual difficulty picker; Setup switches (Theme, Notes wheel) | Difficulty picker: the selected option differs only by a slightly lighter fill (1.29:1 dark, 1.22:1 light) and text colour. Setup switches: the selected option is filled with the accent, which is 2.28:1 against the other options in dark (5.50:1 in light, passes). | 1.4.11, 1.4.1 | Selected option gets a 1.5px ring in `--select` (10.7:1 dark, 6.7:1 light) and a check icon in the Setup switches; `aria-checked` is already right. |
| M9 | light theme: muted text on Mud (resume info "1:24 · 0% done", difficulty labels, review pills); stat chip labels (ELO, STARDUST, CROWNS) | **3.71:1** and **3.07:1** (stat labels use 70% opacity). | 1.4.3 | Light `--muted` 0.8 → 0.92 alpha (`#84524E`: 6.28:1 on page, 4.70:1 on Mud); drop the 0.7 opacity on stat labels (4.71:1). |
| M10 | mistake skulls | Unused skulls are **1.46:1** (dark) and **1.40:1** (light) against the page; the remaining count is unreadable for many players. `.mistakes` also has an `aria-label` without a role (axe `aria-prohibited-attr`). | 1.4.11, 4.1.2 | Unused = outlined skull in `--muted` (≥5:1), used = filled; the group reads "1 of 3 mistakes" as text for screen readers. |
| M11 | `.notes` font `2.3cqi` | Pencil notes render at **≈8px** on a 375px phone and ≈6.7px at 320px. | 1.4.4, 1.4.12 | Minimum 9px, and a **Larger notes** option (≈11px) that's part of Text size. |
| M12 | `.text-field` (email, name, codes) | No visible boundary until focused (field vs modal 1.20:1 dark, 1.40:1 light). | 1.4.11 | 1px `--field-border` (3.36:1 dark, 3.34:1 light). |
| M13 | coach marks (`tutorial.ts`), hint explanation (`hintCoach.ts`) | `role="dialog"` but focus isn't moved to Next/Skip and isn't trapped; the game's keys are blocked while it's open, so a keyboard user has to Tab through the whole game to find Next. | 2.4.3, 2.1.1 | Same dialog primitive as C4: focus Next on each step, Esc = Skip. |
| M14 | square code chip | Tap target is **90×14px** (needs 24px tall). | 2.5.8 Target Size (Minimum) | Pad the hit area to ≥24px (44px preferred) without changing the visual. |
| M15 | Daily calendar | A missed day is shown only by dimming (50% opacity: 1.96:1 light, 2.60:1 dark). | 1.4.3, 1.4.1 | Full-contrast number plus a small "missed" mark (dot or slash); state in the label (already "missed"). |
| M16 | timer, Ranked/Clash pauses | The clock is always visible and always counting; no way to hide it. (Ranked/Clash being timed is a rule and stays.) | Brief: players control the pressure (cognitive, 2.2.1 exception for real-time events) | **Hide timer** setting (visual only; time still recorded); the result screen still shows the time. |

### Minor

| ID | Where | What | WCAG | Suggested fix |
| --- | --- | --- | --- | --- |
| m1 | row/column highlight | 1.19:1 (dark) and 1.14:1 (light) against a normal cell. Supplementary (the selection ring carries the state), but faint, and tritanopia ΔE is only 5.2 in light. | 1.4.11 (informative) | Keep in the default themes; much stronger in High contrast; option to include the 3×3 box. |
| m2 | board structure | Cell fills are 1.40–1.46:1 against the page; the 3×3 boxes are read from the 4px gaps only. | 1.4.11 | Add a hairline box outline at ≥3:1 (`--grid-line`: `#77786E` dark 3.37:1, `#8C8D76` light 3.34:1). |
| m3 | keypad, number with all nine placed | Faded to 30% opacity (1.81:1 dark, 2.09:1 light) while still pressable. | 1.4.3 | 55% (3.32 / 3.55:1) plus a small check mark: a shape, not just fading. |
| m4 | landmarks | No `main`/`header`; axe `region` (best practice). Home and Game have no `h1`; `document.title` never changes. | 1.3.1, 2.4.2 Page Titled, 2.4.6 | `<main>` per screen, a visually hidden `h1` ("Home", "Casual, Easy"), title "Casual Easy – Elomental". |
| m5 | toasts | 2.4s minimum, then gone; `role="status"` is right. | 2.2.1 (advisory) | ≥4s and proportional; long-press or focus pauses; important ones (copy blocked) also stay on screen. |
| m6 | over-par timer | Turns muted grey to say "over par": colour only, and silent for screen readers. | 1.4.1 | Add a small marker (e.g. "+") and include it in the timer's label on request. |
| m7 | splash | Whole screen is a `<button>` labelled "Elomental. Tap to continue." | 2.5.3 Label in Name (advisory), brand voice: literal labels | "Elomental. Continue." (auto-advances anyway). |
| m8 | haptics | Vibrations on wrong numbers, notes wheel and completed lines can't be turned off. | 2.3.3-adjacent, preference | **Haptics** setting. |
| m9 | motion | System "reduce motion" is respected well (global CSS rule, JS turnstile, peel, count-ups). There's no in-app switch for players who want calm without changing the OS. | 2.3.3 (AAA) | **Reduce motion** setting, defaulting to the system. |
| m10 | notes wheel | Long-press only by pointer; keyboard alternatives exist (Shift+1–9, N for notes mode) but aren't discoverable. | 2.1.1 (met), 3.3.5 Help | Shortcuts panel (?) and the tutorial mention them on desktop. |
| m11 | colour-blind: same-number vs hint flash | Identical fills in dark (both Lava); in light, Crimson wrong = Crimson hint flash. The flash is brief and paired with the number appearing. | 1.4.1 (advisory) | Hint cells get a short outline pulse instead of a fill in colour-blind mode. |

### What already works well

- `lang="en"`, a single type scale, icons are `aria-hidden` with labelled buttons (Pause, Erase, Hint "Hint, 3 left", Notes `aria-pressed`, back buttons).
- Physical keyboard play: arrows (wrapping), 1–9, Backspace/Delete/0, Shift+1–9 for notes, N for notes mode, Ctrl/Cmd+Z undo, Esc closes the notes wheel.
- Toasts and form errors use `role="status"` / `role="alert"`; segmented controls are radio groups with `aria-checked`.
- `prefers-reduced-motion` is honoured almost everywhere (one global rule plus JS checks).
- Layout fits 320×568 with no clipping; keypad keys 54–65px, action buttons ≥42px tall, cells 29px (320px) to 37px (375px), all above the 24px AA minimum.
- Wrong numbers in dark theme already flip to a Bright fill (a lightness change, not just hue), and every cell-state pair except the ones listed above stays distinguishable in all three simulations (ΔE ≥ 15).

---

## 2. Contrast table

Requirement: 4.5:1 text, 3:1 large text (≥24px, or ≥18.66px bold), 3:1 UI components and meaningful graphics. "Proposed" values are computed with the same script.

### Dark theme

| Pair | Current | Result | Proposed | New |
| --- | --- | --- | --- | --- |
| Body text (Bright on Bg) | 14.83 | pass AAA | – | – |
| Muted text on page / modal / Highlight2 | 6.60 / 5.76 / 5.05 | pass | – | – |
| Bright on Lava (primary button, toast, hint badge, Notes on, Ranked tile) | **4.45** | fail | Lava `#A85B37` | 4.91 |
| Bright on Forest (Casual tile) / on Crimson (Daily tile) | 5.69 / 7.68 | pass | – | – |
| Stat chip label (70% opacity) | 6.64 | pass | full opacity, `--muted` | 5.59 |
| Keypad number | 12.09 | pass AAA | – | – |
| Keypad number, all placed (30%) | **1.81** | fail | 55% + check mark | 3.32 |
| Cell number on cell / row-column highlight | 10.14 / 12.11 | pass AAA | – | – |
| Same-number cell (Bright on Lava, 28px) | 4.45 | pass (large) | `#A85B37` | 4.91 |
| Wrong cell (Crimson on Bright) | 7.68 | pass AAA | – | – |
| Notes on cell (≈8px) | 10.14 | pass AAA | size, see M11 | – |
| Daily missed day (50%) | **2.60** | fail | full contrast + mark | 5.76 |
| UI: row/column highlight vs cell | **1.19** | fail (supplementary) | High contrast mode | – |
| UI: same-number fill vs cell | 2.28 | fail (supplementary; the number itself is the cue) | – | 2.07 |
| UI: selection ring on cell / on same-number fill | 8.27 / 3.63 | pass | on `#A85B37` | 4.00 |
| UI: focus ring on page / on modal | 3.33 / **2.74** | fail on modal | `--focus` Second bright | 12.09 / 9.93 |
| UI: unused mistake vs page | **1.46** | fail | outlined, `--muted` | 6.60 |
| UI: text field boundary vs modal | **1.20** | fail | `--field-border #85867C` | 3.36 |
| UI: selected segment vs track | **1.29** | fail | ring in `--select` | 10.67 |
| UI: board cell vs page (grid) | **1.46** | fail | box outline `#77786E` | 3.37 |

### Light theme

| Pair | Current | Result | Proposed | New |
| --- | --- | --- | --- | --- |
| Body text (Crimson on Bright) | 7.68 | pass AAA | – | – |
| Muted text on page / modal | 4.66 | pass (just) | `--muted` 0.92 (`#84524E`) | 6.28 |
| Muted text on Mud (resume info, difficulty labels, pills) | **3.71** | fail | `--muted` 0.92 | 4.70 |
| Stat chip label (70% opacity) | **3.07** | fail | full opacity, `--muted` 0.92 | 4.71 |
| Text on Mud / Second bright | 5.50 / 6.26 | pass | – | – |
| Bright on Crimson (keys, primary, toast) | 7.68 | pass AAA | – | – |
| Bright on Lava (Ranked tile) | **4.45** | fail | `#A85B37` | 4.91 |
| Keypad number, all placed (30%) | **2.09** | fail | 55% + check mark | 3.55 |
| Cell number on cell / on highlight | 5.50 / 4.83 | pass (large) | – | – |
| Same-number cell (Bright on Forest) | 5.69 | pass | – | – |
| Notes on highlight (≈8px) | 4.83 | pass (just) | size, see M11 | – |
| Daily missed day (50%) | **1.96** | fail | full contrast + mark | 6.28 |
| UI: row/column highlight vs cell | **1.14** | fail (supplementary) | High contrast mode | – |
| UI: selection ring on same-number fill | **1.35** | fail | Bright inner ring | 5.69 |
| UI: focus ring | 7.68 | pass | `--focus` Crimson | 7.68 |
| UI: unused mistake vs page | **1.40** | fail | outlined, `--muted` | 6.28 |
| UI: text field boundary vs modal | **1.40** | fail | `--field-border #8C8D76` | 3.34 |
| UI: selected segment vs track | **1.22** | fail | ring in `--select` | 6.74 |
| UI: action button vs page | 1.23 | n/a (labelled by text) | – | – |
| UI: board cell vs page (grid) | **1.40** | fail | box outline `#8C8D76` | 3.34 |

### Colour-blind simulation (cell states)

States compared pairwise: cell, row/column highlight, same number, wrong, hint flash. Pairs below ΔE 15 or ratio 1.5:

| Theme | Vision | Pair | ΔE | Fix |
| --- | --- | --- | --- | --- |
| both | all | cell / row-column highlight | 5.2–12.2 | supplementary; High contrast + box option |
| dark | all | same number / hint flash | 0 | hint uses an outline pulse (m11) |
| light | deuteranopia | same number / **wrong** | **8.2** | wrong gets a slash mark + announcement (M4) |
| light | protanopia | same number / wrong | 17.8 (ratio 1.49) | same |
| light | all | wrong / hint flash | 0 | hint outline pulse (m11) |

---

## 3. Proposed palette (design tokens)

The palette stays the Figma one: two tokens are nudged, the rest are new tokens built from existing colours. Nothing turns black, pure white or pure red.

| Token | Dark now | Dark proposed | Light now | Light proposed | Why |
| --- | --- | --- | --- | --- | --- |
| `--c-lava` | `#B1613C` | `#A85B37` | same | same | Bright text on Lava reaches 4.91:1 |
| `--muted` | Bright 62% | unchanged | Crimson 80% | Crimson 92% (`#84524E`) | 4.70:1 on Mud, 6.28:1 on page |
| `--focus` (new) | – | Second bright `#E8E8CE` | – | Crimson `#794341` | One focus colour, ≥7.6:1 on every surface |
| `--select-inner` (new) | – | none | – | Bright `#FFFFE5` | Selection visible on a Forest fill |
| `--field-border` (new) | – | `#85867C` | – | `#8C8D76` | Field edges at 3.3:1 |
| `--grid-line` (new) | – | `#77786E` | – | `#8C8D76` | 3×3 box outline at 3.3:1 |
| `--mistake-off` | `#40413C` fill | outline in `--muted` | Mud fill | outline in `--muted` | Shape + 6:1 |
| `--cell-user` | = givens | Second bright, weight 500 | = givens | Crimson, weight 500 | Given vs entered by weight and tone |

**High contrast theme** (new, one per light/dark): text and numbers at full Bright / Bg, every cell outlined at ≥3:1, row/column/box highlight ≥3:1 against cells, selection 3px, focus 3px, no translucent text. **Colour-blind friendly mode**: the default palette plus shape cues (wrong = slash mark, hint = outline pulse, same number = underline bar) so no state depends on hue.

---

## 4. Proposed accessibility features

An **Accessibility** section in Setup, persisted with the other settings (local and synced to the account like Theme), defaulting to the system where one exists:

| Setting | Options | Default |
| --- | --- | --- |
| Text size | 100% · 125% · 150% · 200% (scales the type tokens and notes) | 100% |
| Contrast | Standard · High | follows `prefers-contrast: more` |
| Colour-blind friendly | On · Off (shape cues on wrong, hint, same number) | Off |
| Reduce motion | System · On · Off | System (`prefers-reduced-motion`) |
| Timer | Show · Hide (time still recorded and shown on the result) | Show |
| Highlights | Row and column · + 3×3 box · Same numbers (each on/off) | Row/column and same numbers on |
| Wrong numbers | Show briefly · Keep until next move | Briefly |
| Mistake limit (Casual only) | 3 · Off — **needs your decision, see D2** | 3 |
| Haptics | On · Off | On |
| Sounds (new) | On · Off; soft placement/mistake/complete cues | Off |

Plus:
- **Keyboard shortcuts panel**: `?` opens it in a game (and a "Keyboard shortcuts" link in Setup). Lists arrows, 1–9, Shift+1–9, N, Backspace, Ctrl/Cmd+Z, H (hint), P (pause), Esc.
- **Screen reader game flow**: board as an ARIA grid with roving focus, full cell labels, a polite live region for game events, the result dialog focused and announced.
- **Accessibility statement** page (from Setup): what's supported, known limitations, how to send feedback.
- Visible-on-focus **skip link** "Skip to board" on the game screen.

### Decisions I need from you

| # | Decision | My recommendation |
| --- | --- | --- |
| D1 | Zoom: keep blocking pinch zoom (app feel) or allow it. | **Decided: zoom stays blocked on mobile** (a zoomed app shell drifts and players get lost). C3 is met instead by an in-app **Text size** setting up to 200% (WCAG technique G178), with every screen reflowing and scrolling at that size. axe's `meta-viewport` finding is a documented, accepted exception. |
| D2 | A Casual-only "no mistake limit" / "don't check numbers" option changes a game rule. | Offer "Mistake limit: Off" in **Casual only**; Ranked, Daily, Clash unchanged; such games are marked and earn no Stardust bonus. Or skip it. |
| D3 | Lava `#B1613C` → `#A85B37` changes the brand colour slightly (also in Figma). | Yes: the difference is barely visible and it fixes nine failing pairs. |
| D4 | Given vs entered numbers will differ (weight + tone); the Figma said identical. | Yes: it's a key sudoku affordance. |
| D5 | Rebuilding the board DOM by rows (boxes drawn in CSS). Pixel-identical, but touches the board code. | Yes: it's the only clean way to a valid ARIA grid. |
| D6 | Test tooling: the web package has no tests. Add **Playwright + @axe-core/playwright** (real browser, catches contrast) as dev dependencies. | Yes, plus the contrast script as a test (`npm test`). |

---

## 5. Prioritized plan

Commits on `accessibility`, in this order (each small and reviewable):

1. **Tokens & contrast**: Lava, `--muted`, `--focus`, `--select-inner`, `--field-border`, `--grid-line`; skulls, segments, done keys, missed days; given vs entered; contrast script + test. (M5–M10, M12, M15, M3, m2, m3)
2. **Dialogs & keyboard**: accessible `openModal` (role, focus in/out, trap, Esc), coach and hint cards, `click` activation for keypad/Notes/Undo, skip link, page titles, landmarks, headings. (C1, C4, M13, M14, m4, m7)
3. **Board & screen reader**: board by rows with roving focus, full cell labels, live region for game events, wrong-number slash mark, hint outline pulse. (C2, M1, M2, M4, m11)
4. **Settings & features**: Accessibility section (text size, contrast, colour-blind, motion, timer, highlights, wrong numbers, haptics, sounds, mistake limit if approved), shortcuts panel, High contrast themes, notes size. (C3, M11, M16, m5, m6, m8, m9, m10)
5. **Tests & docs**: Playwright + axe on every screen in both themes, keyboard-only game test, accessibility statement page, `CLAUDE.md` rules, before/after results here.

### Current screen reader experience (one game, before fixes)

Home: tiles read as buttons ("Casual"); the profile card reads as loose text. Opening Casual: nothing is announced and focus stays behind the pop-up; the user must swipe past the whole Home screen to reach "Resume Easy". In the game: the board reads "Sudoku board", then 81 items such as "Row 1, column 3: empty" in box order (1-1, 1-2, 1-3, 2-1…), not row order; cells can't be activated to select, so VoiceOver users can only play by moving a hardware keyboard's arrows from an unknown position. The on-screen keypad may work with VoiceOver on iOS (which sends touch events) but not with NVDA/JAWS/macOS VoiceOver (which send clicks). Wrong numbers, mistakes and hints are silent. The win/loss dialog appears without being announced. Result: a blind player cannot complete a game today.

---

## 6. Results after Phases 3–4

Commits on `accessibility`: `fe2de2f` tokens & contrast · `038b440` dialogs & keyboard · `7012c7b` board & screen reader · `95f213b` settings & features · tests & docs (this commit).

### Issue status

| ID | Status | How |
| --- | --- | --- |
| C1 | Fixed | Keypad, Notes, Undo act on `click` too (a tap still counts once); Playwright presses Enter/Space on them |
| C2 | Fixed | Board is 9 `row`s × 9 `gridcell`s in reading order, boxes drawn by CSS (pixel-identical); roving `tabindex`, `aria-selected`, givens `aria-readonly`; "Skip to board" link |
| C3 | Fixed (D1) | Text size 100/125/150/200% scales every type token; Home turns into one column, game status/actions wrap, every screen scrolls; zoom stays blocked by decision |
| C4 | Fixed | `openModal` = labelled `dialog` + `aria-modal`, focus in, Tab trapped, Esc closes, page behind `inert`, focus returns |
| M1 | Fixed | Polite live region: wrong number + mistakes left, completed row/column/box, hint placed, paused/resumed, notes on/off |
| M2 | Fixed | "Row 5, column 7, box 6: 1, wrong" / "7, given" / "8, your number" / "empty, notes 1 4 9" |
| M3 | Fixed (D4) | Your numbers: Forest tone + weight 500; givens unchanged |
| M4 | Fixed | Corner slash on wrong cells; announcement; "Wrong numbers: until next move" option. Rule unchanged |
| M5 | Fixed (D3) | Lava `#A85B37`: 4.91:1 |
| M6 | Fixed | `--focus` ring everywhere incl. cells (9.9–12:1 dark, 7.7:1 light) |
| M7 | Fixed | Inner Bright ring inside the selection (5.69:1 on Forest) |
| M8 | Fixed | Ring on selected difficulty and Setup options |
| M9 | Fixed | Light `--muted` 0.92; stat labels at full opacity |
| M10 | Fixed | Unused skulls outlined in `--muted`; "1 of 3 mistakes" as one labelled image |
| M11 | Fixed | Notes `clamp(9px, 2.3cqi × text scale, 3cqi)` |
| M12 | Fixed | Field edge `--field-border` 3.3:1 |
| M13 | Fixed | Tutorial and hint cards: focus on Next, Tab trapped, Esc skips, steps announced |
| M14 | Fixed | Square code chip hit area ≥ 30px tall |
| M15 | Fixed | Missed days: readable number + slash |
| M16 | Fixed | Timer: Show/Hide (time still recorded) |
| m1 | Mitigated | High contrast outlines highlighted cells; colour-blind mode adds an edge; default unchanged (supplementary) |
| m2 | Fixed | 3×3 box outline at 3.3:1 |
| m3 | Fixed | All-placed keys at 55% + a check mark |
| m4 | Fixed | `<main>`, a hidden `h1` on Home and the game, page titles per screen, heading order |
| m5 | Open | Toast timing unchanged (2.4s+); every toast is also `role="status"` |
| m6 | Open | Over-par timer still signalled by colour only |
| m7 | Fixed | Splash label "Elomental. Continue." |
| m8 | Fixed | Vibration on/off |
| m9 | Fixed | Reduce motion: System / Reduce |
| m10 | Fixed | Shortcuts panel (`?`), also in Setup; statement lists the keyboard alternatives |
| m11 | Fixed | Hints flash with a ring, not only a fill |

### Before / after

| Check | Before | After |
| --- | --- | --- |
| Required contrast pairs failing (both themes) | 29 | **0** (10 supplementary/decorative pairs below ratio by design, listed in `ACCEPTED`) |
| Colour-blind look-alike states without a shape cue | 3 (light: same/wrong, wrong/hint; dark: same/hint) | **0** (slash on wrong, ring on hint; tested by `npm test`) |
| axe, game screen | 4 violations (2 critical ARIA grid, 1 prohibited attr, 1 zoom) + landmarks | **0** (zoom excluded by decision D1) |
| axe, Home / Casual pop-up / Setup | contrast (Play button), landmarks, zoom | **0** |
| Keypad/Notes/Undo by keyboard | did nothing | work |
| Pop-up focus | stayed on the page behind; Esc ignored | moves in, trapped, Esc closes, returns |
| Automated tests | none in the web package | `npm test` (contrast + colour-blind), `npm run test:a11y` (Playwright + axe, 12 tests, dark and light) |

### Keyboard-only walkthrough (one game)

1. The splash advances by itself (or Enter). On Home, Tab reaches the tiles in reading order; Enter on **Casual** opens the dialog with focus on its title.
2. Tab to **Easy / Medium / Hard** (radio buttons), Enter to pick, Tab to **Play Easy**, Enter. Esc would close the dialog and return focus to the Casual tile.
3. In the game, the first Tab is **Skip to board**; Enter lands on the centre cell (or the last selected one).
4. Arrows move around the board (wrapping at the edges); the focus ring and the selection move together. 1–9 place a number, Shift+1–9 toggle a note, N switches notes mode, Backspace erases, Ctrl/Cmd+Z undoes, H asks for a hint (the explanation card takes focus; Enter steps through, Esc closes), P pauses and resumes.
5. Tab from the board reaches the keypad, Erase, Hint, Undo and Notes; Enter/Space activate them.
6. `?` opens the shortcuts dialog at any time. The result dialog takes focus when the game ends; Tab reaches its buttons.

### Screen reader experience (one full solve, as built)

Home is announced as "Elomental, heading level 1", then the profile and the tiles as buttons. Opening Casual announces "Casual, dialog" and reads its title; "Resume Easy, 1:24 · 38% done", the "New game" radio group and "Play Easy" follow. In the game the reader hears the page title "Casual · Easy", the mistakes as "0 of 3 mistakes", then "Sudoku board, grid". Moving with arrows reads each cell: "Row 1, column 3, box 1: 5, given", "Row 5, column 7, box 6: empty, notes 1 4 9". Typing a number updates the focused cell's label ("…: 8, your number"); a wrong number is announced as "Wrong number. 2 mistakes left."; finishing a line says "Row 4 and box 5 complete."; a hint says "Hint: 7 in row 3, column 5." The clock is never announced. The final number opens the result dialog, which takes focus and reads its title and stats.

This is the designed behaviour, verified in Chromium's accessibility tree by the Playwright tests. It has **not yet been tested with VoiceOver, TalkBack or NVDA**; see the human test list below.

### Remaining limitations

- Pinch zoom stays blocked on phones (D1); Text size is the supported way to enlarge text.
- The notes wheel is pointer-only; keyboard and screen reader players use Notes mode or Shift+number.
- Accessibility preferences sync to the account like Theme (`settings.a11y`, merged key by key) once migration `20261018120000_settings_a11y.sql` is applied; until then they stay on the device.
- Toast timing (m5) and the over-par timer colour (m6) are unchanged.
- High contrast covers the board, controls and text; the decorative waves and the home tiles keep their palette colours.

### Needs a human test with real assistive technology

- VoiceOver on iPhone (installed app and Safari): moving through the grid with swipes and with a keyboard, double-tap on keypad keys, live announcements during play, the result dialog.
- TalkBack on Android Chrome: the same flow.
- NVDA + Firefox/Chrome and VoiceOver on macOS: grid navigation in browse vs focus mode, dialogs.
- Switch Control (iOS) through the keypad and actions.
- 200% text on a real small phone (iPhone SE size) in both orientations.
