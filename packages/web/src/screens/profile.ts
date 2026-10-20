import { avatarSvg } from '../avatar.ts';
import { cachedAccount, refreshAccount } from '../backend/account.ts';
import { cachedLoadout, cachedPolish, loadForge } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { dailyKey, loadProfile, rankTier } from '../profile.ts';
import { goBack, h, mount, subPage, type Screen } from '../ui.ts';
import { forgeScreen } from './forge.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * Your profile, from Home's avatar: the avatar large, your name on its plate, rank and
 * best Elo, a few plain stats, how much of the season's set you have, and one way on:
 * the Forge. Later the leaderboard opens other players' profiles the same way.
 */
export function profileScreen(): Screen {
  const p = loadProfile();
  const account = cachedAccount();
  const tier = rankTier(p.elo);
  const today = dailyKey();
  const [year, month] = today.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long' });
  const dailyDone = Object.keys(p.daily).filter((k) => k.startsWith(today.slice(0, 8))).length;
  const plate = account?.plate ?? 0;

  const loadout = cachedLoadout();
  const worn = loadout && Object.values(loadout).some(Boolean);
  const avatar = h('span', { class: `avatar profile-avatar${worn ? ' worn' : ''}`, html: worn ? avatarSvg(loadout, cachedPolish()) : '', attrs: { 'aria-hidden': 'true' } });

  const stat = (label: string, value: string) => h('div', { class: 'profile-stat' }, h('dt', { text: label }), h('dd', { text: value }));
  const collection = h('p', { class: 'profile-collection-line', text: signedInText() });
  const bar = h('div', { class: 'month-progress', attrs: { 'aria-hidden': 'true' } }, h('span'));

  const forgeBtn = h('button', { class: 'btn btn-primary profile-forge', text: copy.profile.forge, attrs: { type: 'button' } });
  forgeBtn.addEventListener('click', () => mount(forgeScreen(profileScreen)));

  const el = subPage(
    { className: 'profile-page', title: copy.profile.title, onBack: () => void goBack(homeScreen) },
    h(
      'div',
      { class: 'profile-body' },
      h(
        'section',
        { class: 'profile-hero' },
        avatar,
        h('h2', { class: `profile-plate name-plate plate-${plate}`, text: p.name }),
        h(
          'p',
          { class: 'profile-tier' },
          h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier], attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: p.title ?? tier.label }),
        ),
        account?.affinity
          ? h('p', { class: 'forge-affinity' }, h('span', { class: 'drop-element', html: ICONS.elements[account.affinity], attrs: { 'aria-hidden': 'true' } }), h('span', { text: copy.forge.elements[account.affinity] }))
          : null,
      ),
      h(
        'section',
        { class: 'profile-section' },
        h('h2', { text: copy.profile.stats }),
        h(
          'dl',
          { class: 'profile-stats-list' },
          stat(copy.profile.elo, String(p.elo)),
          stat(copy.profile.bestElo, String(Math.max(p.elo, account?.bestElo ?? 0))),
          stat(copy.profile.solved, String(account?.solved ?? 0)),
          stat(copy.profile.ranked, String(p.rankedGames)),
          stat(copy.profile.dailyMonth(monthName), copy.profile.dailyCount(dailyDone, days)),
        ),
      ),
      h('section', { class: 'profile-section' }, h('h2', { text: copy.profile.collection }), collection, bar),
      account?.anonymous ? h('p', { class: 'note', text: copy.profile.guestNote }) : null,
      forgeBtn,
    ),
  );

  function signedInText(): string {
    return account ? copy.forge.loading : copy.profile.collectionOffline;
  }

  if (account) {
    void refreshAccount();
    void loadForge().then((f) => {
      if (!el.isConnected && !document.body.contains(el)) return;
      if (!f) {
        collection.textContent = copy.profile.collectionOffline;
        return;
      }
      const craftable = f.parts.filter((x) => x.source === 'craft');
      const have = craftable.filter((x) => f.owned.has(x.id)).length;
      collection.textContent = copy.profile.season(have, craftable.length);
      bar.firstElementChild!.setAttribute('style', `width:${(have / Math.max(1, craftable.length)) * 100}%`);
      const fresh = Object.values(f.loadout).some(Boolean);
      avatar.classList.toggle('worn', fresh);
      avatar.innerHTML = fresh ? avatarSvg(f.loadout, f.polish) : '';
    });
  } else bar.remove();

  return { el, title: copy.profile.title };
}
