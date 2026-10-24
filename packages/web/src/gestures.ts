/**
 * The app must never zoom, select text or show the long-press callout.
 * iOS ignores `user-scalable=no` for accessibility, so each browser gesture
 * is blocked where it starts, with a last-resort reset if a zoom slips through.
 */

const DOUBLE_TAP_MS = 350;

export function installZoomGuards(): void {
  // Pinch zoom (Safari's proprietary gesture events).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }

  // Double-tap zoom: swallow the second tap's default and replay it as a click,
  // so fast taps on buttons (like the theme switch) still register. Only taps
  // count: quick flicks through a scrolling list must not click what they end on.
  let lastTouchEnd = 0;
  let startX = 0;
  let startY = 0;
  document.addEventListener(
    'touchstart',
    (event) => {
      startX = event.touches[0]?.clientX ?? 0;
      startY = event.touches[0]?.clientY ?? 0;
    },
    { passive: true },
  );
  document.addEventListener(
    'touchend',
    (event) => {
      const end = event.changedTouches[0];
      if (end && Math.hypot(end.clientX - startX, end.clientY - startY) > 10) {
        lastTouchEnd = 0;
        return;
      }
      const now = event.timeStamp;
      if (now - lastTouchEnd < DOUBLE_TAP_MS && event.cancelable) {
        event.preventDefault();
        (event.target as Element | null)?.closest?.('button')?.click();
      }
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Nothing in the app scrolls, so no drag may move the page (iOS sometimes
  // scrolls a fixed, overflow-hidden page anyway). Pointer events — board, notes
  // wheel — still arrive; this only stops the browser's own panning and pinching.
  // The exception: inside a `.scrollable` area that actually overflows (Setup, tall pop-ups).
  document.addEventListener(
    'touchmove',
    (event) => {
      // With large text (Setup > Accessibility) every screen can scroll, and the game screen can on
      // a short upright screen (game.css)
      const area = (event.target as Element | null)?.closest?.<HTMLElement>('.scrollable, html[data-large-text] :is(.screen, .coach-card), .screen.game');
      if (area && area.scrollHeight > area.clientHeight + 1) return;
      event.preventDefault();
    },
    { passive: false },
  );
  const pin = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  };
  window.addEventListener('scroll', pin, { passive: true });
  window.visualViewport?.addEventListener('scroll', pin);

  // Text selection and the long-press menu (the notes wheel owns long-press).
  // Text fields keep both, so a Clash code can be pasted.
  const inField = (event: Event) => (event.target as Element | null)?.closest?.('input, textarea');
  document.addEventListener('selectstart', (event) => {
    if (!inField(event)) event.preventDefault();
  });
  document.addEventListener('contextmenu', (event) => {
    if (!inField(event)) event.preventDefault();
  });

  // Safety net: if the page is ever zoomed anyway, snap it back. Rewriting the
  // viewport meta makes iOS re-apply maximum-scale=1.
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const reset = () => {
    if (!viewport || !window.visualViewport || window.visualViewport.scale <= 1.01) return;
    const content = viewport.content;
    viewport.content = `${content}, x=1`;
    requestAnimationFrame(() => (viewport.content = content));
  };
  window.visualViewport?.addEventListener('resize', reset);
}

/** Whether `el` can scroll further in the direction of `dy`. */
const canScroll = (el: Element, dy: number) =>
  /auto|scroll/.test(getComputedStyle(el).overflowY) &&
  el.scrollHeight > el.clientHeight + 1 &&
  (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0);

/**
 * Desktop: the mouse wheel scrolls the page from anywhere in the window, not
 * only over the column that scrolls. A wheel turn outside it is handed to the
 * topmost scrolling area: the tutorial card, an open pop-up, then the page.
 */
export function installWheelScroll(): void {
  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || !event.deltaY) return; // ctrl+wheel is the browser's zoom
      // The last match is the newest: the screen coming in during a page turn, the pop-up on top.
      const last = (selector: string) => [...document.querySelectorAll(selector)].pop();
      const area =
        last('.coach-card') ??
        last('.backdrop') ??
        last('.screen.sub > .sub-body, .screen.scrollable, html[data-large-text] .screen:not(.sub)');
      const target = event.target as Element | null;
      if (!area || !target || area.contains(target)) return;
      // Something under the mouse scrolls by itself (a list in a pop-up): leave it be.
      for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
        if (canScroll(el, event.deltaY)) return;
      }
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? area.clientHeight : 1;
      area.scrollBy({ top: event.deltaY * lines });
    },
    { passive: true },
  );
}
