# Palette as a token system (UI review, 2026-10-21)

*Built the same day: the generator is now `packages/web/scripts/palette.ts`, writing
`src/styles/palette.css`; the files in `docs/review/palette/` are the proposal as reviewed and
are not kept up to date. Changes from this proposal: Common has its own `iron` ramp (500 at
H 70, off the Forest hue, after the illustrator review); the light Starforged plate is
`--c-star-600`; the reveal ring uses `-line`; pale crest discs and the leader tile take their
`-mark` edge.*

Report only. Nothing under `packages/` or the existing docs was changed.

The files for this review are in `docs/review/palette/`:

- `tokens-proposal.css`: a drop-in replacement for `packages/web/src/styles/tokens.css`. It is not wired in, and `build.ts` generates it.
- `build.ts`: builds the ramps and role mappings, writes the CSS and the specimen, then checks everything with the app's own checker. It imports `PAIRS`, `ACCEPTED`, `contrast()` and `themes()` from `packages/web/scripts/contrast.ts` and only reads from `packages/`. Run it with `node --no-warnings docs/review/palette/build.ts`.
- `colour.ts`: OKLab/OKLCH, WCAG contrast and the Machado colour-blindness matrices. These are the same matrices `contrast.ts` uses.
- `specimen.html`: tags, crests, frame rings, the strength bar, inks, lines and washes. Each is shown in both themes, before and after, and under deuteranopia and protanopia. Open it in a browser.

## 1. In one paragraph

Every hue now has one ramp with steps 100 to 900. The steps are defined by luminance, not by look, so **step N of any hue has the same contrast against every surface as step N of any other hue**. The result is one mapping rule for every hue:

| Role | Dark | Light | Dark HC | Light HC |
| --- | --- | --- | --- | --- |
| fill | the swatch's fill step | same | same | same |
| ink | 300 | 600 | 200 | 700 |
| line | 400 | 500 | 300 | 600 |

Text on a fill is Bright for deep fills (500 and darker) and Bg for light fills (400 and lighter).

A new element, rarity or accent takes one ramp entry (a hue, a chroma and the fill step) plus one swatch line in `build.ts`. The generator writes the 9 steps, the role tokens for all four theme variants and the checker pairs.

Every existing colour sits on a step. Three of them move because you asked: Water, Air and Mythic. Three get small nudges, and section 4 lists each one. Lava, Forest, Crimson, Ember, every beige and olive surface, the board and the plates are unchanged to the hex.

## 2. Audit: what exists and what was inconsistent

I read `tokens.css`, `accessibility.css`, `contrast.ts` and the rules that use `--r-*` and `--el-*`: forge.css (tags, Mythic edge and corner, reveal ring), leaderboard.css (leader mark, strength bar and dots, badge art) and modals.css (avatar frame ring, gems, studs, crests). I also looked at the Home and Forge screenshots in both themes in `docs/review/`.

1. **The rarity and element fills had no roles.** Each was one hex with Bright text "baked in". Components hard-code `color: var(--c-bright)` on them in seven places: `.rarity-tag`, `.reveal-rarity`, `.lb-leader-mark`, `.strength-dot`, `.badge-mark`, `.crest-mark`, and the stroke of `.gem` and the fill of `.stud`. A light fill, which the owner's grey-white Air has to be, cannot work under that rule.
2. **There was no "the hue as text" or "the hue as a line" token except for Lava** (`--accent-text` = Ember). A Water label or a Rare outline had nothing to use.
3. **Old Mythic `#9b3b3e` was almost Crimson.** Hue 21 against 23, ΔE 0.066, and under protanopia ΔE **0.014**. The top rarity looked like the Daily tile.
4. **Old Air `#867137` was a mustard.** Under deuteranopia it was identical to Fire: ΔE **0.005**.
5. **Old Water `#386f71` was teal**, not blue, and sat near Rare: ΔE 0.058, and under tritanopia **0.015**.
6. **Rare and Epic looked alike under deuteranopia** (ΔE **0.023**). They sit side by side in the Forge grid.
7. **Theme greys were raw hexes**: `--line`, `--field-border`, `--grid-line`, `--separator`, and the High contrast borders in accessibility.css. Two of them were near-duplicates of a palette colour: `#e8e8cc` against Second bright `#e8e8ce`, and `#383932` against Highlight `#343530`.
8. **The plates were raw hexes per theme**, outside the palette.
9. **The light-theme Gold and Starforged plates are the same colour**: `#8f6a12` against `#946410`, ΔE **0.017**. This existed before; see section 9.
10. **Fire and Earth look alike under protanopia** (ΔE **0.019**). This also existed before. Lava and Forest stay as they are; section 6 has the non-colour fix.

## 3. The system

### 3.1 Steps by luminance

