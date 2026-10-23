import backArt from './art/screens/back.svg';
import * as copy from './copy/en.ts';
import { RIBBON_BOX, RIBBON_PATH } from './ribbon.ts';
import { h, type Banner } from './ui.ts';
import { withRays } from './rays.ts';

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
 * the tail keep their places on the cloth. Under it, in the space below the tail, a large Back
 * (the owner's Deco arrowhead in a seal with diamond rails) that stays put and goes back when
 * pressed. Returned as the banner's column, the ribbon and the Back under it.
 */
export function pageBanner(header: HTMLElement, banner: Banner, onBack: () => void): HTMLElement {
  const inner = h(
    'div',
    { class: 'banner-inner' },
    header,
    banner.help ? h('p', { class: 'banner-help', text: banner.help }) : null,
    withRays(h('div', { class: 'banner-art', attrs: { 'aria-hidden': 'true' } }, banner.art)),
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
  // a big target for the pointer and touch; the keyboard and screen readers have the Back at the
  // ribbon's top (first in order), so this one stays out of the tab order and the reading, not a
  // second "Back" on every page
  const back = h('button', { class: 'banner-back', attrs: { type: 'button', 'aria-label': copy.common.back, 'aria-hidden': 'true', tabindex: '-1' }, onclick: onBack },
    h('span', { class: 'banner-back-seal', html: SEAL, attrs: { 'aria-hidden': 'true' } }),
    h('img', { class: 'banner-back-art', attrs: { src: backArt, alt: '', draggable: 'false' } }));
  return h('div', { class: 'banner-col' }, el, h('div', { class: 'banner-back-slot' }, back));
}

/**
 * Behind the Back: the seal and diamond rails (docs/DESIGN_SYSTEM.md, background ornaments). A seal
 * of two thin rings with a band of short rune ticks between them (the arrowhead is its crest), and
 * on each side a nested diamond, then a broken rail out to a small dot. Hairlines in the page's
 * ink (banner.css makes it faint), on a 300 × 130 box centred on the arrowhead.
 */
const SEAL = (() => {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const [r1, r2] = i % 2 ? [56.5, 59] : [55.5, 60];
    return `M${(150 + Math.cos(a) * r1).toFixed(1)} ${(65 + Math.sin(a) * r1).toFixed(1)}L${(150 + Math.cos(a) * r2).toFixed(1)} ${(65 + Math.sin(a) * r2).toFixed(1)}`;
  }).join('');
  // one side's rail, drawn to the right and mirrored for the left
  const rail = 'M214 65l8-8 8 8-8 8z M218 65l4-4 4 4-4 4z M234 65h14 M252 65h20 M276 65h8';
  return `<svg viewBox="0 0 300 130" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="150" cy="65" r="62"/><circle cx="150" cy="65" r="53"/><path d="${ticks}"/><path d="${rail}"/><path d="${rail}" transform="matrix(-1 0 0 1 300 0)"/><circle cx="289" cy="65" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="65" r="2" fill="currentColor" stroke="none"/></svg>`;
})();
