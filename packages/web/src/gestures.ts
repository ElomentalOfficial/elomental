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
      // With large text (Setup > Accessibility) every screen can scroll.
      const area = (event.target as Element | null)?.closest?.<HTMLElement>('.scrollable, html[data-large-text] .screen');
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
