# Palette from the art: Air, Water and the four rarities (2026-10-21)

The illustrator's and colourist's view. This is a report only: nothing under `packages/` changed.
A UI designer is building the token system in parallel. This page gives the painter's targets and
reasons. The token names and the final wiring are the designer's call.

Sheets (rendered with Playwright from the values below):

- `docs/review/palette/palette-sheet.png`: every colour as a tag, on both themes
- `docs/review/palette/palette-sheet-deuteranopia.png`, `palette-sheet-protanopia.png`: the same sheet
  through the Machado 2009 simulation (severity 1, linear RGB)
- `docs/review/palette/palette-sets-cvd.png`: the element set and the rarity set side by side under
  all three kinds of vision. This is the strip to look at first.

## 1. What the art is actually painted in

I decoded every opaque pixel (alpha ≥ 230) of the 28 raster files, clustered them in OKLab and read
the flat SVG fills of the faces and frames. The painted art does not have a palette of its own: it is
painted **in the UI tokens**, each one within ΔE 1 of its token.

| Role in the art | Sampled | OKLCH (L C H) | Token it matches | ΔE |
|---|---|---|---|---|
| Paper (calendar, sword, cog, clash fist) | `#e5e5cb` | 91.4% 0.034 107 | `--c-second-bright` `#e8e8ce` | 0.9 |
| Paper shade | `#dadbb9` / `#d4d5b2` | 88.2% / 86.2% 0.046 109 | `--c-mud` | 0 |
| Stone / rim light | `#b1b29d` | 75.7% 0.029 110 | `--c-rock` `#b3b5a0` | 0.9 |
| Terracotta body (wallet, megaphone, stub) | `#a65a36` | 54.9% 0.111 45 | `--c-lava` `#a85b37` | 0.5 |
| Oxblood (handles, binding, cog light) | `#77413e` | 44.1% 0.077 23 | `--c-crimson` `#794341` | 0.7 |
| Moss (hand-cup, wallet note) | `#626843` | 50.1% 0.055 116 | `--c-forest` | 0.4 |
| Pale moss (feather, note, coin) | `#c8cf9c` | 83.6% 0.068 114 | `--c-forest-highlight` | 0 |
| Outline and shadow ink | `#3e2e23` / `#3c3022` | 31.7% 0.030 58–72 | none (umber) | n/a |
| Metal and charcoal (cup ring, cross-guard) | `#3e3e3b` | 36.3% 0.005 110 | none | n/a |
| Flame (sword-flame, sword-heat) | `#e66730` | 66.1% 0.171 42 | none | n/a |
| Heat ramp | `#8f4a3c` → `#c45d35` → `#eeaf87` → `#f6d6b5` | 49→90% 0.10–0.16, 32→67 | Lava family | n/a |

The face SVGs are the only place in the art with cool colours, all muted pastels: calm `#83a9be`
(71% 0.051 **233**), tired `#5f779a` (56% 0.061 **258**), scared `#6a9999` (65% 0.051 196),
disappointed `#c1b5c8` (79% 0.030 **313**), shocked `#af708a` (62% 0.086 354), upset `#b85b5b`
(58% 0.121 21), bored `#e5e8d5` (92% 0.025 114). Their ink is `#1d1d1b`. The frames use Bright
and Crimson only. `grain.webp` and `plate-wear.webp` are colourless masks.

**The tonality, in plain terms**

- **Warm, but not orange.** The neutrals all sit at hue 106–116: greenish-yellow cream and
  olive, like unbleached paper or linen. None of them is pure grey and none is pink.
- **Low chroma with one hot note.** Paper is at C 0.03–0.05 and the pigments at 0.055 (moss),
  0.077 (oxblood) and 0.11 (terracotta). Only the flame reaches 0.17, so heat is the only
  saturated thing in the world.
- **Shadows stop at L ≈ 31%, in umber, not black.** The darkest painted value is warm brown
  `#3e2e23`. The near-black `#24241f` appears only as the dark-theme ground behind the clash fists.
  Highlights stop at the paper, around 99% at most, never pure white.
- **Paper and ink.** The art is flat cut-paper shapes with a dashed stitch, a stipple and an umber
  outline. Each object uses about three values: a body, a shade one step down and a rim light from
  the paper. A colour that fits this world has to look like a dry pigment printed on that paper.
  Colours that look like light from a screen do not fit.

