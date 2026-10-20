import { DEFAULT_AVATAR, type Loadout, type Polish } from './backend/forge.ts';
import { ELEMENT_PATHS } from './icons.ts';
import type { Element } from './profile.ts';

/** The avatar pictures (art/faces/<name>.svg, icons/make-faces.mjs), by name. */
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

/** A frame: its ring (a second, thin one at III) studded round the avatar. */
function frame(id: string | null | undefined): string {
  const part = parse(id);
  if (!part) return '';
  const { element: e, n } = part;
  return `<g class="avatar-layer layer-frame el-${e}"><circle class="ring" cx="50" cy="50" r="46" fill="none"/>${
    n >= 3 ? '<circle class="ring thin" cx="50" cy="50" r="41.5" fill="none"/>' : ''
  }${around(n >= 2 ? 8 : 4, 46, (x, y) => `<circle class="stud" cx="${x}" cy="${y}" r="${n >= 2 ? 2.8 : 3.4}"/>`, -Math.PI / 4)}</g>`;
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
  return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true">${face(id, polish[id] === 1)}${frame(l.frame)}</svg>`;
}

/** An element's crest in one of its frames (the Affinity cards): its mark on a disc of its colour. */
export function crestSvg(element: Element, variant = 2): string {
  const mark = ELEMENT_PATHS[element].map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true"><g class="crest el-${element}"><circle cx="50" cy="50" r="38"/>` +
    `<g class="crest-mark" transform="translate(24.8 24.8) scale(2.1)">${mark}</g></g>${frame(`s0-frame-${element}-${variant}`)}</svg>`;
}

/** One part alone, as it looks on its own (the Forge's cards): an avatar, or a frame round a plain disc. */
export function partSvg(id: string, polish = 0): string {
  if (id.startsWith('s0-avatar-')) return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true">${face(id, polish === 1)}</svg>`;
  return `<svg class="avatar-art" viewBox="0 0 100 100" aria-hidden="true"><circle class="avatar-base" cx="50" cy="50" r="40"/>${frame(id)}</svg>`;
}