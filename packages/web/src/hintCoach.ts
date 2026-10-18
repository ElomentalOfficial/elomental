import type { Marks, Stage } from './explain.ts';
import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Steps through a hint's explanation with the tutorial's card. The board stays
 * visible (only its highlights change); everything else ignores touches until
 * the player places the digit or closes the hint.
 *
 * Resolves true if the player chose to place the digit.
 */
export function runHintCoach(options: {
  stages: Stage[];
  placeLabel: string;
  show(marks: Marks): void;
}): Promise<boolean> {
  const { stages } = options;
  return new Promise((resolve) => {
    let index = 0;
    let done = false;
    const counter = h('span', { class: 'coach-count' });
    const title = h('h3');
    const text = h('p');
    const next = h('button', { class: 'btn btn-primary coach-next' });
    const close = h('button', { class: 'coach-skip', text: copy.common.close });
    const card = h(
      'div',
      { class: 'coach-card hint-card', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      counter,
      title,
      text,
      h('div', { class: 'coach-actions' }, close, next),
    );
    const layer = h('div', { class: 'hint-layer' }, card);

    // Swallow touches outside the card's buttons (iOS: never cancel a button's own touch).
    const onButton = (event: Event) => !!(event.target as HTMLElement | null)?.closest?.('button');
    layer.addEventListener('touchstart', (event) => !onButton(event) && event.preventDefault(), { passive: false });
    layer.addEventListener('pointerdown', (event) => !onButton(event) && event.preventDefault());
    document.body.append(layer);

    const show = () => {
      const stage = stages[index];
      counter.textContent = copy.hints.counter(index + 1, stages.length);
      title.textContent = stage.title;
      text.textContent = stage.text;
      next.textContent = index === stages.length - 1 ? options.placeLabel : copy.common.next;
      options.show(stage.marks);
      card.classList.remove('enter');
      void card.offsetWidth;
      card.classList.add('enter');
    };

    const finish = (placed: boolean) => {
      if (done) return;
      done = true;
      layer.classList.add('closing');
      setTimeout(() => layer.remove(), 180);
      resolve(placed);
    };

    const advance = () => {
      if (done) return;
      if (index === stages.length - 1) finish(true);
      else {
        index++;
        show();
      }
    };
    next.addEventListener('pointerup', advance);
    close.addEventListener('pointerup', () => finish(false));
    // Keyboard / assistive activation arrives as a click with detail 0.
    next.addEventListener('click', (event) => event.detail === 0 && advance());
    close.addEventListener('click', (event) => event.detail === 0 && finish(false));
    show();
  });
}
