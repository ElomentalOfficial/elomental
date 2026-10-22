import { h, type Banner } from './ui.ts';

/** How far the banner's notched tail cuts up into it, in px (banner.css clips the same). */
const TAIL = 56;

/**
 * A wide page's banner (ui.ts subPage): the cloth hangs from the top edge with a notched tail,
 * like the game screen's banner and the faction banner on the profile card. Back and the
 * title, then the art, the page's line and its foot. Two faint lines run inside its edge, the
 * outer one worn into uneven pieces as the tiles' frames are, drawn to the banner as laid out
 * so they follow the tail at any height.
 */
export function pageBanner(header: HTMLElement, banner: Banner): HTMLElement {
  const lines = h('span', { class: 'banner-lines', attrs: { 'aria-hidden': 'true' } });
  const el = h(
    'div',
    { class: 'page-banner' },
    lines,
    header,
    banner.help ? h('p', { class: 'banner-help', text: banner.help }) : null,
    h('div', { class: 'banner-art', attrs: { 'aria-hidden': 'true' } }, banner.art),
    banner.foot ? h('div', { class: 'banner-foot' }, banner.foot) : null,
  );
  const draw = () => {
    const w = el.offsetWidth;
    const ht = el.offsetHeight;
    if (!w || !ht) return;
    // each line follows the edge and the tail, `d` px in; the outer one in worn pieces
    const edge = (d: number) => `M${d} 0V${ht - d * 2.1}L${w / 2} ${ht - TAIL - d * 1.05}L${w - d} ${ht - d * 2.1}V0`;
    lines.innerHTML = `<svg width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
      <path d="${edge(12)}" class="banner-line" stroke-dasharray="72 3 26 2 110 4 44 2 90 3"/>
      <path d="${edge(22)}" class="banner-line inner"/></svg>`;
  };
  new ResizeObserver(draw).observe(el);
  return el;
}
