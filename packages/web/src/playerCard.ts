import { avatarSvg, partSvg } from './avatar.ts';
import { DEFAULT_AVATAR } from './backend/forge.ts';
import { follow, playerCard, unfollow, type PlayerCard } from './backend/leaderboard.ts';
import { ICONS } from './icons.ts';
import { paintPlate } from './plates.ts';
import { rankTier, type Element } from './profile.ts';
import { partName } from './reward.ts';
import { closeButton, h, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * The show-off card (docs/LEADERBOARD_DESIGN.md §3.5, §4): opened from any player on the
 * leaderboard, search or the affinities sheet. Fixed slots, always the same size: the avatar
 * (moving when brought to life) in its frame, the name on its plate, rank and title,
 * affinity and country, Elo and peak, a stats line, badges, and a showcase of three. Slots for
 * later cosmetics (card background, banner, name effect, emote) are marked with data-slot so
 * they can be filled without moving anything. The server applies the player's privacy.
 */

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' });
  } catch {
    return null;
  }
})();
/** "RO" → "Romania" (the code itself when the browser can't name it). */
export const countryName = (code: string): string => regionNames?.of(code) ?? code;

/** 'win-2026-10-fire' → "Fire won October 2026", with its element. */
export function badgeLabel(badge: string): { text: string; element: Element | null } {
  const m = badge.match(/^win-(\d{4})-(\d{2})-(fire|water|earth|air)$/);
  if (!m) return { text: badge, element: null };
  const month = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const element = m[3] as Element;
  return { text: copy.leaderboard.card.winBadge(copy.forge.elements[element], month), element };
}

/** The avatar in its frame, moving if brought to life. */
export const cardAvatar = (c: { avatar: string | null; frame: string | null; alive: boolean }) =>
  avatarSvg({ avatar: c.avatar, frame: c.frame }, c.alive ? { [c.avatar ?? DEFAULT_AVATAR]: 1 } : {});

/** The card's body (shared by the sheet and the full profile of another player). */
export function cardBody(c: PlayerCard, opts: { large?: boolean } = {}): HTMLElement {
  const t = copy.leaderboard.card;
  const tier = rankTier(c.elo);
  const name = h('h2', { class: 'card-name', attrs: { 'data-slot': 'name-effect' } });
  paintPlate(name, c.name, c.plate);
  const facts: (HTMLElement | null)[] = [
    h('span', { class: 'card-fact' }, h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier], attrs: { 'aria-hidden': 'true' } }), h('span', { text: c.title ?? tier.label })),
    c.affinity
      ? h('span', { class: 'card-fact' }, h('span', { class: 'drop-element', html: ICONS.elements[c.affinity], attrs: { 'aria-hidden': 'true' } }), h('span', { text: copy.forge.elements[c.affinity] }))
      : null,
    c.country ? h('span', { class: 'card-fact', text: countryName(c.country) }) : null,
  ];
  const numbers = [
    `${c.elo} ${copy.leaderboard.elo}`,
    t.peak(c.peak),
    c.notRanked ? t.notRanked : c.place ? copy.leaderboard.place(c.place) : null,
  ].filter(Boolean).join(' · ');
  const badges = c.badges.length
    ? h('section', { class: 'card-badges' }, h('h3', { class: 'sr-only', text: t.badges }),
        h('ul', {}, ...c.badges.slice(0, 4).map((b) => {
          const label = badgeLabel(b);
          return h('li', { class: 'card-badge' },
            label.element ? h('span', { class: 'drop-element', html: ICONS.elements[label.element], attrs: { 'aria-hidden': 'true' } }) : null,
            h('span', { text: label.text }));
        }), c.badges.length > 4 ? h('li', { class: 'card-badge', text: `+${c.badges.length - 4}` }) : null))
    : null;
  // three fixed slots; an empty showcase shows only on your own card, as an invitation
  const showcase = c.showcase.length || c.me
    ? h('section', { class: 'card-showcase' }, h('h3', { text: t.showcase }),
        h('ul', {}, ...[0, 1, 2].map((i) => {
          const id = c.showcase[i];
          return id
            ? h('li', { class: 'showcase-slot filled' }, h('span', { class: 'showcase-art', html: partSvg(id), attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'showcase-name', text: partName(id) }))
            : h('li', { class: 'showcase-slot', attrs: { 'aria-hidden': 'true' } });
        })),
        !c.showcase.length ? h('p', { class: 'note', text: t.showcaseEmpty }) : null)
    : null;
  return h(
    'div',
    { class: `card-body${opts.large ? ' large' : ''}`, attrs: { 'data-slot': 'card-background' } },
    h('span', { class: 'card-banner', attrs: { 'data-slot': 'banner', 'aria-hidden': 'true' } }),
    h('span', { class: 'avatar card-avatar worn', html: cardAvatar(c), attrs: { 'aria-hidden': 'true' } }),
    name,
    h('p', { class: 'card-facts' }, ...facts),
    h('p', { class: 'card-numbers', text: numbers }),
    c.stats ? h('p', { class: 'card-stats', text: t.stats(c.stats.solved, c.stats.ranked) }) : null,
    badges,
    showcase,
  );
}

