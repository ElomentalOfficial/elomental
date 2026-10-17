/**
 * Tablets held upright (and narrow desktop windows) show the phone layout
 * scaled up as one piece, like the Figma "iPad Pro 11 - 1" frame: CSS zoom by
 * whichever fits first, the width over the phone column (440) or the height
 * over a tall phone (800). Phones stay at 1, and the wide layout (tablet
 * landscape, desktop) arranges itself instead (styles.css, Wide layouts).
 */
const PHONE_WIDTH = 440;
const PHONE_HEIGHT = 800;
const MAX_ZOOM = 2;

export function installUiScale(): void {
  const wide = matchMedia('(min-width: 900px) and (min-height: 600px) and (min-aspect-ratio: 5/4)');
  const update = () => {
    const fit = Math.min(innerWidth / PHONE_WIDTH, innerHeight / PHONE_HEIGHT);
    const zoom = wide.matches || innerWidth < 600 ? 1 : Math.min(MAX_ZOOM, Math.max(1, fit));
    document.documentElement.style.setProperty('--ui-zoom', zoom.toFixed(3));
    // Wide Home: tile contents grow with the window (1 at 1180×760, up to 1.6).
    const wideZoom = Math.min(1.6, Math.max(1, Math.min(innerWidth / 1180, innerHeight / 760) * 1.15));
    document.documentElement.style.setProperty('--wide-zoom', wideZoom.toFixed(3));
  };
  addEventListener('resize', update);
  wide.addEventListener('change', update);
  update();
}
