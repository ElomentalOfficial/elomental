/**
 * Home-screen (standalone) layout fix for iOS with a translucent status bar.
 *
 * In this mode iOS can end the page (every fixed layer, and 100lvh) short of the screen's
 * bottom; nothing drawn past that line shows (a taller page came out cut). A fixed probe pinned
 * to `bottom: 0` finds the line (window sizes have proved unreliable here), and the shortfall is
 * --standalone-gap: that strip already clears the home indicator, so screens keep only what's left
 * of the safe area (base.css --safe-bottom). Measured again whenever the layout can have settled
 * or changed, never only at launch. --screen-h is the full screen, for the background lines.
 * iOS only (navigator.standalone): an installed app on Android keeps its system bars outside the
 * page, so its screen height says nothing about the page's.
 */
export function installStandaloneFixes(): void {
  const root = document.documentElement;
  if (!root.classList.contains('standalone') || (navigator as { standalone?: boolean }).standalone !== true) return;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.append(probe);

  const measure = () => {
    const portrait = matchMedia('(orientation: portrait)').matches;
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const gap = Math.round(screenHeight - probe.getBoundingClientRect().bottom);
    // only a status-bar-sized shortfall is this; anything else is real system UI
    root.style.setProperty('--standalone-gap', gap > 0 && gap <= 100 ? `${gap}px` : '0px');
    root.style.setProperty('--screen-h', `${screenHeight}px`);
  };
  const soon = () => requestAnimationFrame(() => requestAnimationFrame(measure));
  measure();
  soon();
  setTimeout(measure, 500);
  window.addEventListener('load', soon);
  window.addEventListener('pageshow', soon);
  window.addEventListener('resize', measure);
  visualViewport?.addEventListener('resize', measure);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
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
    `fixed layers end at: ${fixedBottom}, gap: ${getComputedStyle(document.documentElement).getPropertyValue('--standalone-gap') || 'none'}`,
    `100lvh: ${lvh}, screen-h: ${getComputedStyle(document.documentElement).getPropertyValue('--screen-h') || 'none'}`,
    `safe areas (t/r/b/l): ${insets}`,
  ];
}
