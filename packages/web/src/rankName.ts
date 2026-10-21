import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * A Ranked rank's name in its own metal (home.css `.rank-name`, palette.ts RANKS): Novice
 * bronze up to Elomental violet. A player's title, when they have one, comes first in the
 * plain text colour, so the rank is always written (never shown by colour alone).
 */
export function rankName(tier: number, label: string, title?: string | null): HTMLElement {
  const name = h('span', { class: `rank-name rank-${tier}`, text: label });
  return title ? h('span', { class: 'rank-line' }, h('span', { text: copy.common.titleBeforeRank(title) }), name) : name;
}
