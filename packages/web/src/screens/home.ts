import type { Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { enableTilt, liveTile, turnstileIn, turnstileOut } from '../motion.ts';
import { PROTECTED_BELOW, dailyKey, dateKey, loadProfile, rankTitle, rankedDifficulty } from '../profile.ts';
import { h, mount, openModal, toast, type Screen } from '../ui.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';

/** Layout from the Figma home frame: profile card with the Setup notch, then the mode tiles. */
export function homeScreen(): Screen {
  const profile = loadProfile();
  const saved = loadSavedGame();
  const inProgress = (mode: string) => (saved?.config.mode === mode ? h('span', { class: 'badge', text: 'In progress' }) : null);

  let leaving = false;
  const stops: (() => void)[] = [];

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
    h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: ICONS.setup }), h('span', { class: 'tile-label', text: 'Setup' })),
  );
  enableTilt(setupTile);

  const profileCard = h(
    'section',
    { class: 'profile-card area-profile' },
    h(
      'div',
      { class: 'profile-main' },
      h('span', { class: 'avatar' }),
      h('strong', { class: 'profile-name', text: 'Guest' }),
      h('span', { class: 'profile-rank', text: rankTitle(profile.elo) }),
    ),
    h(
      'div',
      { class: 'profile-stats' },
      stat(String(profile.elo), 'Elo'),
      stat(String(profile.dust), 'Dust', ICONS.dust),
      stat(String(profile.crowns), 'Crowns', ICONS.crown),
    ),
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, 'Daily Square', (el) => leave(el, () => mount(dailyScreen())), inProgress('daily'));
  const store = tile('store', ICONS.store, 'Store', () => toast('The store opens later'));
  const leader = tile('leader', ICONS.leaderboard, 'Leaderboard', () => toast('Leaderboards need accounts'));
  const casual = tile('casual', ICONS.casual, 'Casual', (el) => openCasual((go) => leave(el, go)), inProgress('casual'));
  const ranked = tile('ranked', ICONS.ranked, 'Play Ranked', (el) => openRanked((go) => leave(el, go)), inProgress('ranked'));

  const animated = [profileCard, daily, store, leader, casual, ranked];
  const grid = h('div', { class: 'home-grid' }, ...animated);
  const el = h('div', { class: 'screen home' }, grid);

  // Live tiles: Daily flips to today's date and month progress, Ranked to the player's Elo.
  const today = dailyKey();
  const [year, month, day] = today.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let doneThisMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) if (profile.daily[dateKey(year, month - 1, d)]) doneThisMonth++;
  const dailyFace = daily.querySelector<HTMLElement>('.tile-face')!;
  const rankedFace = ranked.querySelector<HTMLElement>('.tile-face')!;
  stops.push(
    liveTile(
      dailyFace,
      [
        [...dailyFace.childNodes],
        [
          h('span', { class: 'live-big', text: String(day) }),
          h('span', { class: 'tile-label', text: profile.daily[today] ? 'Done ✓' : `${doneThisMonth}/${daysInMonth}` }),
        ],
      ],
      7000,
      2600,
    ),
    liveTile(
      rankedFace,
      [
        [...rankedFace.childNodes],
        [h('span', { class: 'live-big', text: String(profile.elo) }), h('span', { class: 'tile-label', text: `Elo · ${rankTitle(profile.elo)}` })],
      ],
      8000,
      4300,
    ),
  );

  // Runs before the first paint of the new screen, so tiles never flash in place.
  requestAnimationFrame(() => turnstileIn(grid, animated));

  return { el, destroy: () => stops.forEach((stop) => stop()) };
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
      h('h2', { text: 'Casual' }),
      h('p', { text: 'No pressure, no Elo. Hints are on in Easy.' }),
      saved?.config.mode === 'casual'
        ? h('button', {
            class: 'btn btn-primary',
            text: `Resume ${saved.config.difficulty}`,
            onclick: () => {
              close();
              leave(() => resumeGame(saved));
            },
          })
        : null,
      h('button', { class: 'btn', text: 'Easy', onclick: () => choose('easy') }),
      h('button', { class: 'btn', text: 'Medium', onclick: () => choose('medium') }),
      h('button', { class: 'btn', text: 'Hard', onclick: () => choose('hard') }),
    ),
  );
}

function openRanked(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  const difficulty = rankedDifficulty(profile.elo);
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon ranked', html: ICONS.ranked }),
      h('p', {
        class: 'ranked-copy',
        html: 'Be aware, you will start a round of a <strong>RANKED</strong> game. You can lose or win elo points.',
      }),
      h(
        'p',
        { class: 'note' },
        `${profile.elo} Elo · faster solves earn bonus Elo` +
          (profile.elo < PROTECTED_BELOW ? ` · losses are free below ${PROTECTED_BELOW}` : ''),
      ),
      h('button', {
        class: 'play-btn',
        html: ICONS.play,
        attrs: { 'aria-label': 'Start ranked match' },
        onclick: () => {
          close();
          leave(() => void startGame({ mode: 'ranked', difficulty }));
        },
      }),
    ),
  );
}

export function closeButton(onClose: () => void): HTMLElement {
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': 'Close' }, onclick: onClose });
}
