import type { PlayerCard } from '../backend/leaderboard.ts';
import { cardBody, followButton } from '../playerCard.ts';
import { goBack, h, subPage, type Screen } from '../ui.ts';
import * as copy from '../copy/en.ts';

/**
 * Another player's full profile, from their show-off card: the same fixed slots, larger,
 * with Follow. Built from the card the server already filtered for their privacy.
 */
export function playerProfileScreen(card: PlayerCard, back: () => Screen): Screen {
  const el = subPage(
    { className: 'player-page', title: card.name, onBack: () => void goBack(back) },
    h('div', { class: 'player-body' }, cardBody(card, { large: true }), card.me ? h('p', { class: 'note', text: copy.leaderboard.card.you }) : followButton(card)),
  );
  return { el, title: card.name };
}
