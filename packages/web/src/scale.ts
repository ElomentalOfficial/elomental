/**
 * Tablets held upright (and narrow desktop windows) show the phone layout
 * scaled up as one piece, like the Figma "iPad Pro 11 - 1" frame: CSS zoom by
 * whichever fits first, the width over the phone column (440) or the height
 * over a tall phone (800). Phones stay at 1, and the wide layout (tablet
 * landscape, desktop) arranges itself instead (styles.css, Wide layouts).
 */

/**
 * The wide layout (Banner and Doors pages, the wide Home and game): a window 900 wide or more,
 * landscape (5:4 or wider) and 540 tall or more, so a 1280 x 720 laptop's maximised browser
 * (about 585 tall) gets it. The stylesheets repeat this query (CSS has no shared media queries).
 */
export const WIDE_QUERY = '(min-width: 900px) and (min-height: 540px) and (min-aspect-ratio: 5/4)';

const PHONE_WIDTH = 440;
const PHONE_HEIGHT = 800;
const MAX_ZOOM = 2;

export function installUiScale(): void {
  const wide = matchMedia(WIDE_QUERY);
  const update = () => {
    const fit = Math.min(innerWidth / PHONE_WIDTH, innerHeight / PHONE_HEIGHT);
    const zoom = wide.matches || innerWidth < 600 ? 1 : Math.min(MAX_ZOOM, Math.max(1, fit));
    document.documentElement.style.setProperty('--ui-zoom', zoom.toFixed(3));
    // The window zooms below apply at every Text size, so 200% text is twice what 100% shows (WCAG
    // 1.4.4); a page or pop-up that then outgrows the window scrolls.
    // Wide Home: tile contents grow with the window (1 at 1180×760, up to 1.6).
    const wideZoom = Math.min(1.6, Math.max(1, Math.min(innerWidth / 1180, innerHeight / 760) * 1.15));
    document.documentElement.style.setProperty('--wide-zoom', wideZoom.toFixed(3));
    // Wide pop-ups: grow with the window's height (1.3 at 735px tall, up to 1.6),
    // so the tallest one (Casual) still fits on screen at 100%.
    const modalZoom = Math.min(1.6, Math.max(1, innerHeight / 565));
    document.documentElement.style.setProperty('--modal-zoom', modalZoom.toFixed(3));
  };
  addEventListener('resize', update);
  wide.addEventListener('change', update);
  update();
}
