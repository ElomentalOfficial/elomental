/**
 * Tablets held upright (and narrow desktop windows) show the phone layout
 * scaled up as one piece, like the Figma "iPad Pro 11 - 1" frame: CSS zoom by
 * whichever fits first, the width over the phone column (440) or the height
 * over a tall phone (800). Phones stay at 1, and the wide layout (tablet
 * landscape, desktop) arranges itself instead (styles.css, Wide layouts).
 */
import { a11yPrefs, onA11yChange } from './a11y.ts';

const PHONE_WIDTH = 440;
const PHONE_HEIGHT = 800;
const MAX_ZOOM = 2;

export function installUiScale(): void {
  const wide = matchMedia('(min-width: 900px) and (min-height: 600px) and (min-aspect-ratio: 5/4)');
  const update = () => {
    const fit = Math.min(innerWidth / PHONE_WIDTH, innerHeight / PHONE_HEIGHT);
    const zoom = wide.matches || innerWidth < 600 ? 1 : Math.min(MAX_ZOOM, Math.max(1, fit));
    document.documentElement.style.setProperty('--ui-zoom', zoom.toFixed(3));
    // A larger Text size already grows the type: the window zooms below don't
    // stack on top of it, or 200% text would land at 2.6× and spill out.
    const text = a11yPrefs().textSize / 100;
    // Wide Home: tile contents grow with the window (1 at 1180×760, up to 1.6).
    const wideZoom = Math.min(1.6, Math.max(1, Math.min(innerWidth / 1180, innerHeight / 760) * 1.15));
    const wideText = Math.max(1, wideZoom / text);
    document.documentElement.style.setProperty('--wide-zoom', wideText.toFixed(3));
    // Icons and the avatar aren't text: they keep their 100% size at any Text size.
    document.documentElement.style.setProperty('--wide-icon-zoom', (wideZoom / wideText).toFixed(3));
    // Wide pop-ups: grow with the window's height (1.3 at 735px tall, up to 1.6),
    // so the tallest one (Casual) still fits on screen.
    const modalZoom = Math.min(1.6, Math.max(1, innerHeight / 565));
    document.documentElement.style.setProperty('--modal-zoom', Math.max(1, modalZoom / text).toFixed(3));
  };
  addEventListener('resize', update);
  wide.addEventListener('change', update);
  onA11yChange(update);
  update();
}
