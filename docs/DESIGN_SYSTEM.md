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

## Background ornaments

Three faint hairline backgrounds, reused behind icons, titles and rows of controls. All three
share one hairline weight, one colour (the surface's ink, e.g. `--on-accent` on the banner, always
a palette role), low opacity, 45° and radial angles only, broken lines and gaps rather than
closed shapes, `aria-hidden`, and clearance from text. Use one per surface.

1. **Sunburst rays.** Broken rays from one centre, behind a hero. Built for the wide-page banners:
   `RAYS_MASK` in `packages/web/src/pageBanner.ts` draws 36 rays, long and short in turn, each split
   into two or three dashes by one of the `RAY_DASHES` patterns, as an SVG mask; `.banner-art::before`
   in `styles/banner.css` paints it in the cloth's ink at 14% and stretches it to an oval (the
   cloth's width, the hero's height) so the tips stay inside the cloth and off the text. Unbroken
   rays at 6.5% were too faint.
2. **Seal and diamond rails.** A faint round seal behind a title (two thin rings, a band of runes,
   a crest in the middle); nested 45° diamonds at the ends of a bar; short dashed lines running
   out from them to a small dot or tick. Not built yet.
3. **Diamond chain.** One thin spine line through a row or column of items, each item in a large
   hairline diamond that overlaps its neighbours, small diamonds between them as connectors; the
   active item gets a heavier frame. Not built yet.

## Wide pages: Banner and Doors

On wide screens (900+ wide, 600+ tall, aspect at least 5/4) Casual, Leaderboard, Setup and its
pages, Forge, Profile and Daily are "Banner and Doors".

- **Banner** (`src/pageBanner.ts`, `styles/banner.css`): the splash ribbon's outline (`ribbon.ts`)
  in the theme's accent (Lava dark, Crimson light) on every page, never a tile colour. It hangs
  from the top only as long as its contents, drops in, and rolls up on Back. Same layout on all
  pages: Back, title, line, one hero icon (same slot and size), details, 32px clear of the tail.
  Everything on the cloth is in its ink (`--on-accent`). The sunburst sits behind the hero.
- **Doors** (`.door`): wear Home's tile frames unchanged (Store, Setup, Leaderboard and the
  profile card's frames in turn along a row). Never change the tile frame design. Each card turns
  in and out on its own like Home's tiles (`ui.ts` tilesIn/turnstileOut), stagger capped to Home's
  total time.
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
