import { avatarSvg, partSvg } from '../avatar.ts';
import { setShowcase } from '../backend/leaderboard.ts';
import { partName } from '../reward.ts';
import { cachedAccount, refreshAccount } from '../backend/account.ts';
import { canSwitchAffinity } from '../backend/affinity.ts';
import { cachedLoadout, cachedPolish, loadForge } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { paintPlate } from '../plates.ts';
import { dailyKey, loadProfile, rankTier } from '../profile.ts';
import { closeButton, goBack, h, mount, openModal, subPage, toast, type Screen } from '../ui.ts';
import { affinityScreen } from './affinity.ts';
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

  const nameEl = h('h2', { class: 'profile-plate' });
  paintPlate(nameEl, p.name, plate);

  // the worn avatar in its frame (Happy until another is worn)
  const avatar = h('span', { class: 'avatar profile-avatar worn', html: avatarSvg(cachedLoadout(), cachedPolish()), attrs: { 'aria-hidden': 'true' } });
  // your side; Change shows while switching is allowed (the first 7 days of a season)
  const side = account?.affinity
    ? h('p', { class: 'forge-affinity' }, h('span', { class: 'drop-element', html: ICONS.elements[account.affinity], attrs: { 'aria-hidden': 'true' } }), h('span', { text: copy.forge.elements[account.affinity] }))
    : null;

  const stat = (label: string, value: string) => h('div', { class: 'profile-stat' }, h('dt', { text: label }), h('dd', { text: value }));
  const collection = h('p', { class: 'profile-collection-line', text: signedInText() });
  const bar = h('div', { class: 'month-progress', attrs: { 'aria-hidden': 'true' } }, h('span'));

  // the three parts on your show-off card (playerCard.ts); chosen from what you own
  const showcaseSlots = h('ul', { class: 'card-showcase-list' });
  const showcaseBtn = h('button', { class: 'btn', text: copy.profile.showcaseChoose, attrs: { type: 'button' } });
  showcaseBtn.disabled = true;
  const showcase = account && !account.anonymous
    ? h('section', { class: 'profile-section card-showcase' }, h('h2', { text: copy.profile.showcase }), h('p', { class: 'note', text: copy.profile.showcaseHelp }), showcaseSlots, showcaseBtn)
    : null;
  const paintShowcase = (chosen: string[]) =>
    showcaseSlots.replaceChildren(...[0, 1, 2].map((i) => chosen[i]
      ? h('li', { class: 'showcase-slot filled' }, h('span', { class: 'showcase-art', html: partSvg(chosen[i]), attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'showcase-name', text: partName(chosen[i]) }))
      : h('li', { class: 'showcase-slot', attrs: { 'aria-hidden': 'true' } })));
  paintShowcase(account?.showcase ?? []);

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
        nameEl,
        h(
          'p',
          { class: 'profile-tier' },
          h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier], attrs: { 'aria-hidden': 'true' } }),
          h('span', { text: p.title ?? tier.label }),
        ),
        side,
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
      showcase,
      account?.anonymous ? h('p', { class: 'note', text: copy.profile.guestNote }) : null,
      forgeBtn,
    ),
  );

  function signedInText(): string {
    return account ? copy.forge.loading : copy.profile.collectionOffline;
  }

  if (account) {
    void refreshAccount();
    void canSwitchAffinity().then((open) => {
      if (!open || !side) return;
      side.append(h('button', { class: 'link-btn', text: copy.affinity.change, attrs: { type: 'button', 'aria-label': copy.affinity.a11yChange }, onclick: () => mount(affinityScreen()) }));
    });
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
      avatar.innerHTML = avatarSvg(f.loadout, f.polish);
      showcaseBtn.disabled = false;
      showcaseBtn.onclick = () => openShowcase([...f.owned.keys()], cachedAccount()?.showcase ?? [], paintShowcase);
    });
  } else bar.remove();

  return { el, title: copy.profile.title };
}

/** Choose up to three owned parts for the show-off card's showcase. */
function openShowcase(owned: string[], current: string[], done: (chosen: string[]) => void): void {
  const t = copy.profile;
  const chosen = current.filter((id) => owned.includes(id));
  const buttons = owned.map((id) => {
    const btn = h('button', { class: 'showcase-pick', attrs: { type: 'button' } },
      h('span', { class: 'showcase-art', html: partSvg(id), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'showcase-name', text: partName(id), attrs: { 'aria-hidden': 'true' } }));
    const paint = () => {
      const on = chosen.includes(id);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', t.a11yShowcasePart(partName(id), on));
    };
    paint();
    btn.addEventListener('click', () => {
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < 3) chosen.push(id);
      buttons.forEach((b) => b.dispatchEvent(new Event('repaint')));
    });
    btn.addEventListener('repaint', paint);
    return btn;
  });
  const save = h('button', { class: 'btn btn-primary', text: t.showcaseSave, attrs: { type: 'button' } });
  save.addEventListener('click', () => {
    save.disabled = true;
    void setShowcase(chosen).then(async (err) => {
      save.disabled = false;
      if (err) return toast(err);
      await refreshAccount();
      close();
      toast(t.showcaseSaved);
      done(chosen);
    });
  });
  const close = openModal(
    h('div', { class: 'sheet showcase-sheet' }, closeButton(() => close()), h('h2', { text: t.showcaseTitle }), h('p', { class: 'note', text: t.showcasePick }),
      h('div', { class: 'showcase-grid' }, ...buttons), save),
  );
}