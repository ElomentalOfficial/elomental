import { DEFAULT_AVATAR, type Loadout, type Polish } from './backend/forge.ts';
import type { Element } from './profile.ts';
import fireEmblem from './art/elements/fire.svg';
import waterEmblem from './art/elements/water.svg';
import earthEmblem from './art/elements/earth.svg';
import airEmblem from './art/elements/air.svg';
import fireSign from './art/factions/fire.svg';
import waterSign from './art/factions/water.svg';
import earthSign from './art/factions/earth.svg';
import airSign from './art/factions/air.svg';
import { sunburstPath } from './rays.ts';

/**
 * The factions' full-colour emblems (the owner's marks in their colour, edged in gold:
 * scripts/emblems.ts), for the Affinity cards' crests. Plain shapes and gradients only: no SVG
 * filters, which Firefox and iOS Safari draw badly (a white fringe, low resolution).
 */
const EMBLEMS: Record<Element, string> = { fire: fireEmblem, water: waterEmblem, earth: earthEmblem, air: airEmblem };
/**
 * The factions' signs (a flame, a drop, two peaks, the wind, edged in gold: scripts/emblems.ts),
 * for your faction on the Profile card's banner and the Profile page.
 */
const SIGNS: Record<Element, string> = { fire: fireSign, water: waterSign, earth: earthSign, air: airSign };
/** An element's sign, as an image URL. */
export const factionSignUrl = (element: Element): string => SIGNS[element];

/** The avatar pictures (art/faces/<name>.svg), by name. */
const FACES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./art/faces/*.svg', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

/**
 * The player's avatar: one whole picture (the worn avatar part, Happy until another is
 * worn) inside its frame. A frame id says its element and variant ("s0-frame-fire-2": I, II
 * or III); frames are clean vector rings in the element's colour (`.avatar-art .el-*`),
 * richer at each variant. Purely decorative: aria-hidden.
 */

const parse = (id: string | null | undefined): { element: Element; n: number } | null => {
  if (!id) return null;
  const [, , element, variant] = id.split('-');
  return { element: element as Element, n: Number(variant ?? 1) };
};
/** `count` marks evenly round a circle of radius r, from `draw(x, y, angle)`. */
const around = (count: number, r: number, draw: (x: number, y: number, a: number) => string, offset = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 2 * Math.PI) / count + offset;
    return draw(50 + r * Math.cos(a), 50 + r * Math.sin(a), a);
  }).join('');

/**
 * A frame: its ring (a second, thin one at III) studded round the avatar. IV, the Mythic
 * one, sets four gems in the element's colour at the quarters, the studs between them.
 */
function frame(id: string | null | undefined): string {
  const part = parse(id);
  if (!part) return '';
  const { element: e, n } = part;
  const gems = n >= 4
    ? around(4, 46, (x, y) => `<rect class="gem" x="${x - 4.6}" y="${y - 4.6}" width="9.2" height="9.2" rx="1.2" transform="rotate(45 ${x} ${y})"/>`, -Math.PI / 2)
    : '';
  // the gilt rim (gilding): drawn always, shown only on a gilded frame (.gilt, modals.css)
  return `<g class="avatar-layer layer-frame el-${e}"><circle class="gilt-ring" cx="50" cy="50" r="50.5" fill="none"/><circle class="ring" cx="50" cy="50" r="46" fill="none"/>${
    n >= 3 ? '<circle class="ring thin" cx="50" cy="50" r="41.5" fill="none"/>' : ''
  }${around(n >= 2 ? 8 : 4, 46, (x, y) => `<circle class="stud" cx="${x}" cy="${y}" r="${n >= 2 ? 2.8 : 3.4}"/>`, n >= 4 ? -Math.PI / 8 : -Math.PI / 4)}${gems}</g>`;
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