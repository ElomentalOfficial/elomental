/**
 * Home-screen (standalone) layout fix for iOS with a translucent status bar.
 *
 * In this mode the app covers the whole screen, but iOS ends fixed layers (and 100lvh) short of
 * the bottom by about a status bar. Measuring that shortfall at launch proved unreliable (taken
 * before iOS settles the layout, it came back 0 and left a band under Home), so the page takes
 * the screen's own height instead: --screen-h, which the body and the full-screen layers use.
 * iOS only (navigator.standalone): an installed app on Android keeps its system bars outside the
 * page, where the screen's height would run past the bottom.
 */
export function installStandaloneFixes(): void {
  const root = document.documentElement;
  if (!root.classList.contains('standalone') || (navigator as { standalone?: boolean }).standalone !== true) return;

  const measure = () => {
    const portrait = matchMedia('(orientation: portrait)').matches;
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    root.style.setProperty('--screen-h', `${screenHeight}px`);
  };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', () => setTimeout(measure, 300));
}

/** Hidden diagnostics (Setup: tap the title five times) for layout issues on real phones. */
export function deviceInfo(): string[] {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const insets = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v)).join(' / ');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;height:100lvh';
  const lvh = Math.round(probe.getBoundingClientRect().height);
  probe.style.cssText = 'position:fixed;left:0;bottom:0;visibility:hidden;height:1px';
  const fixedBottom = Math.round(probe.getBoundingClientRect().bottom);
  probe.remove();
  const body = document.body.getBoundingClientRect();
  return [
    `standalone: ${document.documentElement.classList.contains('standalone')}`,
    `screen: ${screen.width}×${screen.height} @${devicePixelRatio}x`,
    `window: ${innerWidth}×${innerHeight}`,
    `visual viewport: ${Math.round(visualViewport?.width ?? 0)}×${Math.round(visualViewport?.height ?? 0)}`,
    `body: top ${Math.round(body.top)}, bottom ${Math.round(body.bottom)}`,
    `fixed layers end at: ${fixedBottom}`,
    `100lvh: ${lvh}, screen-h: ${getComputedStyle(document.documentElement).getPropertyValue('--screen-h') || 'none'}`,
    `safe areas (t/r/b/l): ${insets}`,
  ];
}