/** The Follow / Following button; keeps the card's state in step. */
export function followButton(c: PlayerCard, onChange?: (following: boolean) => void): HTMLButtonElement {
  const t = copy.leaderboard.card;
  const btn = h('button', { class: 'btn', attrs: { type: 'button' } });
  const paint = () => {
    btn.textContent = c.following ? t.following : t.follow;
    btn.classList.toggle('btn-primary', !c.following);
    btn.setAttribute('aria-pressed', String(c.following));
    btn.setAttribute('aria-label', c.following ? t.a11yFollowing(c.name) : t.follow);
  };
  paint();
  btn.addEventListener('click', () => {
    btn.disabled = true;
    const was = c.following;
    void (was ? unfollow(c.id) : follow(c.id)).then((err) => {
      btn.disabled = false;
      if (err) return toast(err);
      c.following = !was;
      paint();
      toast(c.following ? t.followed(c.name) : t.unfollowed(c.name));
      onChange?.(c.following);
    });
  });
  return btn;
}

export interface CardActions {
  /** Jump the leaderboard to this player. */
  showOnBoard?: (c: PlayerCard) => void;
  /** Open the full profile. */
  fullProfile?: (c: PlayerCard) => void;
  /** After a follow or unfollow (the Friends list may change). */
  followChanged?: () => void;
}

/** Opens the show-off card for a player. */
export function openPlayerCard(id: string, actions: CardActions = {}): void {
  const t = copy.leaderboard.card;
  const sheet = h('div', { class: 'sheet player-card' }, h('p', { class: 'note', text: t.loading }));
  const close = openModal(sheet);
  void playerCard(id).then((c) => {
    if (!sheet.isConnected) return;
    if (!c || c.missing || c.hidden) {
      sheet.replaceChildren(closeButton(() => close()), h('p', { class: 'note', text: !c ? copy.leaderboard.offline : c.hidden ? t.hidden : t.missing }));
      return;
    }
    const buttons = h('div', { class: 'card-actions' },
      c.me ? h('p', { class: 'note', text: t.you }) : followButton(c, () => actions.followChanged?.()),
      actions.fullProfile ? h('button', { class: 'btn', text: t.fullProfile, attrs: { type: 'button' }, onclick: () => { close(); actions.fullProfile!(c); } }) : null,
      actions.showOnBoard && c.place ? h('button', { class: 'link-btn', text: t.showOnBoard, attrs: { type: 'button' }, onclick: () => { close(); actions.showOnBoard!(c); } }) : null);
    sheet.replaceChildren(closeButton(() => close()), cardBody(c), buttons);
  });
}
