import { DEFAULT_AVATAR, type Loadout, type Polish } from './backend/forge.ts';
import type { Element } from './profile.ts';
import fireEmblem from './art/elements/fire.svg';
import waterEmblem from './art/elements/water.svg';
import earthEmblem from './art/elements/earth.svg';
import airEmblem from './art/elements/air.svg';
import firePlain from './art/elements/plain/fire.svg';
import waterPlain from './art/elements/plain/water.svg';
import earthPlain from './art/elements/plain/earth.svg';
import airPlain from './art/elements/plain/air.svg';
import { sunburstPath } from './rays.ts';

/**
 * The factions' full-colour emblems (the owner's marks in their colour, edged in gold:
 * scripts/emblems.ts): the Affinity cards' crests, and your faction on the Profile card and page.
 * Plain shapes and gradients only: no SVG filters, which Firefox and iOS Safari draw badly (a
 * white fringe, low resolution).
 */
const EMBLEMS: Record<Element, string> = { fire: fireEmblem, water: waterEmblem, earth: earthEmblem, air: airEmblem };
/** An element's emblem, as an image URL. */
export const emblemUrl = (element: Element): string => EMBLEMS[element];
/** The emblems plain, no gold edge, a mild gradient of their colour (the faction flag on Home). */
const PLAIN: Record<Element, string> = { fire: firePlain, water: waterPlain, earth: earthPlain, air: airPlain };
/** An element's plain emblem, as an image URL. */
export const plainEmblemUrl = (element: Element): string => PLAIN[element];

/** The avatar pictures (art/faces/<name>.svg), by name. */
const FACES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./art/faces/*.svg', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

/**
 * The player's avatar: one whole picture (the worn avatar part, Happy until another is
 * worn) inside its frame. Purely decorative: aria-hidden.
 */

/**
 * The frames, from plainest to richest (owner, 2026-10-23): one a tier, for every player, no
 * faction. A frame's id names its tier ("s0-frame-gold").
 */
export const FRAME_TIERS = ['bronze', 'silver', 'gold', 'epic', 'mythic'] as const;
export type FrameTier = (typeof FRAME_TIERS)[number];
/** A frame's tier from its id, or null for anything else (an avatar, a retired frame). */
export const frameTier = (id: string | null | undefined): FrameTier | null => {
  const tier = id?.startsWith('s0-frame-') ? id.slice(9) : null;
  return FRAME_TIERS.includes(tier as FrameTier) ? (tier as FrameTier) : null;
};
/** `count` marks evenly round a circle of radius r, from `draw(x, y, angle)`. */
const around = (count: number, r: number, draw: (x: number, y: number, a: number) => string, offset = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 2 * Math.PI) / count + offset;
    return draw(50 + r * Math.cos(a), 50 + r * Math.sin(a), a);
  }).join('');

/** A diamond gem centred on (x, y), `r` from its centre to each point. */
const gem = (x: number, y: number, r: number) => `<path class="gem" d="M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z"/>`;

/**
 * A frame: a metal ring studded round the avatar, the same build at every tier, a step richer at
 * each (one rule per set): Bronze four studs, Silver eight, Gold a fine inner ring too. Epic sets
 * four gems in its rarity's colour at the quarters, the studs between; Mythic gems all eight.
 * The metal is the tier's (modals.css `.tier-*`).
 */
function frame(id: string | null | undefined): string {
  const tier = frameTier(id);
  if (!tier) return '';
  const n = FRAME_TIERS.indexOf(tier);
  const quarters = -Math.PI / 2;
  const between = quarters + Math.PI / 4;
  const studs = tier === 'bronze' ? around(4, 46, (x, y) => `<circle class="stud" cx="${x}" cy="${y}" r="3.2"/>`, quarters)
    : tier === 'mythic' ? around(4, 46, (x, y) => gem(x, y, 4.4), between)
    : around(n >= 3 ? 4 : 8, 46, (x, y) => `<circle class="stud" cx="${x}" cy="${y}" r="2.8"/>`, n >= 3 ? between : quarters);
  const gems = n >= 3 ? around(4, 46, (x, y) => gem(x, y, 6), quarters) : '';
  // the gilt rim (gilding): drawn always, shown only on a gilded frame (.gilt, modals.css)
  return `<g class="avatar-layer layer-frame tier-${tier}"><circle class="gilt-ring" cx="50" cy="50" r="50.5" fill="none"/><circle class="ring" cx="50" cy="50" r="46" fill="none"/>${
    n >= 2 ? '<circle class="ring thin" cx="50" cy="50" r="41.5" fill="none"/>' : ''
  }${studs}${gems}</g>`;
}

/** The face picture; brought to life (polished), it moves (styles.css `.avatar-face.alive`). */
function face(id: string, alive: boolean): string {
  const url = FACES[id.replace('s0-avatar-', '')] ?? FACES[DEFAULT_AVATAR.replace('s0-avatar-', '')];
  return `<g class="avatar-face${alive ? ' alive' : ''}"><image href="${url}" x="5" y="5" width="90" height="90"/></g>`;
}

/** The full avatar as an SVG string: the worn avatar (Happy when none) in its frame. */
export function avatarSvg(loadout: Loadout | null | undefined, polish: Polish = {}): string {
  const l = loadout ?? {};
  const id = l.avatar ?? DEFAULT_AVATAR;
  return `<svg class="avatar-art${l.gilt && l.frame ? ' gilt' : ''}" viewBox="0 0 100 100" aria-hidden="true">${face(id, polish[id] === 1)}${frame(l.frame)}</svg>`;
}

/**
 * An element's crest (the Affinity cards): its full-colour emblem on a disc of its own hue at its
 * darkest with a faint gold sunburst on it (rays.ts), ringed by two fine gold circles with a gem on
 * a short rail at each side (the seal-and-rails ornament, docs/DESIGN_SYSTEM.md; owner, 2026-10-23:
 * no frame ring).
 */
export function crestSvg(element: Element): string {
  const gem = (x: number) => `<path class="crest-gem" d="M${x} 47.4 L${x + 2.6} 50 L${x} 52.6 L${x - 2.6} 50 Z"/>`;
  return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true"><g class="crest el-${element}">` +
    `<circle class="crest-ring" cx="50" cy="50" r="44"/><circle class="crest-ring" cx="50" cy="50" r="47"/>` +
    `<path class="crest-ring" d="M0.5 50 H2.9 M8.9 50 H11.5 M88.5 50 H91.1 M97.1 50 H99.5"/>${gem(5.9)}${gem(94.1)}` +
    `<circle class="crest-disc" cx="50" cy="50" r="40"/><path class="crest-rays" d="${CREST_RAYS}"/>` +
    `<image href="${EMBLEMS[element]}" x="20" y="20" width="60" height="60"/></g></svg>`;
}
/** The faint sunburst on every crest's disc, behind the emblem (owner, 2026-10-23). */
const CREST_RAYS = sunburstPath(50, 14, 39);

/** One part alone, as it looks on its own (the Forge's cards): an avatar, or a frame round a plain disc. */
export function partSvg(id: string, polish = 0, gilt = false): string {
  if (id.startsWith('s0-avatar-')) return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true">${face(id, polish === 1)}</svg>`;
  return `<svg class="avatar-art${gilt ? ' gilt' : ''}" viewBox="0 0 100 100" aria-hidden="true"><circle class="avatar-base" cx="50" cy="50" r="40"/>${frame(id)}</svg>`;
}