| Step | Luminance (WCAG Y) | Its job, on every hue |
| --- | --- | --- |
| 100 | 0.78 | palest tint |
| 200 | 0.64 | ink on dark in High contrast (6.4 to 7:1 on surface-2); a light fill, Air |
| 300 | 0.44 | **ink on dark**: 4.5:1 or better on page, surface, surface-2 and modal |
| 400 | 0.30 | **line on dark** (3:1 on each); a light fill under Bg text (5:1): Water, Mythic |
| 500 | 0.14 | **fill under Bright text** (5:1); **line on light** (3:1 on Mud) |
| 600 | 0.082 | **ink on light**: 4.5:1 or better on page, surface, Mud and modal |
| 700 | 0.052 | ink on light in High contrast (7:1 on Mud) |
| 800, 900 | 0.035, 0.020 | the dark surfaces and their tints (Highlight, Bg, Lava highlight) |

Generated steps take the ramp's own hue and chroma from its anchors, interpolated between them. The chroma follows the Figma set's own taper: tints and shades are quieter. Then the lightness is solved for the step's luminance. An existing colour (an "anchor") keeps its exact hex. Its luminance is off the nominal value by up to about 0.03, and the checker measures it as it is.

The neutrals keep three half steps (375, 425 and 450) where the tuned borders already sit. They are numbered by the same luminance scale, so nothing had to move to make the numbers even.

### 3.2 Ramps

Bold means an existing colour kept exactly. The rest are generated.

