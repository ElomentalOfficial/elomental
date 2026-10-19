import type { Difficulty } from '@elomental/engine';
import { reducedMotion } from '../a11y.ts';
import { ICONS } from '../icons.ts';
import { readJson, writeJson } from '../storage.ts';
import { formatTime, goBack, h, subPage, type Screen } from '../ui.ts';
import { openClash } from './clashSheet.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { homeScreen } from './home.ts';
import { openSquareCode } from './squareSheet.ts';
import * as copy from '../copy/en.ts';

/**
 * The page's feather: it floats on its own (CSS), and a tap or click knocks it into a
 * quick, wide swing that dies back into the float. Taps close together add up, so a
 * flurry of taps sets it spinning about harder. Purely decorative: no role, not in the
 * tab order, and still when motion is turned off.
 */
function playfulFeather(): HTMLElement {
  const shadow = h('i', { class: 'casual-feather-shadow' });
  const art = h('span', { class: 'casual-feather-art', html: ICONS.casual });
  const el = h('span', { class: 'casual-feather', attrs: { 'aria-hidden': 'true' } }, shadow, art);
  let energy = 0;
  let lastTap = 0;
  el.addEventListener('pointerdown', () => {
    if (reducedMotion()) return;
    const now = performance.now();
    // what's left of the last knock, plus this one: up to about three taps' worth
    energy = Math.min(3, energy * Math.max(0, 1 - (now - lastTap) / 1400) + 1);
    lastTap = now;
    const swing = 10 + 9 * energy;  // degrees
    const lift = 6 + 5 * energy;    // px
    // the art: on the img inside, so it adds to the float running on its parent
    const img = art.querySelector<HTMLElement>('.brush-art') ?? art;
    img.getAnimations().forEach((a) => a.cancel());
    img.animate(
      [
        { transform: 'none' },
        { transform: `translate(${-lift * 0.4}px, ${-lift}px) rotate(${-swing}deg)`, offset: 0.14 },
        { transform: `translate(${lift * 0.35}px, ${-lift * 0.5}px) rotate(${swing * 0.75}deg)`, offset: 0.32 },
        { transform: `translate(${-lift * 0.2}px, ${-lift * 0.3}px) rotate(${-swing * 0.45}deg)`, offset: 0.52 },
        { transform: `rotate(${swing * 0.22}deg)`, offset: 0.72 },
        { transform: `rotate(${-swing * 0.08}deg)`, offset: 0.88 },
        { transform: 'none' },
      ],
      { duration: 900 + 250 * energy, easing: 'ease-out', composite: 'add' },
    );
    // the shadow shrinks and fades as the feather is knocked up, then settles
    shadow.animate(
      [{ scale: '1', opacity: 1 }, { scale: `${0.7 - 0.06 * energy} 1`, opacity: 0.45, offset: 0.2 }, { scale: '1', opacity: 1 }],
      { duration: 900 + 250 * energy, easing: 'ease-out', composite: 'add' },
    );
  });
  return el;
}

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
        playfulFeather(),
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
