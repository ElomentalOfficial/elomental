import { closeButton, h, openModal } from './ui.ts';
import * as copy from './copy/en.ts';

/** The keyboard shortcuts panel: "?" in a game, or from Setup. */
export function openShortcuts(): void {
  const rows = copy.shortcuts.keys.map(([keys, action]) =>
    h('div', { class: 'shortcut' }, h('dt', {}, ...keys.map((k) => h('kbd', { text: k }))), h('dd', { text: action })),
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
