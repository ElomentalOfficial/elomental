import { h } from '../ui.ts';
import * as copy from '../copy/en.ts';

/**
 * Dev mode's game tools (founders only; backend/dev.ts): Solve now fills in the answer and
 * wins, Lose now ends it as three mistakes. The server accepts an instant solve only while dev
 * mode is on. game.ts puts the bar under the status row, in the page's flow: never over the
 * timer or Home (L15).
 */
export function devBar(solveNow: () => void, loseNow: () => void): HTMLElement {
  return h('div', { class: 'dev-bar', attrs: { role: 'group', 'aria-label': copy.dev.a11yBar } },
    h('button', { class: 'btn', text: copy.dev.solveNow, attrs: { type: 'button' }, onclick: solveNow }),
    h('button', { class: 'btn', text: copy.dev.loseNow, attrs: { type: 'button' }, onclick: loseNow }));
}
