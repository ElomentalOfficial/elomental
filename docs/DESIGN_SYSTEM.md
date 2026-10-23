# Design system: the owner's rules

The look rules the owner has set while reviewing screens. CLAUDE.md has the hard rules (tokens,
contrast, type scale, spacing tokens); this file has the taste behind them and the patterns to
reuse. Read it before designing or restyling anything.

## Principles

- **Minimal ornament.** The fewest pieces that carry the idea: start with one to three elements,
  never five to nine. No filler dots, stray fans or "random artifacts". When a design needs more
  variety, vary the shape or structure rather than adding marks. Show the sparse version first.
  (The owner cut busy name plates more than once: "be more minimal all the time".)
- **One rule per set.** Every member of a set (the four elements, the rarity tags, crest discs,
  a row of tiles) gets the same treatment in each theme. If one needs an edge, glow or outline,
  they all take it through a shared palette role. Before shipping, compare siblings side by side
  in both themes and check every other place the set appears (Forge tags, Leaderboard bar,
  legend, leader tile, crests, badges).
- **Room around text.** No line of text sits tight against an edge, a picture or an ornament
  (the banner's torn tail keeps `--space-6` below its last line). Check the gap around every
  block of text at 100% and 200% Text size before calling UI done.
- **It's a game, not a dashboard.** The owner rejected app/dashboard looks; screens should feel
  like the forge and the four elements.

## Hairline intensity

Every hairline ornament has one intensity and one wear, the Home tiles' frames': drawn in its
surface's ink (Bright on dark, Crimson on light, the cloth's ink on a banner) at `--ornament-opacity` (6.5%), worn by the tiles' dash pattern (`--ornament-wear-x` / `-y`,
tokens.css). The tile frames and the banner's side lines use them as they are; the Forge purse's rules, which
frame text, take twice the opacity, their ink greyed toward iron (owner).

## Background ornaments

Three faint hairline backgrounds, reused behind icons, titles and rows of controls. All three
share one hairline weight, one colour (the surface's ink, e.g. `--on-accent` on the banner, always
a palette role), low opacity, 45° and radial angles only, broken lines and gaps rather than
closed shapes, `aria-hidden`, and clearance from text. Use one per surface.

1. **Sunburst rays.** Broken rays from one centre, behind a hero. `withRays(el)` in
   `packages/web/src/rays.ts` puts it behind any element: 36 rays, long and short in turn, each
   split into two or three dashes by one of the `RAY_DASHES` patterns, as an SVG mask; `.rays::before`
   in `styles/banner.css` paints it in the surface's ink at 14% and stretches it to the oval each
   place sets with `--rays-w` / `--rays-h`, so the tips stay off the text. Used on the wide banners
   (cloth width × hero height) and the phone/tablet Forge head (a little past the icon's sides,
   twice its height; just past it at large text). Unbroken rays at 6.5% were too faint. The
   strength is `--rays-opacity` (14%) for every broken-line ornament.
2. **Seal and diamond rails.** A faint round seal (two thin rings, a band of rune ticks between
   them, the crest in the middle); nested 45° diamonds on each side; short dashed rails running
   out from them to a small dot. Built behind the wide pages' lower Back (`SEAL` in
   `pageBanner.ts`, `.banner-back-seal` in `banner.css`, 14% like the sunburst), where the owner
   picked it over a second sunburst ("too repetitive on the page").
3. **Diamond chain.** One thin spine line through a row or column of items, each item in a large
   hairline diamond that overlaps its neighbours, small diamonds between them as connectors; the
   active item gets a heavier frame. Not built yet.

## Home's tiles: Facet

Home's tiles carry their names alone, in bold capitals with a soft drop (`--tile-label-shadow`),
each on an abstract Art Deco composition in the Facet style (`tileSprites.ts`; owner's pick of three
directions, 2026-10-23): diamonds, lozenges, 45° rules, chevrons, dot grids and steps, every tile
built its own way so no two repeat. Daily: a faceted sunrise (the only sunburst). Casual: nested
lozenges round the name. Ranked: a chevron column under a 45° X. Forge: a gem chain. Store: a
harlequin lattice. Leaderboard: a stepped pyramid. Setup: a zig-zag frieze.

