import type { Loadout, Slot } from './backend/forge.ts';
import { ELEMENT_PATHS } from './icons.ts';
import type { Element } from './profile.ts';

/** Brush art for parts that have it (art/parts/<part id>.webp, icons/build_sigil.py…); the rest use the vector stand-ins below. */
const ART: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('./art/parts/*.webp', { eager: true, import: 'default' })).map(([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url]),
);

/**
 * The player's avatar, drawn from the five layers of their loadout: backdrop, sigil, frame,
 * crest and aura. Each part id says its slot, element and variant ("s0-sigil-fire-2": I, II
 * or III). Until the Season 0 art lands, every part is a clean vector stand-in built from
 * the element marks, a little richer at each variant. Element colours are the palette's
 * element tokens (`.avatar-art .el-*`). Purely decorative: aria-hidden.
 */

const parse = (id: string | null | undefined): { element: Element; n: number } | null => {
  if (!id) return null;
  const [, , element, variant] = id.split('-');
  return { element: element as Element, n: Number(variant ?? 1) };
};

/** An element mark scaled into the 100-unit avatar box, centred on (cx, cy). */
const mark = (element: Element, cx: number, cy: number, size: number, width: number) =>
  `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})" fill="none" stroke-width="${(width * 24) / size}" stroke-linecap="round" stroke-linejoin="round">${ELEMENT_PATHS[element].map((d) => `<path d="${d}"/>`).join('')}</g>`;

/** `count` marks evenly round a circle of radius r, from `draw(x, y, angle)`. */
const around = (count: number, r: number, draw: (x: number, y: number, a: number) => string, offset = 0) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i * 2 * Math.PI) / count + offset;
    return draw(50 + r * Math.cos(a), 50 + r * Math.sin(a), a);
  }).join('');

function layer(slot: Slot, id: string | null | undefined): string {
  const part = parse(id);
  if (!part) return '';
  const { element: e, n } = part;
  const cls = `avatar-layer layer-${slot} el-${e}`;
  switch (slot) {
    case 'backdrop':
      // a field in the element's colour: a ring, then a dotted ring, then rays
      return `<g class="${cls}"><circle class="fill" cx="50" cy="50" r="44"/>${
        n >= 3
          ? around(16, 35, (x, y, a) => `<path class="line" d="M${x - 7 * Math.cos(a)} ${y - 7 * Math.sin(a)}L${x + 7 * Math.cos(a)} ${y + 7 * Math.sin(a)}"/>`)
          : n === 2
            ? around(20, 35, (x, y) => `<circle class="dot" cx="${x}" cy="${y}" r="1.6"/>`)
            : '<circle class="line" cx="50" cy="50" r="34" fill="none"/>'
      }</g>`;
    case 'sigil':
      if (ART[id!]) return `<g class="${cls}"><image href="${ART[id!]}" x="8" y="8" width="84" height="84"/></g>`;
      // the centrepiece: the element's mark, ringed with ticks (II) or a second ring (III)
      return `<g class="${cls}">${
        n >= 2 ? around(8, 30, (x, y, a) => `<path class="ink" d="M${x} ${y}l${4 * Math.cos(a + 1)} ${4 * Math.sin(a + 1)}"/>`, Math.PI / 8) : ''
      }${n >= 3 ? '<circle class="ink" cx="50" cy="50" r="24" fill="none"/>' : ''}<g class="ink">${mark(e, 50, 49, n >= 2 ? 36 : 44, n >= 2 ? 4.2 : 3.6)}</g></g>`;
    case 'frame':
      return `<g class="${cls}"><circle class="ring" cx="50" cy="50" r="46" fill="none"/>${
        n >= 3 ? '<circle class="ring thin" cx="50" cy="50" r="41" fill="none"/>' : ''
      }${around(n >= 2 ? 8 : 4, 46, (x, y) => `<circle class="stud" cx="${x}" cy="${y}" r="${n >= 2 ? 2.8 : 3.4}"/>`, -Math.PI / 4)}</g>`;
    case 'crest':
      return `<g class="${cls}"><circle class="badge" cx="50" cy="89" r="9.5"/><g class="badge-ink">${mark(e, 50, 89, 12, 1.8)}</g></g>`;
    case 'aura':
      return `<g class="${cls}"><circle class="aura${n >= 2 ? ' dotted' : ''}" cx="50" cy="50" r="48.5" fill="none"/>${
        n >= 3 ? '<circle class="aura outer" cx="50" cy="50" r="52" fill="none"/>' : ''
      }</g>`;
  }
}
/** The full avatar as an SVG string; an empty loadout is a plain disc. */
export function avatarSvg(loadout: Loadout | null | undefined): string {
  const l = loadout ?? {};
  // no backdrop yet: the plain disc with its ring, as before anything was forged
  return `<svg class="avatar-art${l.backdrop ? ' has-backdrop' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="avatar-base" cx="50" cy="50" r="44"/>${l.backdrop ? '' : '<circle class="avatar-ring" cx="50" cy="50" r="41" fill="none"/>'}
    ${layer('aura', l.aura)}${layer('backdrop', l.backdrop)}${layer('sigil', l.sigil)}${layer('frame', l.frame)}${layer('crest', l.crest)}
  </svg>`;
}

/** One part alone, as it looks on its own (the Forge's cards). */
export function partSvg(id: string): string {
  const slot = id.split('-')[1] as Slot;
  const solo: Loadout = { [slot]: id };
  // sigils, crests and auras read better on a quiet field
  return avatarSvg(solo);
}
