/**
 * Firefox draws a custom cursor at the CSS zoom of the element under it, and every page but
 * phone Home is zoomed somewhere (scale.ts: tablets, the wide pages, pop-ups, Home's tiles), so
 * the cursor grew and shrank as it crossed them. Over a zoomed element the arrow is asked for at that
 * zoom's resolution instead (a 2x image drawn at half size), which Firefox's zoom then undoes:
 * one size everywhere. Other browsers don't zoom cursors and keep base.css as it is.
 */
import arrow from './assets/cursors/arrow.png';
import arrow2 from './assets/cursors/arrow@2x.png';
import lit from './assets/cursors/arrow-lit.png';
import lit2 from './assets/cursors/arrow-lit@2x.png';
import { onA11yChange } from './a11y.ts';

export function installCursorZoom(): void {
  if (!/\bFirefox\//.test(navigator.userAgent)) return;
  // when base.css shows the drawn cursor at all
  const gemShown = matchMedia('(pointer: fine) and (forced-colors: none)');
  const root = document.documentElement;
  let shown = 1;
  const show = (zoom: number) => {
    if (zoom === shown) return;
    shown = zoom;
    if (zoom === 1) {
      root.style.removeProperty('--cursor-default');
      root.style.removeProperty('--cursor-pointer');
      return;
    }
    const at = (one: string, two: string) => `image-set(url('${one}') ${zoom}x, url('${two}') ${2 * zoom}x) 3 3`;
    root.style.setProperty('--cursor-default', `${at(arrow, arrow2)}, auto`);
    root.style.setProperty('--cursor-pointer', `${at(lit, lit2)}, pointer`);
  };
  addEventListener(
    'pointerover',
    (event) => {
      const target = event.target as (Element & { currentCSSZoom?: number }) | null;
      const zoom = gemShown.matches && root.dataset.cursor === 'gem' ? (target?.currentCSSZoom ?? 1) : 1;
      show(Math.round(zoom * 1000) / 1000);
    },
    { passive: true },
  );
  // the system's pointer chosen in Setup: drop the arrow at once
  onA11yChange(() => {
    if (root.dataset.cursor !== 'gem') show(1);
  });
}
