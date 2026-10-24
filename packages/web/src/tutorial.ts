import { readJson, removeKey, writeJson } from './storage.ts';
import { h, holdFocus, labelByHeading } from './ui.ts';
import * as copy from './copy/en.ts';

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

/**
 * The area a target covers. A `display: contents` wrapper (the keypad in the
 * desktop layout) has no box of its own, so it's the area its children cover.
 */
function areaOf(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  if (r.width || r.height) return r;
  const parts = [...el.children].map((c) => c.getBoundingClientRect()).filter((c) => c.width || c.height);
  if (!parts.length) return r;
  const left = Math.min(...parts.map((p) => p.left));
  const top = Math.min(...parts.map((p) => p.top));
  return new DOMRect(left, top, Math.max(...parts.map((p) => p.right)) - left, Math.max(...parts.map((p) => p.bottom)) - top);
}

export function runTutorial(steps: TutorialStep[]): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const spotlight = h('div', { class: 'coach-spot' });
    const finger = h('div', { class: 'coach-finger' });
    const counter = h('span', { class: 'coach-count' });
    const title = h('h3');
    const text = h('p');
    const next = h('button', { class: 'btn btn-primary btn-compact coach-next' });
    const skip = h('button', { class: 'coach-skip', text: copy.tutorial.skip });
    // Focus stays on Next while the steps change; the live text announces each step.
    const card = h(
      'div',
      { class: 'coach-card', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      h('div', { attrs: { 'aria-live': 'polite' } }, counter, title, text),
      h('div', { class: 'coach-actions' }, skip, next),
    );
    const layer = h('div', { class: 'coach-layer' }, spotlight, finger, card);
    // The layer swallows touches so the game can't be played underneath, but never
    // on the buttons: on iOS, cancelling touchstart also cancels the tap's click,
    // which is what froze Next and Skip.
    // The card itself is let through too, so a card taller than the screen (large text) can scroll.
    const onButton = (event: Event) => !!(event.target as HTMLElement | null)?.closest?.('button, .coach-card');
    layer.addEventListener(
      'touchstart',
      (event) => {
        if (!onButton(event)) event.preventDefault();
      },
      { passive: false },
    );
    layer.addEventListener('pointerdown', (event) => {
      if (!onButton(event)) event.preventDefault();
    });
    document.body.append(layer);
    // The screen edges iOS paints itself (status bar, home indicator) dim with the page.
    document.documentElement.classList.add('coach-open');
    // Keyboard and screen reader: focus on Next, Tab stays in the card, Esc skips.
    labelByHeading(card);
    const release = holdFocus(card, { onEscape: () => skipAll(), initial: next });

    const finish = () => {
      release();
      layer.classList.add('closing');
      document.documentElement.classList.remove('coach-open');
      setTimeout(() => layer.remove(), 200);
      resolve();
    };

    const show = () => {
      const step = steps[index];
      // With large text the game scrolls: bring the control into view before measuring it.
      const box = step.target.getBoundingClientRect().width ? step.target : (step.target.firstElementChild as HTMLElement | null);
      box?.scrollIntoView({ block: 'nearest' });
      const r = areaOf(step.target);
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

      counter.textContent = copy.tutorial.counter(index + 1, steps.length);
      title.textContent = step.title;
      text.textContent = step.text;
      next.textContent = index === steps.length - 1 ? copy.tutorial.start : copy.common.next;
      skip.style.visibility = index === steps.length - 1 ? 'hidden' : 'visible';

      // Place the card where it fits inside the *visible* area (Safari's toolbars
      // can cover part of the layout viewport): below the spotlight, else above,
      // else beside it where there's room (a side-by-side game: the board on one
      // side, the keys on the other), else pinned to the bottom of what is
      // visible, overlapping the spotlight.
      const view = window.visualViewport;
      const viewTop = view?.offsetTop ?? 0;
      const viewBottom = viewTop + (view?.height ?? innerHeight);
      const gap = 14;
      const edge = 12;
      const narrowest = 240;
      Object.assign(card.style, { top: '0px', bottom: '', left: '', right: '', margin: '', width: '' });
      const cardHeight = card.offsetHeight;
      let top: number;
      const roomRight = innerWidth - edge - (r.right + gap);
      const roomLeft = r.left - gap - edge;
      if (r.bottom + gap + cardHeight <= viewBottom - edge) top = r.bottom + gap;
      else if (r.top - gap - cardHeight >= viewTop + edge) top = r.top - gap - cardHeight;
      else if (Math.max(roomRight, roomLeft) >= narrowest) {
        const width = Math.min(card.offsetWidth, Math.max(roomRight, roomLeft));
        const left = roomRight >= roomLeft ? r.right + gap : r.left - gap - width;
        Object.assign(card.style, { width: `${width}px`, left: `${left}px`, right: 'auto', margin: '0' });
        // level with the spotlight's middle, inside what is visible (measured again at the new width)
        top = Math.min(viewBottom - edge - card.offsetHeight, r.top + r.height / 2 - card.offsetHeight / 2);
      } else top = viewBottom - edge - cardHeight;
      card.style.top = `${Math.max(viewTop + edge, top)}px`;
      card.classList.remove('enter');
      void card.offsetWidth;
      card.classList.add('enter');
    };

    // pointerup rather than click: it fires on iOS even if a click is ever suppressed.
    let done = false;
    const advance = () => {
      if (done) return;
      index++;
      if (index >= steps.length) {
        done = true;
        finish();
      } else show();
    };
    const skipAll = () => {
      if (done) return;
      done = true;
      finish();
    };
    next.addEventListener('pointerup', advance);
    skip.addEventListener('pointerup', skipAll);
    // Keyboard and accessibility activation still come through click (detail 0).
    next.addEventListener('click', (event) => {
      if (event.detail === 0) advance();
    });
    skip.addEventListener('click', (event) => {
      if (event.detail === 0) skipAll();
    });
    show();
  });
}
