import { signUpForm } from '../accountForm.ts';
import { avatarSvg } from '../avatar.ts';
import { badgeArt, badgeLabel } from '../badges.ts';
import { myBadges, setShowcase } from '../backend/leaderboard.ts';
import { cachedAccount, refreshAccount } from '../backend/account.ts';
import { affinityDue, canSwitchAffinity } from '../backend/affinity.ts';
import { cachedLoadout, cachedPolish, loadForge } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { paintPlate } from '../plates.ts';
import { dailyGoal, dailyKey, loadProfile, rankTier } from '../profile.ts';
import { rankProgress } from '../rankBar.ts';
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
export function profileScreen(start?: { at?: 'badges' }): Screen {
  const p = loadProfile();
  const account = cachedAccount();
  const tier = rankTier(p.elo, p.tier);
  // the next rank and its bar, once the player has played Ranked
  const nextUp = p.rankedGames > 0 ? rankProgress(p.elo, p.tier, 'profile-next-rank') : null;
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
  // no side yet, once it's time: the way to choose one (Home's line has no room on small phones)
  const side = account?.affinity
    ? h('p', { class: 'forge-affinity' }, h('span', { class: 'drop-element', html: ICONS.elements[account.affinity], attrs: { 'aria-hidden': 'true' } }), h('span', { text: copy.forge.elements[account.affinity] }))
    : affinityDue()
      ? h('button', { class: 'link-btn', text: copy.home.line.chooseSide, attrs: { type: 'button' }, onclick: () => mount(affinityScreen(profileScreen)) })
      : null;

  const stat = (label: string, value: string) => h('div', { class: 'profile-stat' }, h('dt', { text: label }), h('dd', { text: value }));
  const collection = h('p', { class: 'profile-collection-line', text: signedInText() });
  const bar = h('div', { class: 'month-progress', attrs: { 'aria-hidden': 'true' } }, h('span'));

  // Badges: every badge you own, the three on your show-off card first (playerCard.ts)
  const badgeList = h('ul', { class: 'badge-grid' });
  const badgeBtn = h('button', { class: 'btn', text: copy.badges.choose, attrs: { type: 'button' } });
  const badgeNote = h('p', { class: 'note' });
  const badgesSection = account && !account.anonymous
    ? h('section', { class: 'profile-section card-badges' }, h('h2', { text: copy.badges.title }), badgeList, badgeNote, badgeBtn)
    : null;
  const paintBadges = (owned: string[], chosen: string[]) => {
    const onCard = chosen.length ? chosen.filter((b) => owned.includes(b)) : owned.slice(0, 3);
    const ordered = [...onCard, ...owned.filter((b) => !onCard.includes(b))];
    badgeList.replaceChildren(...ordered.map((b) => h('li', { class: `badge-slot filled${onCard.includes(b) ? ' on-card' : ''}` },
      h('span', { class: 'badge-medal', html: badgeArt(b), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'badge-name', text: badgeLabel(b).text }),
      onCard.includes(b) ? h('span', { class: 'badge-tag', text: copy.badges.onCard }) : null)));
    badgeNote.textContent = owned.length ? '' : copy.badges.none;
    badgeNote.hidden = !!owned.length;
    badgeBtn.hidden = owned.length < 2;
    badgeBtn.onclick = () => openBadgePicker(owned, chosen, (next) => paintBadges(owned, next));
  };
  if (badgesSection) void myBadges().then((owned) => owned && paintBadges(owned, cachedAccount()?.showcase ?? []));
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
        nextUp,
        side,
        // the Forge, in sight without scrolling (Home has no tile for it)
        forgeBtn,
      ),
      h(
        'section',
        { class: 'profile-section' },
        h('h2', { text: copy.profile.stats }),
        h(
          'dl',
          { class: 'profile-stats-list' },
          stat(copy.profile.elo, copy.formatNumber(p.elo)),
          stat(copy.profile.bestElo, copy.formatNumber(Math.max(p.elo, account?.bestElo ?? 0))),
          stat(copy.profile.solved, copy.formatNumber(account?.solved ?? 0)),
          stat(copy.profile.ranked, copy.formatNumber(p.rankedGames)),
          stat(copy.profile.dailyMonth(monthName), copy.profile.dailyCount(dailyDone, dailyGoal(dailyDone, days))),
        ),
      ),
      h('section', { class: 'profile-section' }, h('h2', { text: copy.profile.collection }), collection, bar),
      badgesSection,
      // a guest gets the way to act on it: the sign-up form, one tap away
      account?.anonymous
        ? h('section', { class: 'profile-section' }, signUpForm({ collapsed: true, title: copy.account.keepRewards, text: copy.profile.guestNote, onDone: () => mount(profileScreen()) }))
        : null,
    ),
  );
  // opened for its badges (Home's month-won sheet): there, with the focus on their heading
  if (start?.at === 'badges' && badgesSection) {
    requestAnimationFrame(() => {
      const heading = badgesSection.querySelector('h2')!;
      heading.tabIndex = -1;
      heading.scrollIntoView({ block: 'start' });
      heading.focus({ preventScroll: true });
    });
  }

  function signedInText(): string {
    return account ? copy.forge.loading : copy.profile.collectionOffline;
  }

  if (account) {
    void refreshAccount();
    void canSwitchAffinity().then((open) => {
      if (!open || !side) return;
      side.append(h('button', { class: 'link-btn', text: copy.affinity.change, attrs: { type: 'button', 'aria-label': copy.affinity.a11yChange }, onclick: () => mount(affinityScreen(profileScreen)) }));
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
      // when the season (and its set) ends
      if (f.seasonEnds) {
        const until = new Date(f.seasonEnds).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        bar.after(h('p', { class: 'note profile-season-end', text: copy.profile.seasonUntil(until) }));
      }
      avatar.innerHTML = avatarSvg(f.loadout, f.polish);
    });
  } else bar.remove();

  return { el, title: copy.profile.title };
}

/** Choose up to three of your badges for your show-off card. */
function openBadgePicker(owned: string[], current: string[], done: (chosen: string[]) => void): void {
  const t = copy.badges;
  const chosen = current.filter((id) => owned.includes(id));
  const buttons: HTMLButtonElement[] = [];
  const paintAll = () => buttons.forEach((btn, i) => {
    const id = owned[i];
    const on = chosen.includes(id);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', t.a11yPick(badgeLabel(id).text, on));
  });
  for (const id of owned) {
    const btn = h('button', { class: 'badge-pick', attrs: { type: 'button' } },
      h('span', { class: 'badge-medal', html: badgeArt(id), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'badge-name', text: badgeLabel(id).text, attrs: { 'aria-hidden': 'true' } }));
    btn.addEventListener('click', () => {
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < 3) chosen.push(id);
      paintAll();
    });
    buttons.push(btn);
  }
  paintAll();
  const save = h('button', { class: 'btn btn-primary', text: t.save, attrs: { type: 'button' } });
  save.addEventListener('click', () => {
    save.disabled = true;
    void setShowcase(chosen).then(async (err) => {
      save.disabled = false;
      if (err) return toast(err);
      await refreshAccount();
      close();
      toast(t.saved);
      done([...chosen]);
    });
  });
  const close = openModal(
    h('div', { class: 'sheet badge-sheet' }, closeButton(() => close()), h('h2', { text: t.chooseTitle }), h('p', { class: 'note', text: t.pick }),
      h('div', { class: 'badge-pick-grid' }, ...buttons), save),
  );
}