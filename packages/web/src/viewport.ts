/**
 * iOS home-screen web apps with a translucent status bar report a layout
 * viewport that is shorter than the screen by about the status-bar height,
 * so anything fixed to `bottom: 0` stops short and leaves a strip of the page
 * colour at the bottom. We measure the shortfall rather than assume it, so
 * the fix does nothing if a future iOS stops doing this, and stretch the
 * fixed layers by it (see --standalone-gap in styles.css).
 */
export function installStandaloneFixes(): void {
  const root = document.documentElement;
  if (!root.classList.contains('standalone')) return;

  const measure = () => {
    const portrait = matchMedia('(orientation: portrait)').matches;
    const screenHeight = portrait
      ? Math.max(screen.height, screen.width)
      : Math.min(screen.height, screen.width);
    const gap = Math.round(screenHeight - window.innerHeight);
    // Only a status-bar-sized shortfall is this bug; anything else is real chrome.
    root.style.setProperty('--standalone-gap', gap > 0 && gap <= 80 ? `${gap}px` : '0px');
  };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));
}
