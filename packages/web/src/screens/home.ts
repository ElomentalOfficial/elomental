import { difficultyForRating, type Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import { loadProfile, rankTitle, rankedTarget } from '../profile.ts';
import { closeButton, formatTime, h, mount, navigatingBack, openModal, toast, type Screen } from '../ui.ts';
import { readJson, writeJson } from '../storage.ts';
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

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
/** The difficulty the Casual sheet last started, picked again next time. */
const CASUAL_PICK_KEY = 'elomental:casual-difficulty';

/**
 * Casual: a card for playing alone (resume, pick a difficulty, play) and a card
 * of the same weight for playing with a friend (Clash, Square code).
 * `leave` plays the home exit animation before the game screen takes over.
 */
function openCasual(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  const say = copy.home.casual;
  const stored = readJson<Difficulty>(CASUAL_PICK_KEY);
  let pick: Difficulty = stored && DIFFICULTIES.includes(stored) ? stored : 'easy';

  const segments = DIFFICULTIES.map((difficulty, i) =>
    h(
      'button',
      { class: 'difficulty', attrs: { role: 'radio', 'data-difficulty': difficulty }, onclick: () => choose(difficulty) },
      // One to three filled squares: how hard it is.
      h('span', { class: 'pips', attrs: { 'aria-hidden': 'true' } }, ...DIFFICULTIES.map((_, j) => h('i', { class: j <= i ? 'on' : '' }))),
      h('span', { text: copy.common.difficulty[difficulty] }),
    ),
  );
  const playButton = h('button', { class: 'btn btn-play', onclick: () => play() });
  const choose = (difficulty: Difficulty) => {
    pick = difficulty;
    for (const segment of segments) {
      const on = segment.dataset.difficulty === difficulty;
      segment.classList.toggle('on', on);
      segment.setAttribute('aria-checked', String(on));
    }
    playButton.textContent = say.play(difficulty);
  };
  choose(pick);
  const play = () => {
    writeJson(CASUAL_PICK_KEY, pick);
    close();
    leave(() => void startGame({ mode: 'casual', difficulty: pick }));
  };

  let resume: HTMLElement | null = null;
  if (saved?.config.mode === 'casual') {
    // Progress counts only the cells the player has to fill, not the givens.
    const givens = [...saved.config.puzzle].filter((c) => c !== '0').length;
    const filled = saved.values.filter(Boolean).length - givens;
    const percent = Math.max(0, Math.round((filled / Math.max(1, 81 - givens)) * 100));
    resume = h(
      'button',
      {
        class: 'resume-card',
        onclick: () => {
          close();
          leave(() => resumeGame(saved));
        },
      },
      h(
        'span',
        { class: 'resume-text' },
        h('strong', { text: say.resume(saved.config.difficulty) }),
        h('small', { text: say.resumeInfo(formatTime(saved.elapsedMs), percent) }),
      ),
      h('span', { class: 'resume-go', html: ICONS.play, attrs: { 'aria-hidden': 'true' } }),
    );
  }

  const friend = (icon: string, label: string, info: string, onTap: () => void) =>
    h(
      'button',
      { class: 'friend-option', onclick: () => { close(); onTap(); } },
      h('span', { class: 'friend-icon', html: icon, attrs: { 'aria-hidden': 'true' } }),
      h('strong', { text: label }),
      h('small', { text: info }),
    );

  const close = openModal(
    h(
      'div',
      { class: 'casual-sheet' },
      h(
        'section',
        { class: 'casual-card' },
        closeButton(() => close()),
        h(
          'div',
          { class: 'casual-head' },
          h('span', { class: 'casual-badge', html: ICONS.casual, attrs: { 'aria-hidden': 'true' } }),
          h('div', {}, h('h2', { text: say.title }), h('p', { text: say.text })),
        ),
        resume,
        h('h3', { class: 'casual-label', attrs: { id: 'casual-new-game' }, text: say.newGame }),
        h('div', { class: 'difficulty-picker', attrs: { role: 'radiogroup', 'aria-labelledby': 'casual-new-game' } }, ...segments),
        playButton,
      ),
      h(
        'section',
        { class: 'friend-card' },
        friend(ICONS.clash, say.clash, say.clashInfo, () => openClash(leave)),
        friend(ICONS.hash, say.squareCode, say.squareCodeInfo, () => openSquareCode(leave)),
      ),
    ),
    { class: 'casual-modal' },
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