Every stroke is grunge, never a continuous line: walked in uneven dashes, a few dropped, a quarter
in a fainter ink (the tile's seed places the wear, so it looks random but never changes), in the
tile's ink at `--rays-opacity`. Each composition is laid out from the tile's real size and the
name's place, redrawn when the tile resizes, and masked off the frame's four corners and a gap
round the name, so it fits every layout and never touches the text.

## Home's profile card: Ledger

The profile card (`screens/homeCard.ts`, owner's pick of three directions, 2026-10-23) reads in one
order inside the tile's frame. Who you are leads and takes the spare height: the avatar on a
sunburst (`withRays`) with the faction's coin on its ring, the name in its plate and the rank
beside it. Under a hairline with a diamond, Elo and Level, each with its bar and what's next (the
Profile's own `rankProgress` and `levelProgress`, on one track, `--pc-track`). Last, the three
badges, each in a recessed slot and each a button to the badge choice (`badgePicker.ts`). The
card's old walls, plaques and hanging banner are gone.

## Layout grid (wide pages)

The field beside the banner is 12 columns with one gutter (`--grid-columns`, `--grid-gutter` =
`--space-4`, tokens.css; `.field-grid` in banner.css). An item spans `--span` columns (all 12 by
default; the span rule is `:where()`, so a page's own placement always wins). Rows of 2, 3 and 4
share their edges because 12 divides by each. The banner is a fixed column outside the grid;
phones stay one column. What sits where:

- Doors (`.door-row`, always a `.field-grid`): 4 columns (three across); 6 for `.two-up` and at
  large text, unless the row is `.three-up` (Casual's difficulties, three at every size).
- Setup's pages: cards on 8 columns (12 at large text).
- Forge parts: 2 columns (six across), 3 under a 760px field; at large text 4, 6 under 1100px
  (container queries on the field, `@container field`).
- Daily: the month on columns 1–7, today and the badge on 8–12.
- Leaderboard: tabs 8 + search 4; podium 7 + the month 5.
- What's inside a card (stats, badges, a row's own columns) keeps its own layout.

## Wide pages: Banner and Doors

On wide screens (900+ wide, 600+ tall, aspect at least 5/4) Casual, Leaderboard, Setup and its
pages, Forge, Profile and Daily are "Banner and Doors".

- **Banner** (`src/pageBanner.ts`, `styles/banner.css`): the splash ribbon's outline (`ribbon.ts`)
  in `--cloth` on every page: forest on dark, the tiles' colour on light (it was the accent until
  2026-10-23). It hangs
  from the top only as long as its contents, drops in, and rolls up on Back. Same layout on all
  pages: Back, title, line, one hero icon (same slot and size), details, 32px clear of the tail.
  Everything on the cloth is in its ink (`--on-accent`). The sunburst sits behind the hero.
- **Doors** (`.door`): wear Home's tile frames unchanged (Store, Setup, Leaderboard and the
  profile card's frames in turn along a row). Never change the tile frame design. Each card turns
  in and out on its own like Home's tiles (`ui.ts` tilesIn/turnstileOut), stagger capped to Home's
  total time.
- **Room under the text:** the last line on the cloth keeps 96px (`BREATH`, pageBanner.ts) above
  the tail's highest spike (the owner's sketch; 32 and 56 read as too tight), and the details sit a
  `--space-5` step under the art. The page's title is the display size and a half.
- **The purse** (Forge, `balance`, `FLOURISH` and `WORN` in forge.ts, forge.css), from the owner's
  sketch: no band or box. Each value between two rules on the owner's reference border: a thin
  line at the tile frames' intensity (see Hairline intensity), fading near its ends, broken around a
  small hollow diamond with a smaller one inside. Only the words take colour, in a
  soft top-to-bottom gradient: Stardust a warm gold, Spirits a red (`--purse-gold-*`,
  `--purse-red-*` in tokens.css, both ends 4.5:1 on a tile and on a card). No icons, no faction
  line. (Rejected: framed bands with sundial corners, "ugly"; fading colour bands.)
- **The cloth's colour:** `--cloth` / `--cloth-ink` (tokens.css): a deep, muted forest on dark,
  the Home tiles' colour on light, chosen by the owner for contrast (the accent cloth left coloured
  text too little room). The Home art follows the theme on it, as on the tiles.
- **Back** (`pageBanner.ts`): one per page. Normally the big one under the ribbon's tail: the
  owner's Deco arrowhead (`art/screens/back.svg`) in the seal and diamond rails, up to about 130px
  tall on big screens, moved 7% left so it looks centred (its weight is in its right-hand panels),
  still (never spins), nudging left under the pointer; the small Back on the ribbon is then gone
  and the title gets a little more room above it. When there's under 130px under the tail (short
  windows, large text) the small chevron on the ribbon comes back instead. On phones and tablets
  the same arrowhead is the header Back, in the usual 44px chip (`.sub-back`, pages.css).
- **Hero icon** (`src/spin.ts` `spinnable`): drag to tilt like Apple Fitness awards, at most 70°
  (never flips), three slim edge layers, a shine band, springs back. Also on the phone Forge head.
- **Still to come:** the owner sends one icon per page into `manual_assets/screen_icons/` (only
  `forge.svg` so far). For each: crop if needed (drop extra artboard pieces and embedded reference
  JPEGs), save to `packages/web/src/art/screens/<page>.svg`, and use `spinnable(url)` as the
  banner art and on the phone page head.
- Light theme rank names: gradient 600→700; large names use `--rank-N-lit` (3:1).

## Ideas parked for later

- **Level flourish frame.** An ornate frame around the player's level or rank (gold scrollwork
  above and below, a centre gem), not around the name: four-sided frames around the name were
  too much, so name plates became an ornament under the name (2026-10-21). Bring it up when the
  Profile or rank display is redesigned; keep it in the plates' Deco language (`plates.ts`).
