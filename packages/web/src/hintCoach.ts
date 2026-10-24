import type { Marks, Stage } from './explain.ts';
import { h, holdFocus, labelByHeading } from './ui.ts';
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
    const next = h('button', { class: 'btn btn-primary btn-compact coach-next' });
    const close = h('button', { class: 'coach-skip', text: copy.common.close });
    // Focus stays on Next while the stages change; the live text announces each one.
    const card = h(
      'div',
      { class: 'coach-card hint-card', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      h('div', { attrs: { 'aria-live': 'polite' } }, counter, title, text),
      h('div', { class: 'coach-actions' }, close, next),
    );
    const layer = h('div', { class: 'hint-layer' }, card);

    // Swallow touches outside the card's buttons (iOS: never cancel a button's own touch).
    const onButton = (event: Event) => !!(event.target as HTMLElement | null)?.closest?.('button');
    layer.addEventListener('touchstart', (event) => !onButton(event) && event.preventDefault(), { passive: false });
    layer.addEventListener('pointerdown', (event) => !onButton(event) && event.preventDefault());
    document.body.append(layer);
    labelByHeading(card);
    const release = holdFocus(card, { onEscape: () => finish(false), initial: next });

    // The card sits over the number pad (hints.css), unless there it hides squares the hint explains
    // (a tall card at a large Text size over a low board): then at the top of the screen, over the
    // clock, if that hides fewer of them. Decided once for the whole hint, from every stage's
    // squares, so the card (and Next under the thumb) stays put from stage to stage.
    const explained = [...new Set(stages.flatMap(({ marks: m }) => [...(m.focus ?? []), ...(m.ring ?? []), ...(m.target !== undefined ? [m.target] : [])]))];
    const covered = () => {
      const r = card.getBoundingClientRect();
      return explained
        .map((i) => document.querySelector(`[data-cell="${i}"]`)?.getBoundingClientRect())
        .filter((c) => c && c.bottom > r.top + 1 && c.top < r.bottom - 1 && c.right > r.left + 1 && c.left < r.right - 1).length;
    };
    const place = () => {
      card.classList.remove('at-top');
      const below = covered();
      if (!below) return;
      card.classList.add('at-top');
      if (covered() >= below) card.classList.remove('at-top');
    };

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

    // (a window that changes size moves the board under it: placed again)
    addEventListener('resize', place);
    const finish = (placed: boolean) => {
      if (done) return;
      done = true;
      removeEventListener('resize', place);
      release();
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
    place();
  });
}
