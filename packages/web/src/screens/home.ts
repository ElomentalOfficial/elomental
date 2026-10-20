import { difficultyForRating } from '@elomental/engine';
import { avatarSvg } from '../avatar.ts';
import { cachedAccount } from '../backend/account.ts';
import { cachedLoadout, cachedPolish, loadLoadout } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { paintPlate } from '../plates.ts';
import { profileScreen } from './profile.ts';
import { affinityDue } from '../backend/affinity.ts';
import { affinityScreen } from './affinity.ts';
import { addToHomeNote, countNoteVisit } from '../install.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import { eloDelta, loadProfile, parMs, rankTier, rankedTarget } from '../profile.ts';
import { closeButton, h, hiddenHeading, mount, navigatingBack, openModal, toast, type Screen } from '../ui.ts';
import { handleEmailLink } from '../emailLink.ts';
import { onAccountChange, refreshAccount, signedIn } from '../backend.ts';
import { casualScreen } from './casual.ts';
import { handleClashLink } from './clashSheet.ts';
import { dailyScreen } from './daily.ts';
import { leaderboardScreen } from './leaderboard.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/** Layout from the Figma home frame: profile card with the Setup notch, then the mode tiles. */
export function homeScreen(): Screen {
  let leaving = false;

  /** Play the turnstile-out with `from` last, then run `then`. */
  const leave = async (from: HTMLElement, then: () => void) => {
    if (leaving) return;
    leaving = true;
    await turnstileOut(grid, animated, from);
    then();
  };

  function tile(area: string, icon: string, label: string, onTap: (el: HTMLElement) => void, ...extra: (HTMLElement | null)[]) {
    const face = h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: icon }), h('span', { class: 'tile-label', text: label }));
    const el = h('button', { class: `tile area-${area}` }, face, ...extra);
    el.addEventListener('click', () => onTap(el));
    enableTilt(el);
    return el;
  }

  const setupTile = h(
    'button',
    { class: 'tile tile-setup' },
    h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: ICONS.setup }), h('span', { class: 'tile-label', text: copy.home.tiles.setup })),
  );
  enableTilt(setupTile);

  // The avatar: the player's forged loadout (avatar.ts), and the way into their profile.
  const avatarBtn = h('button', { class: 'avatar avatar-btn', attrs: { type: 'button', 'aria-label': copy.profile.a11yAvatar } });
  // Happy until another avatar is worn (avatar.ts)
  const paintAvatar = (loadout = cachedLoadout()) => {
    avatarBtn.innerHTML = avatarSvg(loadout, cachedPolish());
    avatarBtn.classList.add('worn');
  };
  paintAvatar();
  if (signedIn()) void loadLoadout().then((l) => l && el.isConnected && paintAvatar(l));
  avatarBtn.addEventListener('click', () => leave(profileCard, () => mount(profileScreen())));
  enableTilt(avatarBtn, 6);

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const eloChip = stat('', copy.common.elo);
  const dustChip = stat('', copy.common.stardust, ICONS.dust);
  const spiritChip = stat('', copy.common.spirits, ICONS.spirit);
  /** Signed in, the numbers come from the server cache and update when it refreshes. */
  const paintProfile = () => {
    const p = loadProfile();
    // on the name plate bought with Stardust (plates.ts), if any
    paintPlate(nameEl, p.name, cachedAccount()?.plate ?? 0);
    // The tier emblem beside the rank (or the player's title, which replaces the rank's name)
    const tier = rankTier(p.elo);
    rankEl.replaceChildren(
      h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier], attrs: { 'aria-hidden': 'true' } }),
      h('span', { text: p.title ?? tier.label }),
    );
    eloChip.querySelector('strong')!.textContent = String(p.elo);
    dustChip.querySelector('strong')!.textContent = String(p.dust);
    spiritChip.querySelector('strong')!.textContent = String(p.spirits);
  };
  paintProfile();
  const stopProfile = onAccountChange(paintProfile);
  if (signedIn()) void refreshAccount();

  const profileCard = h(
    'section',
    { class: 'profile-card area-profile' },
    h(
      'div',
      { class: 'profile-main' },
      avatarBtn,
      nameEl,
      rankEl,
    ),
    h('div', { class: 'profile-stats' }, eloChip, dustChip, spiritChip),
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, copy.home.tiles.daily, (el) => leave(el, () => mount(dailyScreen())));
  const store = tile('store', ICONS.store, copy.home.tiles.store, () => toast(copy.home.storeLater));
  const leader = tile('leader', ICONS.leaderboard, copy.home.tiles.leaderboard, (el) =>
    signedIn() ? leave(el, () => mount(leaderboardScreen())) : toast(copy.leaderboard.offline));
  const casual = tile('casual', ICONS.casual, copy.home.tiles.casual, (el) => leave(el, () => mount(casualScreen())));
  const ranked = tile('ranked', ICONS.ranked, copy.home.tiles.ranked, (el) => openRanked((go) => leave(el, go)));
  // Wide screens give Setup a tile of its own (Figma desktop home); phones keep it in the notch.
  const setupWide = tile('setup', ICONS.setup, copy.home.tiles.setup, (el) => leave(el, () => mount(setupScreen())));

  const tiles = [profileCard, daily, store, leader, casual, ranked, setupWide];
  const grid = h('div', { class: 'home-grid' }, ...tiles);
  // A few visits after the first game, on phones in the browser: Add to Home Screen (install.ts).
  const note = addToHomeNote();
  // The note turns in and out with the tiles, last in reading order.
  const animated = note ? [...tiles, note] : tiles;
  const el = h('div', { class: 'screen home' }, hiddenHeading(copy.common.appName), grid, note);

  /** Home fits the screen without scrolling, so on a short one (browser bars) the note
      would squeeze the tiles until the profile's stats spill out: there it stays away. */
  const fitNote = () => {
    if (!note) return;
    const card = profileCard.getBoundingClientRect();
    const stats = profileCard.querySelector('.profile-stats')!.getBoundingClientRect();
    if (stats.bottom > card.bottom + 1) {
      note.remove();
      animated.pop();
    } else countNoteVisit();
  };
  const enter = () => {
    fitNote();
    turnstileIn(grid, animated, backward);
  };

  // Runs right after mount, before the new screen is ever painted, so tiles never
  // flash in place. (A requestAnimationFrame is too late when Home is mounted from
  // an animation's end, as goBack does: that frame is painted first.)
  const backward = navigatingBack();
  queueMicrotask(() => {
    if (el.isConnected) enter();
    else requestAnimationFrame(enter);
  });
  setTimeout(() => handleClashLink((go) => leave(casual, go)), 420);
  // After the third solved square: time to choose a side (once; again after the next solve
  // if put off). Waits for the tiles to settle so it reads as the next step, not a jump.
  setTimeout(() => {
    if (el.isConnected && !leaving && affinityDue()) leave(profileCard, () => mount(affinityScreen()));
  }, 900);
  setTimeout(() => void handleEmailLink(), 420);

  return { el, destroy: stopProfile };
}

