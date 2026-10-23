import backArt from './art/screens/back.svg';
import * as copy from './copy/en.ts';
import { RIBBON_BOX, RIBBON_PATH } from './ribbon.ts';
import { h, type Banner } from './ui.ts';
import { withRays } from './rays.ts';

/** The splash ribbon's outline as a mask, stretched to the banner as laid out (banner.css). */
const RIBBON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${RIBBON_BOX.x} 0 ${RIBBON_BOX.width} ${RIBBON_BOX.height}" preserveAspectRatio="none"><path d="${RIBBON_PATH}"/></svg>`,
)}")`;
/** The cloth's side lines' wear (banner.css): specks taken out now and then, along their length. */
const WORN_V = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="96"><filter id="n" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.6 0.3" numOctaves="2" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -2.1"/></filter><rect width="12" height="96" filter="url(#n)"/></svg>',
)}")`;
/** The torn tail's share of the ribbon's length: its notches reach up to 630 of 740 units. */
const TAIL = (RIBBON_BOX.height - 630) / RIBBON_BOX.height;
/** The clear space between the last line on the cloth and the tail's highest spike (px): the
 *  owner's sketch, after 32 and then 56 read as too tight. */
const BREATH = 96;

/**
 * A wide page's banner (ui.ts subPage): the splash ribbon itself (ribbon.ts), with its small tear
 * on each side and its torn tail, in the theme's accent, hung from the top edge like the game
 * screen's: only as long as what it carries (Back and the title, the art, the page's line, its
 * foot), and the tail below them. Its whole outline stretches to that length, so the tears and
 * the tail keep their places on the cloth. Under it, in the space below the tail, a large Back
 * (the owner's Deco arrowhead in a seal with diamond rails) that stays put and goes back when
 * pressed, in place of the small Back on the ribbon. Returned as the banner's column, the ribbon
 * and the Back under it.
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
  el.style.setProperty('--worn-v', WORN_V);
  // room for the tail under the contents, however tall they grow (a foot that loads later, Text size)
  const fit = () => {
    const style = getComputedStyle(el);
    const top = parseFloat(style.paddingTop) || 0;
    const k = TAIL / (1 - TAIL);
    // the tail's reach, then room for the last line to breathe above its spikes (BREATH). At its
    // longest (a short window, large
    // text) the contents give up height to the tail, so the room is the one that fits that length
    // (solved, not reached by measuring back and forth)
    const max = parseFloat(style.maxHeight);
    const natural = Math.ceil((top + inner.offsetHeight) * k) + BREATH;
    const capped = Number.isFinite(max) && top + inner.offsetHeight + natural >= max - 1;
    const room = capped ? Math.ceil((k * max + BREATH) / (1 + k)) : natural;
    // set on the next frame, not while the browser is still measuring: at its longest the ribbon's
    // contents resize with it, and changing them mid-measure is a loop; then the room under the ribbon
    // may have moved too
    requestAnimationFrame(() => {
      if (Math.abs(room - (parseFloat(el.style.paddingBottom) || 0)) > 1) el.style.paddingBottom = `${room}px`;
      choose();
    });
  };
  const back = h('button', { class: 'banner-back', attrs: { type: 'button', 'aria-label': copy.common.back }, onclick: onBack },
    h('span', { class: 'banner-back-seal', html: SEAL, attrs: { 'aria-hidden': 'true' } }),
    h('img', { class: 'banner-back-art', attrs: { src: backArt, alt: '', draggable: 'false' } }));
  const slot = h('div', { class: 'banner-back-slot' }, back);
  const col = h('div', { class: 'banner-col' }, el, slot);
  // One Back on the page: the big one under the tail when there's room for it (banner.css
  // .back-below hides the small one on the ribbon), else the small one. The room is judged as if the
  // small one were gone (its row given back), with a margin each way, so the choice never flips to
  // and fro as the ribbon changes length. Checked when the ribbon's length is set (fit) and when the
  // column changes (the window); never by watching the slot, which fit itself resizes.
  const top = header.querySelector<HTMLElement>(':scope > .icon-btn');
  let below = false;
  const choose = () => {
    const row = below || !top ? 0 : top.offsetHeight + (parseFloat(getComputedStyle(header).rowGap) || 0);
    const room = slot.clientHeight + row;
    const next = below ? room >= BACK_ROOM - 20 : room >= BACK_ROOM + 20;
    if (next !== below) {
      below = next;
      col.classList.toggle('back-below', below);
    }
  };
  new ResizeObserver(fit).observe(inner);
  new ResizeObserver(() => requestAnimationFrame(choose)).observe(col);
  return col;
}

/** The height under the tail the big Back needs (its seal, clear of the screen's edge). */
const BACK_ROOM = 130;

/**
 * Behind the Back: the seal and diamond rails (docs/DESIGN_SYSTEM.md, background ornaments). A seal
 * of two thin rings with a band of short rune ticks between them (the arrowhead is its crest), and
 * on each side a nested diamond, then a broken rail out to a small dot. Hairlines in the page's
 * ink (banner.css makes it faint), on a 260 × 130 box centred on the arrowhead.
 */
const SEAL = (() => {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const [r1, r2] = i % 2 ? [56.5, 59] : [55.5, 60];
    return `M${(130 + Math.cos(a) * r1).toFixed(1)} ${(65 + Math.sin(a) * r1).toFixed(1)}L${(130 + Math.cos(a) * r2).toFixed(1)} ${(65 + Math.sin(a) * r2).toFixed(1)}`;
  }).join('');
  // one side's rail, drawn to the right and mirrored for the left
  const rail = 'M194 65l8-8 8 8-8 8z M198 65l4-4 4 4-4 4z M214 65h12 M230 65h13 M247 65h5';
  return `<svg viewBox="0 0 260 130" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="130" cy="65" r="62"/><circle cx="130" cy="65" r="53"/><path d="${ticks}"/><path d="${rail}"/><path d="${rail}" transform="matrix(-1 0 0 1 260 0)"/><circle cx="256" cy="65" r="2" fill="currentColor" stroke="none"/><circle cx="4" cy="65" r="2" fill="currentColor" stroke="none"/></svg>`;
})();
