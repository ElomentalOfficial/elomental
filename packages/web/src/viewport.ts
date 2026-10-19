/**
 * Home-screen (standalone) layout fixes for iOS with a translucent status bar.
 *
 * Fixed layers can stop short of the bottom of the screen in this mode,
 * leaving a strip. We measure it directly with a fixed probe pinned to
 * `bottom: 0` (window sizes have proved unreliable here) and expose the
 * shortfall as --standalone-gap, which the fixed layers extend by.
 */
export function installStandaloneFixes(): void {
  const root = document.documentElement;
  if (!root.classList.contains('standalone')) return;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
  document.body.append(probe);

  const measure = () => {
    const portrait = matchMedia('(orientation: portrait)').matches;
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const fixedBottom = probe.getBoundingClientRect().bottom;
    const gap = Math.round(screenHeight - fixedBottom);
    // Only a status-bar-sized shortfall is this bug; anything else is real system UI.
    root.style.setProperty('--standalone-gap', gap > 0 && gap <= 100 ? `${gap}px` : '0px');
    // The page runs under the status bar and the home indicator, so the screen is
    // the full height to cover. 100lvh comes up short here (the background lines
    // stopped about a status bar above the bottom).
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
  probe.remove();
  const body = document.body.getBoundingClientRect();
  return [
    `standalone: ${document.documentElement.classList.contains('standalone')}`,
    `screen: ${screen.width}×${screen.height} @${devicePixelRatio}x`,
    `window: ${innerWidth}×${innerHeight}`,
    `visual viewport: ${Math.round(visualViewport?.width ?? 0)}×${Math.round(visualViewport?.height ?? 0)}`,
    `body: top ${Math.round(body.top)}, bottom ${Math.round(body.bottom)}`,
    `gap: ${getComputedStyle(document.documentElement).getPropertyValue('--standalone-gap') || 'none'}`,
    `100lvh: ${lvh}, screen-h: ${getComputedStyle(document.documentElement).getPropertyValue('--screen-h') || 'none'}`,
    `safe areas (t/r/b/l): ${insets}`,
  ];
}
