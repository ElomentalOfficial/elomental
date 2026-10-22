import { RIBBON_BOX, RIBBON_PATH } from './ribbon.ts';
import { h, type Banner } from './ui.ts';

/** The splash ribbon's outline as a mask, stretched to the banner as laid out (banner.css). */
const RIBBON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${RIBBON_BOX.x} 0 ${RIBBON_BOX.width} ${RIBBON_BOX.height}" preserveAspectRatio="none"><path d="${RIBBON_PATH}"/></svg>`,
)}")`;
/** The torn tail's share of the ribbon's length: its notches reach up to 630 of 740 units. */
const TAIL = (RIBBON_BOX.height - 630) / RIBBON_BOX.height;

/**
 * A wide page's banner (ui.ts subPage): the splash ribbon itself (ribbon.ts), with its small tear
 * on each side and its torn tail, in the theme's accent, hung from the top edge like the game
 * screen's: only as long as what it carries (Back and the title, the art, the page's line, its
 * foot), and the tail below them. Its whole outline stretches to that length, so the tears and
 * the tail keep their places on the cloth.
 */
export function pageBanner(header: HTMLElement, banner: Banner): HTMLElement {
  const inner = h(
    'div',
    { class: 'banner-inner' },
    header,
    banner.help ? h('p', { class: 'banner-help', text: banner.help }) : null,
    h('div', { class: 'banner-art', attrs: { 'aria-hidden': 'true' } }, banner.art),
    banner.foot ? h('div', { class: 'banner-foot' }, banner.foot) : null,
  );
  const el = h('div', { class: 'page-banner' }, inner);
  el.style.setProperty('--ribbon', RIBBON_MASK);
  // room for the tail under the contents, however tall they grow (a foot that loads later, Text size)
  const fit = () => {
    const top = parseFloat(getComputedStyle(el).paddingTop) || 0;
    // the tail's reach, then a clear group's step (--space-6) between its spikes and the last line
    const room = Math.ceil(((top + inner.offsetHeight) * TAIL) / (1 - TAIL)) + 32;
    if (Math.abs(room - (parseFloat(el.style.paddingBottom) || 0)) > 1) el.style.paddingBottom = `${room}px`;
  };
  new ResizeObserver(fit).observe(inner);
  return el;
}
