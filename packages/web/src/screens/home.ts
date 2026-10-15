import type { Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { PROTECTED_BELOW, loadProfile, rankTitle, rankedDifficulty } from '../profile.ts';
import { h, mount, openModal, toast, type Screen } from '../ui.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';

function tile(area: string, icon: string, label: string, onTap: () => void, ...extra: (HTMLElement | null)[]) {
  return h(
    'button',
    { class: `tile rough v${(area.length % 4) + 1} area-${area}`, onclick: onTap },
    h('span', { class: 'tile-icon', html: icon }),
    h('span', { class: 'tile-label sc', text: label }),
    ...extra,
  );
}

export function homeScreen(): Screen {
  const profile = loadProfile();
  const saved = loadSavedGame();

  const header = h(
    'header',
    { class: 'home-header' },
    h('div', { class: 'wordmark sc', html: 'Elo<span>mental</span>' }),
    h(
      'div',
      { class: 'wallet' },
      h('span', { class: 'chip', html: `${ICONS.dust}<b>${profile.dust}</b>`, attrs: { title: 'Dust Stones' } }),
      h('span', { class: 'chip', html: `${ICONS.crown}<b>${profile.crowns}</b>`, attrs: { title: 'Rusted Crowns' } }),
    ),
  );

  const user = h(
    'button',
    { class: 'tile tile-user rough v1 area-user', onclick: () => toast('Profiles arrive with accounts') },
    h('span', { class: 'avatar' }),
    h('span', { class: 'tile-label sc', text: 'Guest' }),
    h('span', { class: 'user-title sc', text: `${rankTitle(profile.elo)} · ${profile.elo} Elo` }),
  );

  const resumeBadge = (mode: string) =>
    saved?.config.mode === mode ? h('span', { class: 'badge sc', text: 'In progress' }) : null;

  const grid = h(
    'div',
    { class: 'home-grid' },
    user,
    tile('settings', ICONS.gear, 'Settings', () => toast('Settings are coming soon')),
    tile('store', ICONS.bag, 'Store', () => toast('The store opens later')),
    tile('events', ICONS.flag, 'Events', () => toast('No events yet')),
    tile('leader', ICONS.star, 'Leaderboard', () => toast('Leaderboards need accounts')),
    tile('casual', ICONS.feather, 'Casual Mode', openCasual, resumeBadge('casual')),
    tile('daily', ICONS.calendar, 'Daily Square', () => mount(dailyScreen()), resumeBadge('daily')),
    tile(
      'ranked',
      ICONS.sword,
      'Ranked Mode',
      openRanked,
      h('span', { class: 'tile-sub sc', text: `${profile.elo} Elo` }),
      resumeBadge('ranked'),
    ),
  );

  return { el: h('div', { class: 'screen home' }, header, grid) };
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
      h('span', { class: 'sheet-icon', html: ICONS.feather }),
      h('h2', { class: 'sc', text: 'Casual Mode' }),
      h('p', { text: 'No pressure, no Elo. Pick your difficulty.' }),
      saved?.config.mode === 'casual'
        ? h('button', {
            class: 'btn btn-gold rough-wide sc',
            text: `Resume ${saved.config.difficulty}`,
            onclick: () => resumeGame(saved),
          })
        : null,
      h('button', { class: 'btn btn-light rough-wide sc', text: 'Easy', onclick: () => choose('easy') }),
      h('button', { class: 'btn btn-light rough-wide sc', text: 'Medium', onclick: () => choose('medium') }),
      h('button', { class: 'btn btn-light rough-wide sc', text: 'Hard', onclick: () => choose('hard') }),
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
      { class: 'sheet ranked-sheet' },
      closeButton(() => close()),
      h('span', { class: 'sheet-icon big', html: ICONS.sword }),
      h('p', { class: 'ranked-copy', html: 'Be aware, you will start a round of a <span class="gold">RANKED</span> game. You can lose or win elo points.' }),
      h(
        'p',
        { class: 'note' },
        `${profile.elo} Elo · ${difficulty} squares` +
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
    { class: 'modal-ranked' },
  );
}

export function closeButton(onClose: () => void): HTMLElement {
  return h('button', { class: 'close-btn', html: ICONS.close, attrs: { 'aria-label': 'Close' }, onclick: onClose });
}
