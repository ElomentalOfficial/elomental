import { readJson, removeKey, writeJson } from './storage.ts';
import { h } from './ui.ts';

/**
 * First-game coach marks: a spotlight moves over each control with a short
 * card explaining it. Shown once; Setup can replay it.
 */

const DONE_KEY = 'elomental:tutorial-done';

export const tutorialDone = (): boolean => readJson<boolean>(DONE_KEY) === true;
export const markTutorialDone = (): void => writeJson(DONE_KEY, true);
export const resetTutorial = (): void => removeKey(DONE_KEY);

export interface TutorialStep {
  target: HTMLElement;
  title: string;
  text: string;
  /** Little animated finger showing the gesture. */
  gesture?: 'tap' | 'hold-slide';
}

export function runTutorial(steps: TutorialStep[]): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const spotlight = h('div', { class: 'coach-spot' });
    const finger = h('div', { class: 'coach-finger' });
    const counter = h('span', { class: 'coach-count' });
    const title = h('h3');
    const text = h('p');
    const next = h('button', { class: 'btn btn-primary coach-next' });
    const skip = h('button', { class: 'coach-skip', text: 'Skip' });
    const card = h(
      'div',
      { class: 'coach-card', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      counter,
      title,
      text,
      h('div', { class: 'coach-actions' }, skip, next),
    );
    const layer = h('div', { class: 'coach-layer' }, spotlight, finger, card);
    // The layer swallows every touch so the game can't be played underneath.
    layer.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
    layer.addEventListener('pointerdown', (event) => {
      if (!(event.target as HTMLElement).closest('button')) event.preventDefault();
    });
    document.body.append(layer);

    const finish = () => {
      layer.classList.add('closing');
      setTimeout(() => layer.remove(), 200);
      resolve();
    };

    const show = () => {
      const step = steps[index];
      const r = step.target.getBoundingClientRect();
      const pad = 6;
      Object.assign(spotlight.style, {
        left: `${r.left - pad}px`,
        top: `${r.top - pad}px`,
        width: `${r.width + pad * 2}px`,
        height: `${r.height + pad * 2}px`,
      });
      finger.className = `coach-finger ${step.gesture ?? ''}`;
      finger.style.left = `${r.left + r.width / 2}px`;
      finger.style.top = `${r.top + r.height / 2}px`;

      counter.textContent = `${index + 1} / ${steps.length}`;
      title.textContent = step.title;
      text.textContent = step.text;
      next.textContent = index === steps.length - 1 ? "Let's play" : 'Next';
      skip.style.visibility = index === steps.length - 1 ? 'hidden' : 'visible';

      // Put the card on whichever side of the spotlight has more room.
      const below = innerHeight - r.bottom;
      card.style.top = '';
      card.style.bottom = '';
      if (below > r.top) card.style.top = `${r.bottom + 18}px`;
      else card.style.bottom = `${innerHeight - r.top + 18}px`;
      card.classList.remove('enter');
      void card.offsetWidth;
      card.classList.add('enter');
    };

    next.addEventListener('click', () => {
      index++;
      if (index >= steps.length) finish();
      else show();
    });
    skip.addEventListener('click', finish);
    show();
  });
}
