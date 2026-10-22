import { h } from './ui.ts';

/** One solved square, for drawing sample squares (any valid grid would do). */
const SOLVED = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

/**
 * A square drawn small, for a door's picture (banner.css .mini-board): `givens` and `yours` are
 * 81 characters, a number or 0 for an empty cell. Decorative: the door's words say what it is.
 */
export function miniBoard(givens: string, yours = ''): HTMLElement {
  return h(
    'span',
    { class: 'mini-board', attrs: { 'aria-hidden': 'true' } },
    ...[...givens].map((g, i) => {
      const mine = yours[i] && yours[i] !== '0' ? yours[i] : '';
      return h('i', { class: mine && g === '0' ? 'yours' : '', text: g !== '0' ? g : mine });
    }),
  );
}

/** A sample square with `count` numbers given, the same cells every time for the same `seed`. */
export function sampleGivens(count: number, seed: number): string {
  let s = seed;
  const next = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const order = [...SOLVED].map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const keep = new Set(order.slice(0, count));
  return [...SOLVED].map((n, i) => (keep.has(i) ? n : '0')).join('');
}
