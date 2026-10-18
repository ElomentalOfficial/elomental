import { difficultyForRating, type Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import { loadProfile, rankTitle, rankedTarget } from '../profile.ts';
import { closeButton, h, mount, navigatingBack, openModal, toast, type Screen } from '../ui.ts';
import { handleHandoffLink } from '../handoff.ts';
import { onAccountChange, refreshAccount, signedIn } from '../backend.ts';
import { handleClashLink, openClash } from './clashSheet.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';
import { openSquareCode } from './squareSheet.ts';
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

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const eloChip = stat('', copy.common.elo);
  const dustChip = stat('', copy.common.stardust, ICONS.dust);
  const crownChip = stat('', copy.common.crowns, ICONS.crown);
  /** Signed in, the numbers come from the server cache and update when it refreshes. */
  const paintProfile = () => {
    const p = loadProfile();
    nameEl.textContent = p.name;
    rankEl.textContent = p.title ?? rankTitle(p.elo);
    eloChip.querySelector('strong')!.textContent = String(p.elo);
    dustChip.querySelector('strong')!.textContent = String(p.dust);
    crownChip.querySelector('strong')!.textContent = String(p.crowns);
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
      h('span', { class: 'avatar' }),
      nameEl,
      rankEl,
    ),
    h('div', { class: 'profile-stats' }, eloChip, dustChip, crownChip),
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, copy.home.tiles.daily, (el) => leave(el, () => mount(dailyScreen())));
  const store = tile('store', ICONS.store, copy.home.tiles.store, () => toast(copy.home.storeLater));
  const leader = tile('leader', ICONS.leaderboard, copy.home.tiles.leaderboard, () => toast(copy.home.leaderboardLater));
  const casual = tile('casual', ICONS.casual, copy.home.tiles.casual, (el) => openCasual((go) => leave(el, go)));
  const ranked = tile('ranked', ICONS.ranked, copy.home.tiles.ranked, (el) => openRanked((go) => leave(el, go)));
  // Wide screens give Setup a tile of its own (Figma desktop home); phones keep it in the notch.
  const setupWide = tile('setup', ICONS.setup, copy.home.tiles.setup, (el) => leave(el, () => mount(setupScreen())));

  const animated = [profileCard, daily, store, leader, casual, ranked, setupWide];
  const grid = h('div', { class: 'home-grid' }, ...animated);
  const el = h('div', { class: 'screen home' }, grid);

  // Runs before the first paint of the new screen, so tiles never flash in place.
  const backward = navigatingBack();
  requestAnimationFrame(() => turnstileIn(grid, animated, backward));
  setTimeout(() => handleClashLink((go) => leave(casual, go)), 420);
  setTimeout(() => void handleHandoffLink(), 420);

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

/** `leave` plays the home exit animation before the game screen takes over. */
function openCasual(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  const choose = (difficulty: Difficulty) => {
    close();
    leave(() => void startGame({ mode: 'casual', difficulty }));
  };
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon casual', html: ICONS.casual }),
      h('h2', { text: copy.home.casual.title }),
      h('p', { text: copy.home.casual.text }),
      saved?.config.mode === 'casual'
        ? h('button', {
            class: 'btn btn-primary',
            text: copy.home.casual.resume(saved.config.difficulty),
            onclick: () => {
              close();
              leave(() => resumeGame(saved));
            },
          })
        : null,
      h('button', { class: 'btn', text: copy.common.difficulty.easy, onclick: () => choose('easy') }),
      h('button', { class: 'btn', text: copy.common.difficulty.medium, onclick: () => choose('medium') }),
      h('button', { class: 'btn', text: copy.common.difficulty.hard, onclick: () => choose('hard') }),
      h(
        'div',
        { class: 'casual-extras' },
        h('button', {
          class: 'btn btn-clash',
          html: `${ICONS.clash}<span>${copy.home.casual.clash}</span>`,
          onclick: () => {
            close();
            openClash(leave);
          },
        }),
        h('button', {
          class: 'btn btn-clash btn-square-code',
          html: `${ICONS.hash}<span>${copy.home.casual.squareCode}</span>`,
          onclick: () => {
            close();
            openSquareCode(leave);
          },
        }),
      ),
    ),
  );
}

function openRanked(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  const difficulty = difficultyForRating(rankedTarget(profile.elo));
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon ranked', html: ICONS.ranked }),
      h('h2', { text: copy.home.ranked.title }),
      h('p', { class: 'ranked-copy', text: copy.home.ranked.text }),
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