| Ramp | Hue | 100 | 200 | 300 | 375 | 400 | 425 | 450 | 500 | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stone | dark-theme neutrals, Common | #e4e6d9 | #d1d2c6 | #b1b2a6 | **#9a9b8f** | | **#85867c** | **#77786e** | **#6d6d5f** | #515248 | **#40413c** | **#343530** | **#262721** | **#141511** |
| sand | light-theme neutrals (50 = **#ffffe5**) | **#e8e8ce** | **#dadbb9** | **#b3b5a0** | | **#8c8d76** | | **#7a7b64** | **#6b6c58** | #52523f | #41422f | #353523 | #272716 | |
| lava | Fire, Ranked, dark accent | #fddfcf | #fac7ac | **#e69c74** | | #d18159 | | | **#a85b37** | #7a421f | #5e381b | **#413226** | #2f251d | |
| forest | Earth, Casual, "on" | #e3e7ca | **#c9d09d** | #aeb778 | | #919a64 | | | **#636945** | #4e5433 | #3e4326 | #333628 | #26281f | |
| crimson | Daily, light ink and accent | #f8dfde | #f1c8c5 | #dea39f | | #c48481 | | | #945856 | **#794341** | #623432 | #462e2d | #332322 | |
| tide | **Water (new)** | #d2e8f4 | #b2d7eb | #7fb9d5 | | #5d9dbb | | | #2e6f8c | #165771 | #0b465c | #203743 | #1a2930 | |
| mist | **Air (new)** | #d6e7ed | #c4d4da | #a0b4bc | | #8198a2 | | | #526d77 | #3b545f | #2b444e | #1f3841 | #112933 | |
| azure | Rare (nudged) | #d8e7f6 | #bcd4ee | #91b5d9 | | #7298c0 | | | #4a6f95 | #315476 | #254260 | #283645 | #1e2831 | |
| amethyst | Epic | #eee0f5 | #e1caee | #c8a5da | | #ad86c1 | | | **#6f4b81** | #654376 | #523561 | #3e3045 | #2d2331 | |
| flame | **Mythic (new)** | #ffddd4 | #ffc4b3 | #fa977c | | #e2765a | | | #ae492d | #903117 | #76240d | #522a1f | #3a2019 | |
| bronze | Bronze plate | | #f1caae | #dea57d | | **#c4875a** | | | **#9a5b2c** | #7c4213 | #653409 | | | |
| silver | Silver plate | | #cdd2d7 | **#b3bac1** | | #8c96a0 | | | **#66707c** | #49525c | #3a424b | | | |
| gold | Gold plate, medals, light glow | | **#f0cd78** | **#c9a54e** | | #b79034 | | | **#8f6a12** | #6a4c00 | #553d00 | | | |
| star | Starforged plate (`--plate-elo`) | | **#ecd38c** | #d7ab47 | | #be8c2a | | | **#946410** | #6f4900 | #5a3a00 | | | |

Two primitives sit outside the ramps: `--c-white` (glass sheen only, already used as `rgba(255,255,255,…)`) and `--c-black` (shadows only).

Two anchors sit off their nominal step, and I kept them as they are. Crimson is at 600, because it is the light theme's ink and is darker than the other fills. Epic `#6f4b81` sits at 500 but is a little darker than the band, so amethyst-600 is only slightly deeper than it. Neither costs any contrast: Bright on Epic is 6.9:1.

### 3.3 Naming

- Primitives: `--c-<ramp>-<step>`, for example `--c-tide-400`. These keep the existing `--c-` meaning of "palette colour".
- Swatches: `--<set>-<name>-<role>`. The set is `el` (element), `r` (rarity) or `tone` (the Home tile hues: Lava, Forest, Crimson). Examples: `--el-water-fill`, `--r-mythic-line`, `--tone-lava-wash`.
- Roles:

| Role | Use | Guarantee |
| --- | --- | --- |
| `fill` | a solid tag, tile, chip or crest disc | the same in both themes |
| `on` | text or icon on the fill | 4.5:1 |
| `ink` | the hue as text or icon on the page, surface, surface-2 and modal | 4.5:1 on each |
| `line` | a border or ring that must be seen (focus-like rings, the Mythic edge, the reveal ring) | 3:1 on each surface |
| `wash` | a faint tint behind something chosen: 500 at 18% (dark), 14% (light) | theme text and the ink stay at 4.5:1 or better on it |
| `mark` | the hue as a shape without text (frame ring, bar segment, dot, a fill's 1px edge) | equals the fill, except that a light fill on the light theme takes its line, so it doesn't vanish |

- Component-local variables keep one name per family: `--rc-*` for rarity (`--rc`, `--rc-on`, `--rc-mark`, `--rc-line`) and `--el-*` for elements (`--el`, `--el-on`, `--el-mark`). A component never names a hue.

### 3.4 Light and deep fills

| Swatch | Ramp | Fill | Text on it |
| --- | --- | --- | --- |
| Fire, Ranked | lava | 500 `#a85b37` | Bright, 4.91:1 |
| Earth, Casual | forest | 500 `#636945` | Bright, 5.69:1 |
| Daily | crimson | 600 `#794341` | Bright, 7.68:1 |
| Common | stone | 500 `#6d6d5f` | Bright, 5.17:1 |
| Rare | azure | 500 `#4a6f95` | Bright, 5.17:1 |
| Epic | amethyst | 500 `#6f4b81` | Bright, 6.90:1 |
| **Water** | tide | **400** `#5d9dbb` | **Bg**, 5.02:1 |
| **Mythic** | flame | **400** `#e2765a` | **Bg**, 5.00:1 |
| **Air** | mist | **200** `#c4d4da` | **Bg**, 9.88:1 |

This split is what keeps the near-collisions apart (section 6). Within each family, one member flips: Air among the elements, Mythic among the rarities, and Water sits between the two. So the most similar hues are also opposite in lightness, and lightness is the cue that survives every kind of colour blindness.

## 4. Existing colours that move

| Token | Old | New | ΔE OKLab | Why |
| --- | --- | --- | --- | --- |
| `--el-water` | `#386f71` | `#5d9dbb` (tide-400) | 0.165 | You asked for a blue. The old one was teal, and its colour sat on Rare. |
| `--el-air` | `#867137` | `#c4d4da` (mist-200) | 0.318 | You asked for grey-white. The old one was mustard and matched Fire under deuteranopia. |
| `--r-mythic` | `#9b3b3e` | `#e2765a` (flame-400) | 0.200 | You asked for reddish-orange. The old one was the Crimson hue. |
| `--r-rare` | `#41668b` | `#4a6f95` (azure-500) | 0.031 | **Nudge.** The same blue, one notch lighter: Y 0.125 to 0.150, Bright on it 5.91 to 5.17:1. It lifts Rare against Epic under deuteranopia from 0.023 to 0.053, in the grid where they sit side by side. Small (about 1.5 times a just-noticeable step). |
| `--line` (dark) | `#383932` | `#40413c` (stone-700) | 0.032 | **Nudge, optional.** It merges into the separator and surface-2 step. Today the hairline is 1.06:1 on the modal and card surfaces it divides, which is effectively invisible. It becomes 1.20:1, a hairline you can just see, which matches the spacing guide's "with a hairline between". It has no effect on any checked pair. |
| `--separator` (light) | `#e8e8cc` | `#e8e8ce` (sand-100) | 0.003 | **Merge, invisible.** It was a two-unit typo of Second bright. |

Nothing else changes. `build.ts` resolved every existing token in all four theme variants, old and new, and the list above is complete. No existing PAIRS ratio moved by more than 0.05.

There are also raw composites in `base.css`. They are left alone because they are derived, not palette colours:

| Value | What it is |
| --- | --- |
| `#323330` | the frost colour over Bg |
| `#dddec6` | Rock at 45% over Bright |
| `#1a1b16` and `#5f5f55` | the coach shade over each page |

They could become `color-mix()` of their tokens later, but that is out of scope here.

## 5. The new hues, and where I want the art's input

- **Water, tide H 230, C 0.08.** A dusty sea blue, the same family as the light blue avatar face on Home and Forge, so it sits in the existing art rather than beside it. Its deep steps (600 `#165771`, 700 `#0b465c`) are a proper ocean for ink on the light theme. *Art:* I need Water's painted art (crest, frame gems, any wave motif) to read against a light blue disc with dark marks. The current marks are cream.
- **Air, mist H 220, C 0.02.** A cool grey-white, cloud rather than paper. It is cool on purpose so it never reads as a warm-beige surface or as a disabled chip. Its darker steps carry a little more chroma (0.035), so Air's outline on the light theme reads slate, not grey (see Common against Air below). *Art:* a frame ring in a pale colour is a design problem on the light theme. Section 7 has the token answer (the ring takes the mark, a slate line). A nicer one is a double stroke: a pale fill stroke with slate hairlines either side. That is the illustrator's call.
- **Mythic, flame H 36, C 0.14.** A reddish-orange between Crimson (H 23) and Lava (H 45). It has the most chroma in the palette, by about 10% (Lava is 0.113, old Mythic 0.129), so it is the one thing that glows without turning neon. It is a light fill, so on the dark theme the Mythic tag is the only luminous tag in the Forge grid. That is the prestige, carried by the colour itself. On the light theme it gets a flame-500 edge. *Art:* check the Mythic reveal flare (`radial-gradient` from Bright into the rarity colour). With a lighter rarity colour it will read brighter, which is probably right for the rarest moment, but the illustrator should confirm it.

## 6. Near-collisions and how they stay apart

The numbers are ΔE in OKLab for normal / deuteranopia / protanopia / tritanopia vision (Machado 2009, full severity). As a guide, 0.10 or more is clearly apart at a glance, 0.05 to 0.10 is apart side by side, and under 0.05 is a near-collision. Every pair here is always shown with its name or crest. These numbers are about telling them apart at a glance.

| Pair | Dark | Light | Before (dark) |
| --- | --- | --- | --- |
| **Rare vs Water** (fills) | 0.137 / 0.135 / 0.143 / 0.137 | same | 0.058 / 0.050 / 0.053 / **0.015** |
| **Common vs Air** (fills) | 0.331 / 0.328 / 0.338 / 0.329 | same | 0.066 / 0.069 / 0.064 / 0.054 |
| Common vs Air (marks, light theme) | n/a | 0.112 / 0.115 / 0.098 / 0.115 | n/a |
| **Mythic vs Fire** (fills) | 0.134 / 0.131 / 0.114 / 0.136 | same | 0.085 / 0.074 / 0.093 / 0.072 |
| **Epic vs Crimson** (fills) | 0.101 / 0.100 / 0.105 / 0.068 | same | unchanged |
| Rare vs Epic | 0.106 / 0.053 / 0.090 / 0.125 | same | 0.094 / **0.023** / 0.059 / 0.116 |
| Common vs Rare | 0.091 / 0.093 / 0.087 / 0.082 | same | 0.096 / 0.101 / 0.085 / 0.090 |
| Common vs Epic | 0.126 / 0.104 / 0.121 / 0.070 | same | unchanged |
| Epic vs Mythic | 0.262 / 0.273 / 0.215 / 0.261 | same | 0.128 / 0.124 / 0.110 / 0.131 |
| Fire vs Earth (marks) | 0.119 / 0.068 / **0.019** / 0.147 | same | unchanged |
| Fire vs Water (marks) | 0.221 / 0.178 / 0.221 / 0.263 | 0.197 / 0.163 / 0.127 / 0.231 | 0.174 / 0.125 / 0.084 / 0.227 |
| Fire vs Air (marks) | 0.332 / 0.311 / 0.370 / 0.342 | 0.193 / 0.178 / 0.112 / 0.227 | 0.080 / **0.005** / **0.038** / 0.089 |
| Water vs Earth (marks) | 0.195 / 0.187 / 0.211 / 0.186 | 0.114 / 0.114 / 0.109 / 0.091 | 0.074 / 0.070 / 0.066 / 0.083 |
| Water vs Air (fills) | 0.204 / 0.207 / 0.181 / 0.213 | same | 0.125 / 0.121 / 0.096 / 0.143 |
| Water vs Air (marks, light ring) | n/a | 0.094 / 0.088 / 0.101 / 0.097 | n/a |
| Earth vs Air (marks) | 0.359 / 0.355 / 0.365 / 0.353 | 0.106 / 0.111 / 0.098 / 0.093 | 0.065 / 0.064 / **0.047** / 0.071 |
| Mythic vs Water (both light fills) | 0.219 / 0.161 / 0.138 / 0.285 | same | n/a |
| Epic vs Water (cross-family) | 0.223 / 0.187 / 0.233 / 0.234 | same | 0.133 / 0.052 / 0.095 / 0.123 |
| Common vs Earth (cross-family) | **0.041 / 0.036 / 0.038 / 0.025** | same | unchanged |
| Rare vs Water (ink, text only) | **0.024 / 0.005 / 0.009 / 0.026** | **0.026 / 0.008 / 0.010 / 0.008** | n/a |
| Mythic vs Fire (ink, text only) | **0.037 / 0.018 / 0.011 / 0.019** | 0.052 / **0.017 / 0.021** / 0.060 | n/a |
| Gold vs Starforged plate | 0.136 / 0.135 / 0.143 / 0.135 | **0.017 / 0.006 / 0.013 / 0.019** | unchanged |

How each requested pair stays apart in both themes:

- **Rare vs Water.** Opposite lightness and text polarity. Rare is a deep slate blue with Bright text; Water is a light sea blue with dark text. The hue also moved 20 degrees apart (H 250 against 230). Lightness survives every kind of colour blindness, which is why every column is at 0.13 or more.
- **Common vs Air.** Opposite lightness and temperature. Common is a mid warm grey; Air is a pale cool grey-white. On the light theme Air's shapes take a slate edge (mist-600), darker and cooler than Common's warm mid grey: 0.10 or more in every vision.
- **Mythic vs Fire.** Opposite lightness: a luminous flame with dark text against a deep Lava with Bright text. They also differ in hue (36 against 45) and chroma (0.14 against 0.113).
- **Epic vs Crimson.** These were already apart (0.10, and 0.068 under tritanopia): purple against brick, one cool and one warm. Both are kept as they are. Old Mythic was the real Crimson look-alike, and it is gone.

What remains, and why I don't move colour for it:

- **Inks of the same lightness band look alike** (Rare/Water, Mythic/Fire). That is the price of "step N has the same contrast everywhere". Inks are always words ("Rare", "Water"), so this doesn't break the never-colour-alone rule. Don't use an ink as the only difference between two things.
- **Fire vs Earth under protanopia, 0.019.** This existed before. Lava and Forest are the owner's core colours, so I don't nudge them. The fix is shape: in the strength bar, put each element's crest glyph in its legend dot, which is already there, and keep the bar in the same fixed order as the legend. Section 9 asks the ux-reviewer to confirm the order is fixed.
- **Common vs Earth, 0.025 to 0.041.** This also existed before. They are never the same kind of thing (a rarity pill against an element crest or ring), and both always carry their name.
- **Gold vs Starforged on the light theme.** See section 9.

## 7. Contrast of every role pair

These come from the app's own checker (`contrast()` in `contrast.ts`) on the proposed stylesheet. Each cell is the weakest of page, surface, surface-2 and modal; the full per-surface rows come from `build.ts`. The result is **0 failures** in dark, light, dark HC and light HC. That covers 264 or 265 pairs per variant: all the existing PAIRS plus the 176 new ones. Every existing pair's ratio is unchanged.

| Swatch | Role | Need | Dark | Light | Dark HC | Light HC |
| --- | --- | --- | --- | --- | --- | --- |
| el-fire | on-fill | 4.5 | 4.91 | 4.91 | 4.91 | 4.91 |
| el-fire | ink | 4.5 | 4.60 `#e69c74` | 5.64 `#7a421f` | 6.78 `#fac7ac` | 7.20 `#5e381b` |
| el-fire | line | 3 | 3.43 `#d18159` | 3.51 `#a85b37` | 4.60 | 5.64 |
| el-fire | mark | 3 | 2.07 (accepted) | 3.51 | 2.07 (accepted) | 3.51 |
| el-fire | text / ink on wash | 4.5 | 10.50 / 4.76 | 5.30 / 5.44 | 10.50 / 7.02 | 5.30 / 6.94 |
| el-water | on-fill | 4.5 | 5.02 (Bg) | 5.02 | 5.02 | 5.02 |
| el-water | ink | 4.5 | 4.81 `#7fb9d5` | 5.62 `#165771` | 6.77 `#b2d7eb` | 7.24 `#0b465c` |
| el-water | line | 3 | 3.44 `#5d9dbb` | 3.93 `#2e6f8c` | 4.81 | 5.62 |
| el-water | mark | 3 | 3.44 | 3.93 | 3.44 | 5.62 |
| el-water | text / ink on wash | 4.5 | 10.68 / 5.06 | 5.26 / 5.37 | 10.68 / 7.13 | 5.26 / 6.92 |
| el-earth | on-fill | 4.5 | 5.69 | 5.69 | 5.69 | 5.69 |
| el-earth | ink | 4.5 | 4.83 `#aeb778` | 5.61 `#4e5433` | 6.37 `#c9d09d` | 7.28 `#3e4326` |
| el-earth | line | 3 | 3.44 `#919a64` | 4.07 `#636945` | 4.83 | 5.61 |
| el-earth | mark | 3 | 1.78 (accepted) | 4.07 | 1.78 (accepted) | 4.07 |
| el-earth | text / ink on wash | 4.5 | 10.66 / 5.07 | 5.27 / 5.38 | 10.66 / 6.69 | 5.27 / 6.97 |
| el-air | on-fill | 4.5 | 9.88 (Bg) | 9.88 | 9.88 | 9.88 |
| el-air | ink | 4.5 | 4.78 `#a0b4bc` | 5.66 `#3b545f` | 6.76 `#c4d4da` | 7.26 `#2b444e` |
| el-air | line | 3 | 3.41 `#8198a2` | 5.66 `#3b545f` | 4.78 | 7.26 |
| el-air | mark | 3 | 6.76 | 5.66 | 6.76 | 7.26 |
| el-air | text / ink on wash | 4.5 | 10.58 / 4.98 | 5.29 / 5.44 | 10.58 / 7.04 | 5.29 / 6.98 |
| r-common | on-fill | 4.5 | 5.17 | 5.17 | 5.17 | 5.17 |
| r-common | ink | 4.5 | 4.80 `#b1b2a6` | 5.59 `#515248` | 6.74 `#d1d2c6` | 7.26 `#40413c` |
| r-common | line | 3 | 3.66 `#9a9b8f` | 3.70 `#6d6d5f` | 4.80 | 5.59 |
| r-common | mark | 3 | 1.96 (accepted) | 3.70 | 1.96 (accepted) | 3.70 |
| r-common | text / ink on wash | 4.5 | 10.46 / 4.95 | 5.32 / 5.41 | 10.46 / 6.95 | 5.32 / 7.03 |
| r-rare | on-fill | 4.5 | 5.17 | 5.17 | 5.17 | 5.17 |
| r-rare | ink | 4.5 | 4.81 `#91b5d9` | 5.57 `#315476` | 6.76 `#bcd4ee` | 7.31 `#254260` |
| r-rare | line | 3 | 3.42 `#7298c0` | 3.70 `#4a6f95` | 4.81 | 5.57 |
| r-rare | mark | 3 | 1.96 (accepted) | 3.70 | 1.96 (accepted) | 3.70 |
| r-rare | text / ink on wash | 4.5 | 10.51 / 4.99 | 5.30 / 5.37 | 10.51 / 7.01 | 5.30 / 7.04 |
| r-epic | on-fill | 4.5 | 6.90 | 6.90 | 6.90 | 6.90 |
| r-epic | ink | 4.5 | 4.83 `#c8a5da` | 5.66 `#654376` | 6.81 `#e1caee` | 7.26 `#523561` |
| r-epic | line | 3 | 3.41 `#ad86c1` | 4.94 `#6f4b81` | 4.83 | 5.66 |
| r-epic | mark | 3 | 1.47 (accepted) | 4.94 | 1.47 (accepted) | 4.94 |
| r-epic | text / ink on wash | 4.5 | 11.10 / 5.28 | 5.16 / 5.31 | 11.10 / 7.45 | 5.16 / 6.81 |
| r-mythic | on-fill | 4.5 | 5.00 (Bg) | 5.00 | 5.00 | 5.00 |
| r-mythic | ink | 4.5 | 4.80 `#fa977c` | 5.62 `#903117` | 6.77 `#ffc4b3` | 7.30 `#76240d` |
| r-mythic | line | 3 | 3.42 `#e2765a` | 3.91 `#ae492d` | 4.80 | 5.62 |
| r-mythic | mark | 3 | 3.42 | 3.91 | 3.42 | 5.62 |
| r-mythic | text / ink on wash | 4.5 | 10.83 / 5.12 | 5.22 / 5.33 | 10.83 / 7.22 | 5.22 / 6.92 |
| tone-lava | (as el-fire) | | | | | |
| tone-forest | (as el-earth) | | | | | |
| tone-crimson | on-fill | 4.5 | 7.68 | 7.68 | 7.68 | 7.68 |
| tone-crimson | ink | 4.5 | 4.83 `#dea39f` | 5.50 `#794341` | 6.77 `#f1c8c5` | 7.20 `#623432` |
| tone-crimson | line | 3 | 3.42 `#c48481` | 3.91 `#945856` | 4.83 | 5.50 |
| tone-crimson | mark | 3 | 1.32 (accepted) | 5.50 | 1.32 (accepted) | 5.50 |
| tone-crimson | text / ink on wash | 4.5 | 10.65 / 5.07 | 5.27 / 5.27 | 10.65 / 7.11 | 5.27 / 6.90 |

The weakest surface is surface-2 in every row. "Accepted" means the deep fills keep their Figma depth on the dark theme. As bare shapes there (a frame ring, a bar segment, a dot) they sit under 3:1, as they do today: Lava is 2.07:1 on surface-2 now. They are always beside their name or crest. Anywhere a shape alone must be seen, use `line`. On the light theme every mark is 3:1 or better.

## 8. Exact checker changes (`packages/web/scripts/contrast.ts`)

**Remove** the eight rows that put Bright on every fill. Air, Water and Mythic take dark text now:

`'Common tag'`, `'Rare tag'`, `'Epic tag'`, `'Mythic tag'`, `'Fire fill'`, `'Water fill'`, `'Earth fill'`, `'Air fill'`.

**Add** these lines after `PAIRS`. The 11 swatches times 16 pairs make 176 rows, generated so that a new swatch is one word in `SWATCHES`:

```ts
/** Each element, rarity and Home tone (tokens.css "Swatches"): one entry here per swatch. */
export const SWATCHES = ['el-fire', 'el-water', 'el-earth', 'el-air', 'r-common', 'r-rare', 'r-epic', 'r-mythic', 'tone-lava', 'tone-forest', 'tone-crimson'];
const SURFACES: [string, string][] = [['page', '--bg'], ['surface', '--surface'], ['surface-2', '--surface-2'], ['modal', '--modal-bg']];
for (const s of SWATCHES) {
  PAIRS.push([`${s}: on-fill`, `--${s}-on`, `--${s}-fill`, 4.5]);
  for (const [n, t] of SURFACES) PAIRS.push([`${s}: ink on ${n}`, `--${s}-ink`, t, 4.5]);
  for (const [n, t] of SURFACES) PAIRS.push([`UI: ${s} line vs ${n}`, `--${s}-line`, t, 3]);
  for (const [n, t] of SURFACES) PAIRS.push([`UI: ${s} mark vs ${n}`, `--${s}-mark`, t, 3]);
  PAIRS.push([`${s}: text on wash (card)`, '--text', `--${s}-wash`, 4.5, '--surface']);
  PAIRS.push([`${s}: text on wash (page)`, '--text', `--${s}-wash`, 4.5, '--bg']);
  PAIRS.push([`${s}: ink on wash (card)`, `--${s}-ink`, `--${s}-wash`, 4.5, '--surface']);
}
```

**Add to `ACCEPTED`** the marks of the eight deep-fill swatches, each against the four surfaces:

```ts
for (const s of ['el-fire', 'el-earth', 'r-common', 'r-rare', 'r-epic', 'tone-lava', 'tone-forest', 'tone-crimson'])
  for (const n of ['page', 'surface', 'surface-2', 'modal'])
    ACCEPTED[`UI: ${s} mark vs ${n}`] =
      'dark theme: a deep fill as a shape (ring, dot, bar) always sits beside its name or crest; where a shape alone must be seen, use the line role (3:1). On the light theme the mark is 3:1 or better, and its line rows guard it';
```

Caveat: `ACCEPTED` is keyed by label, not by theme. These labels therefore also excuse a future light-theme regression of the same mark. For six of the eight the light mark *is* the light line (fill 500 = line 500), so the line row catches it. For Epic and Crimson the fill is darker than the line, so a regression there would need to be worse than the line's. If you want it airtight, change two lines so a key can be theme-qualified (`ACCEPTED[\`${theme}: ${label}\`] ?? ACCEPTED[label]` in the printout and in `test/contrast.test.ts`), and write the keys as `dark: UI: …` and `dark-hc: UI: …`.

## 9. Migration map (old name to new, nothing breaks)

The order matters. The Water, Air and Mythic fills become light, so every rule that writes Bright on them must switch to `-on` **before** the three hues change.

**Step 1: tokens with aliases, no visual change.** Land `tokens-proposal.css` and the High contrast blocks at its end (they go into `accessibility.css`), but keep the old hexes on the swatches that move. Temporarily set `--el-water-fill: #386f71`, `--el-air-fill: #867137` and `--r-mythic-fill: #9b3b3e`, and set their `-on` to Bright. Every old name keeps working:

| Old | New |
| --- | --- |
| `--c-bg` | `--c-stone-900` |
| `--c-highlight` | `--c-stone-800` |
| `--c-highlight-2` | `--c-stone-700` |
| `--c-bright` | `--c-sand-50` |
| `--c-second-bright` | `--c-sand-100` |
| `--c-mud` | `--c-sand-200` |
| `--c-rock` | `--c-sand-300` |
| `--c-lava` | `--c-lava-500` |
| `--c-lava-highlight` | `--c-lava-800` |
| `--c-ember` | `--c-lava-300` |
| `--c-forest` | `--c-forest-500` |
| `--c-forest-highlight` | `--c-forest-200` |
| `--c-crimson` | `--c-crimson-600` |
| `--r-common` / `-rare` / `-epic` / `-mythic` | `--r-<rarity>-fill` |
| `--el-fire` / `-water` / `-earth` / `-air` | `--el-<element>-fill` |
| dark `--accent-text` (Ember) | equals `--tone-lava-ink` |
| dark `--chosen-bg` | `--tone-lava-wash` (the same rgba) |
| light `--accent-text`, `--text` (Crimson) | equal `--tone-crimson-ink` |
| `--plate-bronze/silver/gold/elo`, dark | `--c-bronze-400`, `--c-silver-300`, `--c-gold-300`, `--c-star-200` |
| `--plate-bronze/silver/gold/elo`, light | `--c-bronze-500`, `--c-silver-500`, `--c-gold-500`, `--c-star-500` |
| `--field-border` | dark `--c-stone-425`, light `--c-sand-450`, HC dark `--c-stone-375`, HC light `--c-sand-500` |
| `--grid-line` | dark `--c-stone-450`, light `--c-sand-400`, HC as `--field-border` |
| dark `--separator`, `--line` | `--c-stone-700` (`--line` is the optional nudge) |
| light `--separator` | `--c-sand-100` |

**Step 2: components read the roles.** These are the only rules that change:

| File | Change |
| --- | --- |
| forge.css `.rarity-*` | `--rc: var(--r-x-fill); --rc-on: var(--r-x-on); --rc-mark: var(--r-x-mark); --rc-line: var(--r-x-line)` |
| forge.css `.rarity-tag`, `.reveal-rarity` | `color: var(--rc-on)`, plus `box-shadow: inset 0 0 0 1px var(--rc-mark)` (invisible on deep fills; the Mythic edge on light) |
| forge.css Mythic `::before` border and `::after` corner | `var(--r-mythic-line)` |
| forge.css `.part-reveal` ring and the `reveal-shine` keyframes | `var(--rc-mark)` |
| leaderboard.css `.el-*` in `.lb-faction`, `.lb-strength-legend`, `.badge-art` | add `--el-on: var(--el-x-on); --el-mark: var(--el-x-mark)` |
| leaderboard.css `.lb-leader-mark`, `.strength-dot`, `.badge-mark` | `color: var(--el-on)` |
| leaderboard.css `.badge-inner` | `stroke: var(--el-on)` |
| leaderboard.css `.strength-seg` | `box-shadow: inset 0 0 0 1px var(--el-mark)` |
| leaderboard.css `.badge-art` default | `--el: var(--r-mythic-fill); --el-on: var(--r-mythic-on)` |
| modals.css `.avatar-art .el-*` | add `--el-on`, `--el-mark` |
| modals.css `.layer-frame .ring` stroke, `.stud` stroke | `var(--el-mark)` |
| modals.css `.crest-mark` stroke, `.stud` fill, `.gem` stroke | `var(--el-on)` (the gem and stud need the illustrator's sign-off, section 5) |

**Step 3: the three hues move.** Remove the step-1 overrides; the values in `tokens-proposal.css` take over. Swap the PAIRS as in section 8.

**Step 4, later: retire the aliases.** Point the theme blocks straight at the primitives (`--bg: var(--c-stone-900)` and so on), then delete the old `--c-*` names once nothing reads them. `--r-*` and `--el-*` without a role can stay as short aliases for `-fill`.

## 10. Adding a hue later (the recipe)

1. In `build.ts`, add one entry to `RAMPS`: `{ name, what, steps: STEPS, anchors: { <fill step>: { C, H } } }`. Pick H clear of its family. Keep C between 0.05 and 0.14 so it stays earthy. Put the fill at 500 (Bright text) or 400/200 (dark text).
2. Add one entry to `SWATCHES`: `{ id: 'el-aether', ramp: 'aether', fill: 500 }`.
3. Run `node --no-warnings docs/review/palette/build.ts`. It writes the ramp, the role tokens for four theme variants and the specimen, and prints the contrast and look-alike rows for the new hue against everything else.
4. Copy the output into `tokens.css` and `accessibility.css`, add the id to `SWATCHES` in `contrast.ts`, and run `npm test`.

## 11. Open questions

- **For the illustrator.** The art keeps its own colours, but three swatches now have light fills: Water crests and frame gems, Air crests and frame rings, and the Mythic flare and badge. The cream marks (`--c-bright` strokes) become dark (`-on`) on those. Please confirm the painted art works with that. I'd also like your view on a double-stroke ring for the pale elements on the light theme.
- **Gold vs Starforged on the light theme (ΔE 0.017, existing).** The top plate reads as Gold except for its ornament and glow. My proposal is light `--plate-elo: --c-star-600` (`#6f4900`), so Starforged is the deepest metal on the light theme as it is the palest on the dark. It is 0.09 from Gold, 6:1 or better on every light surface, and a visible change, so it is not in the CSS until the owner and the illustrator agree.
- **For the ux-reviewer.** Is the strength bar's segment order fixed, and the same as the legend's? That is what makes Fire and Earth safe for protanopes.
- **Not verified yet.** The tokens are not wired in, so `npm run test:a11y`, the 375px and 200% checks and the top-of-screen check were not run on the app. Palette tokens change no layout, sizes or focus rings. They will be checked after step 2 lands, with screenshots of the Forge, the Leaderboard and the avatar sheet in both themes. `npm test` was not run either, because nothing under `packages/` changed; `build.ts` ran the same checker on the proposal. The specimen page was checked by eye in both themes and under simulated deuteranopia and protanopia.
