import type { Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { PROTECTED_BELOW, loadProfile, rankTitle, rankedDifficulty } from '../profile.ts';
import { h, mount, openModal, toast, type Screen } from '../ui.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';

function tile(area: string, icon: string, label: string, onTap: () => void, ...extra: (HTMLElement | null)[]) {
  return h(
    'button',
    { class: `tile area-${area}`, onclick: onTap },
    h('span', { class: 'tile-icon', html: icon }),
    h('span', { class: 'tile-label', text: label }),
    ...extra,
  );
}

/** Layout from the Figma home frame: profile card with the Setup notch, then the mode tiles. */
export function homeScreen(): Screen {
  const profile = loadProfile();
  const saved = loadSavedGame();
  const inProgress = (mode: string) => (saved?.config.mode === mode ? h('span', { class: 'badge', text: 'In progress' }) : null);

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
    h(
      'div',
      { class: 'setup-notch' },
      h(
        'button',
        { class: 'tile tile-setup', onclick: () => mount(setupScreen()) },
        h('span', { class: 'tile-icon', html: ICONS.gear }),
        h('span', { class: 'tile-label', text: 'Setup' }),
      ),
    ),
  );

  const grid = h(
    'div',
    { class: 'home-grid' },
    profileCard,
    tile('daily', ICONS.clock, 'Daily Square', () => mount(dailyScreen()), inProgress('daily')),
    tile('store', ICONS.gem, 'Store', () => toast('The store opens later')),
    tile('leader', ICONS.burst, 'Leaderboard', () => toast('Leaderboards need accounts')),
    tile('casual', ICONS.leaf, 'Casual', openCasual, inProgress('casual')),
    tile('ranked', ICONS.flame, 'Play Ranked', openRanked, inProgress('ranked')),
  );

  return { el: h('div', { class: 'screen home' }, grid) };
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

function openCasual() {
  const saved = loadSavedGame();
  const choose = (difficulty: Difficulty) => {
    close();
    void startGame({ mode: 'casual', difficulty });
  };
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon casual', html: ICONS.leaf }),
      h('h2', { text: 'Casual' }),
      h('p', { text: 'No pressure, no Elo. Hints are on in Easy.' }),
      saved?.config.mode === 'casual'
        ? h('button', {
            class: 'btn btn-primary',
            text: `Resume ${saved.config.difficulty}`,
            onclick: () => resumeGame(saved),
          })
        : null,
      h('button', { class: 'btn', text: 'Easy', onclick: () => choose('easy') }),
      h('button', { class: 'btn', text: 'Medium', onclick: () => choose('medium') }),
      h('button', { class: 'btn', text: 'Hard', onclick: () => choose('hard') }),
    ),
  );
}

function openRanked() {
  const saved = loadSavedGame();
  if (saved?.config.mode === 'ranked') return resumeGame(saved);
  const profile = loadProfile();
  const difficulty = rankedDifficulty(profile.elo);
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon ranked', html: ICONS.flame }),
      h('p', {
        class: 'ranked-copy',
        html: 'Be aware, you will start a round of a <strong>RANKED</strong> game. You can lose or win elo points.',
      }),
      h(
        'p',
        { class: 'note' },
        `${profile.elo} Elo · ${difficulty} squares · faster solves earn bonus Elo` +
          (profile.elo < PROTECTED_BELOW ? ` · losses are free below ${PROTECTED_BELOW}` : ''),
      ),
      h('button', {
        class: 'play-btn',
        html: ICONS.play,
        attrs: { 'aria-label': 'Start ranked match' },
        onclick: () => {
          close();
          void startGame({ mode: 'ranked', difficulty });
        },
      }),
    ),
  );
}

export function closeButton(onClose: () => void): HTMLElement {
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': 'Close' }, onclick: onClose });
}
