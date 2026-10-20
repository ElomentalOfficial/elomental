import { closeButton, h, openModal } from './ui.ts';
import * as copy from './copy/en.ts';

/** The arrow keys drawn alike (the text arrows ↑ ↓ come out smaller than ← → in most fonts). */
const ARROWS: Record<string, number> = { '←': 180, '→': 0, '↑': 270, '↓': 90 };
const arrow = (deg: number) =>
  `<svg viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(${deg}deg)"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function key(k: string): HTMLElement {
  if (k in ARROWS) return h('kbd', { class: 'kbd-arrow' }, h('span', { html: arrow(ARROWS[k]) }), h('span', { class: 'sr-only', text: k }));
  return h('kbd', { text: k });
}

/** The keyboard shortcuts panel: "?" in a game, or from Setup. Keys left, what they do beside them. */
export function openShortcuts(): void {
  const rows = copy.shortcuts.keys.map(([keys, action]) =>
    h('div', { class: 'shortcut' }, h('dt', {}, ...keys.map(key)), h('dd', { text: action })),
  );
  const close = openModal(
    h(
      'div',
      { class: 'sheet shortcuts-sheet' },
      closeButton(() => close()),
      h('h2', { text: copy.shortcuts.title }),
      h('p', { text: copy.shortcuts.intro }),
      h('dl', { class: 'shortcut-list' }, ...rows),
    ),
  );
}
