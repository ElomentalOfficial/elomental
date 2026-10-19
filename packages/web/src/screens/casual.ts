import type { Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { readJson, writeJson } from '../storage.ts';
import { formatTime, goBack, h, subPage, type Screen } from '../ui.ts';
import { openClash } from './clashSheet.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { homeScreen } from './home.ts';
import { openSquareCode } from './squareSheet.ts';
import * as copy from '../copy/en.ts';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
/** The difficulty Casual last started, picked again next time. */
const CASUAL_PICK_KEY = 'elomental:casual-difficulty';

/** Starting a game from this page needs no exit animation of its own: the game screen turns in. */
const now = (go: () => void) => go();

/**
 * Casual, a page of its own: a card for playing alone (resume, pick a difficulty,
 * play) and, under it, playing with a friend (Clash, Square code). Those two open
 * as pop-ups over this page, so a pop-up never opens from another pop-up.
 */
export function casualScreen(): Screen {
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
  const playButton = h('button', {
    class: 'btn btn-primary',
    onclick: () => {
      writeJson(CASUAL_PICK_KEY, pick);
      void startGame({ mode: 'casual', difficulty: pick });
    },
  });
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

  let resume: HTMLElement | null = null;
  if (saved?.config.mode === 'casual') {
    // Progress counts only the cells the player has to fill, not the givens.
    const givens = [...saved.config.puzzle].filter((c) => c !== '0').length;
    const filled = saved.values.filter(Boolean).length - givens;
    const percent = Math.max(0, Math.round((filled / Math.max(1, 81 - givens)) * 100));
    resume = h(
      'button',
      { class: 'resume-card', onclick: () => resumeGame(saved) },
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
      { class: 'friend-option', onclick: onTap },
      h('span', { class: 'friend-icon', html: icon, attrs: { 'aria-hidden': 'true' } }),
      h('strong', { text: label }),
      h('small', { text: info }),
    );

  const el = subPage(
    { className: 'casual', title: say.title, onBack: () => void goBack(homeScreen) },
    h(
      'div',
      { class: 'casual-body' },
      h(
        'div',
        { class: 'casual-head' },
        h('span', { class: 'casual-badge', html: ICONS.casual, attrs: { 'aria-hidden': 'true' } }),
        h('p', { text: say.text }),
      ),
      resume,
      h(
        'section',
        { class: 'casual-card', attrs: { 'aria-labelledby': 'casual-new-game' } },
        h('h2', { class: 'casual-label', attrs: { id: 'casual-new-game' }, text: say.newGame }),
        h('div', { class: 'difficulty-picker', attrs: { role: 'radiogroup', 'aria-labelledby': 'casual-new-game' } }, ...segments),
        playButton,
      ),
      h(
        'section',
        { class: 'casual-friends', attrs: { 'aria-labelledby': 'casual-with-friend' } },
        h('h2', { class: 'casual-label', attrs: { id: 'casual-with-friend' }, text: say.withFriend }),
        h(
          'div',
          { class: 'friend-card' },
          friend(ICONS.clash, say.clash, say.clashInfo, () => openClash(now)),
          friend(ICONS.hash, say.squareCode, say.squareCodeInfo, () => openSquareCode(now)),
        ),
      ),
    ),
  );
  return { el, title: say.title };
}
