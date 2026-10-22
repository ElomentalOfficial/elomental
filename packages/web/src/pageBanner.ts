import { RIBBON_BOX, RIBBON_PATH } from './ribbon.ts';
import { h, type Banner } from './ui.ts';

/** The splash ribbon's outline as a mask, stretched to the banner as laid out (banner.css). */
const RIBBON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${RIBBON_BOX.x} 0 ${RIBBON_BOX.width} ${RIBBON_BOX.height}" preserveAspectRatio="none"><path d="${RIBBON_PATH}"/></svg>`,
)}")`;

/**
 * A wide page's banner (ui.ts subPage): the splash ribbon itself (ribbon.ts), with its small tear
 * on each side and its torn tail, in the theme's accent as on the splash and the game screen. It
 * hangs from the top edge and carries Back and the title, then the art, the page's line and its
 * foot.
 */
export function pageBanner(header: HTMLElement, banner: Banner): HTMLElement {
  const el = h(
    'div',
    { class: 'page-banner' },
    header,
    banner.help ? h('p', { class: 'banner-help', text: banner.help }) : null,
    h('div', { class: 'banner-art', attrs: { 'aria-hidden': 'true' } }, banner.art),
    banner.foot ? h('div', { class: 'banner-foot' }, banner.foot) : null,
  );
  el.style.setProperty('--ribbon', RIBBON_MASK);
  return el;
}
