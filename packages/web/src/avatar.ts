import type { Loadout, Slot } from './backend/forge.ts';
import { ELEMENT_PATHS } from './icons.ts';
import type { Element } from './profile.ts';

/**
 * The player's avatar, drawn from the five layers of their loadout
 * (docs/PROGRESSION_DESIGN.md §4.1): backdrop, sigil, frame, crest and aura. Each part
 * id says its slot, element and variant ("s0-sigil-fire-2"). Until the Season 0 art
 * lands (slice 6) every part is a clean vector stand-in built from the element marks.
 * Element colours come from palette tokens (`.avatar-art.el-*`); Water borrows Rock
 * until it has a colour of its own. Purely decorative: aria-hidden.
 */

const parse = (id: string | null | undefined): { element: Element; second: boolean } | null => {
  if (!id) return null;
  const [, , element, variant] = id.split('-');
  return { element: element as Element, second: variant === '2' };
};

/** An element mark scaled into the 100-unit avatar box, centred on (cx, cy). */
const mark = (element: Element, cx: number, cy: number, size: number, width: number) =>
  `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 24})" fill="none" stroke-width="${(width * 24) / size}" stroke-linecap="round" stroke-linejoin="round">${ELEMENT_PATHS[element].map((d) => `<path d="${d}"/>`).join('')}</g>`;

function layer(slot: Slot, id: string | null | undefined): string {
  const part = parse(id);
  if (!part) return '';
  const { element: e, second } = part;
  const cls = `avatar-layer layer-${slot} el-${e}`;
  switch (slot) {
    case 'backdrop':
      // a field in the element's colour; the rarer one carries a ring of rays
      return `<g class="${cls}"><circle class="fill" cx="50" cy="50" r="44"/>${
        second
          ? Array.from({ length: 16 }, (_, i) => {
              const a = (i * Math.PI) / 8;
              return `<path class="line" d="M${50 + 28 * Math.cos(a)} ${50 + 28 * Math.sin(a)}L${50 + 42 * Math.cos(a)} ${50 + 42 * Math.sin(a)}"/>`;
            }).join('')
          : '<circle class="line" cx="50" cy="50" r="34" fill="none"/>'
      }</g>`;
    case 'sigil':
      // the centrepiece: the element's mark, large; the Runed one ringed with rune ticks
      return `<g class="${cls}">${second ? Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        return `<path class="ink" d="M${50 + 30 * Math.cos(a)} ${50 + 30 * Math.sin(a)}l${4 * Math.cos(a + 1)} ${4 * Math.sin(a + 1)}"/>`;
      }).join('') : ''}<g class="ink">${mark(e, 50, 49, second ? 40 : 44, second ? 4.2 : 3.6)}</g></g>`;
    case 'frame':
      return `<g class="${cls}"><circle class="ring" cx="50" cy="50" r="46" fill="none"/>${Array.from({ length: 4 }, (_, i) => {
        const a = (i * Math.PI) / 2 - Math.PI / 4;
        return `<circle class="stud" cx="${50 + 46 * Math.cos(a)}" cy="${50 + 46 * Math.sin(a)}" r="3.4"/>`;
      }).join('')}</g>`;
    case 'crest':
      return `<g class="${cls}"><circle class="badge" cx="50" cy="89" r="9.5"/><g class="badge-ink">${mark(e, 50, 89, 12, 1.8)}</g></g>`;
    case 'aura':
      return `<g class="${cls}"><circle class="aura" cx="50" cy="50" r="48.5" fill="none"/></g>`;
  }
}

/** The full avatar as an SVG string; an empty loadout is a plain disc. */
export function avatarSvg(loadout: Loadout | null | undefined): string {
  const l = loadout ?? {};
  return `<svg class="avatar-art${l.backdrop ? ' has-backdrop' : ''}" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="avatar-base" cx="50" cy="50" r="44"/>
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
