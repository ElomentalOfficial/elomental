import { nextRank } from './profile.ts';
import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * How far the next rank is, in place of the old divisions: its line ("120 Elo to Archmage")
 * over a bar filled from this rank's floor. The line says it all; the bar is hidden from
 * screen readers. Null at Elomental, the top.
 */
export function rankProgress(elo: number, tier: number | null | undefined, cls = ''): HTMLElement | null {
  const next = nextRank(elo, tier);
  if (!next) return null;
  const fill = h('span');
  fill.style.width = `${Math.round(next.share * 100)}%`;
  return h(
    'div',
    { class: `rank-progress ${cls}`.trim() },
    h('span', { class: 'rank-progress-text', text: copy.common.toNextRank(next.gap, next.label) }),
    h('span', { class: 'rank-bar', attrs: { 'aria-hidden': 'true' } }, fill),
  );
}