What this means for the new colours: each one should be a muted earth or mineral pigment
(C 0.05–0.10), with the flame's chroma kept for the single top note. The deep fills should sit
in the same band of lightness as Lava, Forest and Crimson (L 41–56%), and the pale ones next
to the paper (L 83–88%).

## 2. Nudges to today's tokens

Because the art is painted in the base tokens, **Lava, Forest, Crimson, Bright, Second bright,
Mud and Rock should stay as they are**. The art agrees with each one within ΔE 1. Nudging one of
them would mean repainting the art.

The rarity and element fills were never in the art, and five of them sit off its logic:

| Token | Old | New (dark fill) | Why |
|---|---|---|---|
| `--el-air` | `#867137` | `#d1d9dc` | Today's Air is a brass or ochre, which reads as gold. The owner wants grey-white. |
| `--el-water` | `#386f71` | `#3a6477` | Today's Water is teal (hue 199). The new one moves to slate blue (229), the hue of the calm face. |
| `--r-common` | `#6d6d5f` | `#5d5a56` | Common sits at Forest's own hue and lightness (ΔE 4.1, 3.6 in deuteranopia). The new one is a near-neutral iron. |
| `--r-epic` | `#6f4b81` | `#664274` | Old Epic and Rare merge in deuteranopia (ΔE 2.3). Moving Epic a step deeper gives 10.8. |
| `--r-mythic` | `#9b3b3e` | `#e56945` | Old Mythic is Crimson with more chroma: same hue (21 vs 23), and ΔE **1.4 in protanopia**. |
| `--r-rare` | `#41668b` | `#5472a3` | Small move: lighter and cleaner, the tired face's hue. It is the light end of the rarity ladder. |

Optional addition, not a nudge: the art's outline ink, **Umber `#3e2e23`** (31.6% 0.030 56). It
is not needed in the UI, but it is worth recording so that new illustrations shade towards it and
not towards black.

## 3. The new colours

The system has three steps per colour, so it can grow.

- **Fill**: a deep pigment that carries Bright text at 4.5:1 or better. There is one value for the
  dark theme and one for the light theme. The light one is about 3 points deeper and a touch richer,
  because cream paper makes a colour look paler and a dark ground makes it look more saturated.
- **Wash**: L ≈ 84%, for card backgrounds and highlights. It takes ink: `#262721` in dark,
  Crimson in light. A wash is never used as an identity tag, because pale tints lose their hue
  differences.
- Air and Mythic **invert**: their fills are light and take dark ink. Air is the element of light,
  so it should be the pale tag in the element set. Mythic is the flame, so it should be the
  bright, hot tag in the rarity set. The flipped text is a second cue on top of colour.

| Colour | Evokes | Dark fill | Light fill | Wash | Text on fill |
|---|---|---|---|---|---|
| **Air** | cloud, wind, cold ash; the cool white beside the warm cream | `#d1d9dc` 88% 0.010 222 | `#bfc9cd` 83% 0.012 224 + 1px line `#788286` | (is its own wash) | dark ink 10.5 · Crimson 4.6 |
| **Water** | deep river, slate sea, wet stone | `#3a6477` 48% 0.056 229 | `#2d5c71` 45% 0.062 229 | `#b4d0dd` | Bright 6.3 / 7.2 |
| **Common** | iron, pewter, cold forge scale | `#5d5a56` 47% 0.007 75 | `#585550` 45% 0.009 81 | `#cdcac3` | Bright 6.8 / 7.3 |
| **Rare** | lapis, cobalt glaze | `#5472a3` 55% 0.085 260 | `#4969a0` 52% 0.095 261 | `#bfcfe9` | Bright 4.8 / 5.4 |
| **Epic** | heather, amethyst, plum dusk | `#664274` 44% 0.090 316 | `#5e386d` 41% 0.096 316 | `#d5c3dd` | Bright 8.0 / 9.1 |
| **Mythic** | the forge-heart, the sword's flame | `#e56945` 66.5% 0.163 37 | same | `#efc7b9` | dark ink 4.6 (both themes) |
| *Mythic, alternative* | cinnabar, vermilion | `#aa3527` 50% 0.155 30 | `#a52b1e` 48% 0.161 30 | `#f0c6bb` | Bright 6.4 / 7.0 |