function stat(value: string, label: string, icon?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat-chip' },
    icon ? h('span', { class: 'stat-icon', html: icon }) : null,
    h('strong', { text: value }),
    h('span', { text: label }),
  );
}

/**
 * The Ranked pop-up's sword: every tap or click heats the blade a step, from steel to
 * glowing like molten metal (its hot layer fades in, the flame swells, a glow spreads),
 * and it cools back down once the taps stop. Purely decorative, like the Casual feather:
 * no role, not in the tab order. `--heat` (0 to 1) drives it all in styles.css.
 */
function heatingSword(badge: HTMLElement): HTMLElement {
  const sword = () => badge.querySelector<HTMLElement>('.sword-live');
  let heat = 0;
  let lastTap = 0;
  let lastFrame = 0;
  let frame = 0;
  const paint = () => sword()?.style.setProperty('--heat', heat.toFixed(3));
  const cool = (now: number) => {
    // a short hold after each tap, then about four seconds from white-hot back to steel
    if (now - lastTap > 600) heat = Math.max(0, heat - ((now - lastFrame) / 1000) * 0.25);
    lastFrame = now;
    paint();
    frame = heat > 0 && badge.isConnected ? requestAnimationFrame(cool) : 0;
  };
  badge.addEventListener('pointerdown', () => {
    heat = Math.min(1, heat + 0.17);
    lastTap = lastFrame = performance.now();
    paint();
    if (!frame) frame = requestAnimationFrame(cool);
  });
  return badge;
}

function openRanked(leave: (go: () => void) => void) {
  const saved = loadSavedGame('ranked');
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  const target = rankedTarget(profile.elo);
  const difficulty = difficultyForRating(target);
  // what a player 35–45 wants to know before starting: how long, and what's at stake
  const r = copy.home.ranked;
  const facts = [
    r.rank(rankTier(profile.elo).label, profile.elo),
    r.length(Math.round(parMs(target) / 60_000)),
    r.stakes(eloDelta(profile.elo, target, true), -eloDelta(profile.elo, target, false)),
    r.pauses,
  ];
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      heatingSword(h('span', { class: 'sheet-icon ranked', html: ICONS.rankedLive, attrs: { 'aria-hidden': 'true' } })),
      h('h2', { text: copy.home.ranked.title }),
      h('p', { class: 'ranked-copy', text: copy.home.ranked.text }),
      h('ul', { class: 'ranked-facts' }, ...facts.map((f) => h('li', { text: f }))),
      h('button', {
        class: 'btn btn-primary btn-start',
        text: copy.home.ranked.start,
        onclick: () => {
          close();
          leave(() => void startGame({ mode: 'ranked', difficulty }));
        },
      }),
    ),
  );
}
