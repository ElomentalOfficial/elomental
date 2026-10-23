import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/** How long a press must be held to confirm. */
const HOLD_MS = 700;
/** How long a screen reader's first press keeps the button armed. */
const ARMED_MS = 5000;

let ids = 0;

/**
 * Hold to confirm (owner, 2026-10-23): the button for a step that spends, commits or can't be
 * undone acts only when held, a fill sweeping across it, so a stray tap never does it. Returns the
 * button with a "Hold to confirm" line under it, to place where the button went.
 *
 * Every way in works:
 * - mouse and touch: press and hold; letting go early cancels and nudges the line;
 * - keyboard: hold Enter or Space;
 * - screen readers, which press without holding: the first press arms the button and says so,
 *   the next one (within a few seconds) confirms.
 */
export function holdToConfirm(btn: HTMLButtonElement, confirm: () => void): HTMLElement {
  const hint = h('p', { class: 'hold-hint', text: copy.common.holdHint, attrs: { id: `hold-hint-${++ids}`, 'aria-live': 'polite' } });
  btn.classList.add('hold-btn');
  btn.setAttribute('aria-describedby', hint.id);
  btn.style.setProperty('--hold-ms', `${HOLD_MS}ms`);

  let timer = 0;
  /** A pointer press is under way: its click is the hold's, not a screen reader's. */
  let pointerPress = false;
  let armedUntil = 0;

  const fire = () => {
    stop(false);
    armedUntil = 0;
    hint.textContent = copy.common.holdHint;
    confirm();
  };
  const start = () => {
    if (btn.disabled || timer) return;
    btn.classList.add('holding');
    timer = window.setTimeout(fire, HOLD_MS);
  };
  /** Ends a hold; `early` when let go before it confirmed, which nudges the line. */
  const stop = (early: boolean) => {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    btn.classList.remove('holding');
    if (early) {
      hint.classList.remove('nudge');
      void hint.offsetWidth;
      hint.classList.add('nudge');
    }
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerPress = true;
    start();
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, () => stop(true));
  // a long press on a phone would otherwise open the system's menu
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) start();
  });
  btn.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    stop(true);
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (pointerPress) {
      pointerPress = false;
      return;
    }
    // a press with no hold: a screen reader's
    if (btn.disabled) return;
    if (Date.now() < armedUntil) return fire();
    armedUntil = Date.now() + ARMED_MS;
    hint.textContent = copy.common.pressAgain;
    window.setTimeout(() => {
      if (Date.now() >= armedUntil) hint.textContent = copy.common.holdHint;
    }, ARMED_MS);
  });

  return h('div', { class: 'hold' }, btn, hint);
}
