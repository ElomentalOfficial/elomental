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
  // so fast taps on buttons (like the theme switch) still register.
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (event) => {
      const now = event.timeStamp;
      if (now - lastTouchEnd < DOUBLE_TAP_MS && event.cancelable) {
        event.preventDefault();
        (event.target as Element | null)?.closest?.('button')?.click();
      }
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Two-finger touches start a pinch even before gesturestart fires.
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );

  // Text selection and the long-press menu (the notes wheel owns long-press).
  document.addEventListener('selectstart', (event) => event.preventDefault());
  document.addEventListener('contextmenu', (event) => event.preventDefault());

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