All washes take their ink at 4.7:1 or better (Crimson in light), and 9:1 or better with `#262721`.

**Where I'm torn: Mythic.** My pick is the flame. It is the art's own top note (sword-flame
`#e66730`, made 4% less saturated), it is the only rarity fill with 3:1 or better against *both*
page backgrounds (4.6 on `#262721`, 3.2 on `#ffffe5`), and in every simulation it stays apart from
Lava and Crimson because it is 11 points lighter. The cost: it needs dark ink in both themes, and
`#262721` on it is 4.6:1, just over the line, so keep the label at 600 weight. Cinnabar keeps every
rarity tag in the same deep-fill, Bright-text form and sits more quietly with the other pigments.
But under deuteranopia and protanopia it turns into the same olive-brown as Fire, Earth and Crimson
(see the sheets). If cinnabar is chosen, give it a non-colour mark (a flame rim or glyph).

## 4. How far apart they are (OKLab ΔE ×100: normal / deuteranopia / protanopia, dark fills)

| Pair | Old tokens | Proposed |
|---|---|---|
| Water vs Rare | 5.8 / 5.0 / 5.3 | **8.4 / 7.8 / 8.0** (hue 229 vs 260, ΔL 7, ΔC 0.03) |
| Air vs Common | n/a | **41 / 41 / 42** (value alone: cloud 88% vs iron 47%) |
| Mythic vs Lava | 8.5 / 7.4 / 9.3 | **12.3 / 11.7 / 8.4** |
| Mythic vs Crimson | 6.6 / 4.8 / **1.4** | **23.6 / 23.7 / 18.7** |
| Epic vs Crimson | n/a | **9.2 / 9.5 / 9.0** (hue 316 vs 23) |
| Epic vs Rare | 9.4 / **2.3** / 5.9 | **13.7 / 10.8 / 14.1** |
| Common vs Forest | 4.1 / 3.6 / 3.8 | **6.1 / 5.6 / 6.0** |
| Water vs Forest | n/a | 9.5 / 9.8 / 8.8 |
| Water vs Epic (weakest new pair) | n/a | 11.1 / **4.1** / 8.3 |

In normal vision, the light-theme fills are as far apart as the dark ones or further. Every name
is always shown with its colour, so none of this relies on colour alone.

## 5. What the sheets show, and what to watch for

- **Dark theme.** In the element set, Air is the only pale tag and Fire, Water and Earth are three
  deep earths. In the rarity set, the ladder rises from neutral iron, to cool lapis, to deep
  heather, to the hot flame. That order is right: lightness and heat go up with the tier.
- **Light theme.** The deep fills look like enamel stamps on cream, the same way the Lava wallet
  sits on paper. Air needs its 1px `#788286` line, because without it the pale tag is 1.2:1 on
  Mud and disappears.
- **Fire vs Earth under protanopia is ΔE 1.9.** This is a problem in today's tokens, not in the
  new ones. Lava and Forest have the same luminance and both turn olive. Darkening Forest would
  make it collide with Crimson instead (deuteranopia 0.9), and the art is painted in Forest. So
  leave the colours alone and make sure the element badges always carry their glyph or name.
- **Air vs the washes.** The light-theme Air `#bfc9cd` is close to the Water wash `#b4d0dd` and the
  Rare wash `#bfcfe9`. Keep washes for backgrounds only: an Air tag on a Water-wash card needs
  its line.
- The fills meet 4.5:1 for text and will mostly fall below 3:1 against the page (deep fills on
  `#262721` are 1.6–3.1). That is fine for labelled tags. For a bare dot or ring that has to
  stand alone, use the wash on the dark theme and the fill on the light theme.
- The sheets were rendered in the system sans (Segoe UI), because Montserrat was not installed
  locally. The colours are exact.

New pairs for `PAIRS` in `scripts/contrast.ts`: Bright on each deep fill (both themes); `#262721`
on Air and Mythic; Crimson on light-theme Air and on every wash; and `#788286` (Air's line)
against `#ffffe5`, `#e8e8ce` and `#dadbb9` (3.9 / 3.2 / 2.8). The last is below 3:1 on Mud. That
is fine while the tag carries its name, but if the line has to pass on Mud too, take it to
`#6f797e` (4.4 / 3.6 / 3.1).
