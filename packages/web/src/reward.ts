import { ICONS } from './icons.ts';
import { RARITIES, type Drop, type Element, type Rarity } from './profile.ts';
import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * The drop on the result pop-up (docs/PROGRESSION_DESIGN.md §12.1): an ingot that comes
 * out of the forge glowing and cools into its rarity's colour. The rarer the drop, the
 * longer the moment: Scrap cools at once, Tempered hisses, Runed lights its pips one by
 * one, Starforged flares the card. A tap skips straight to the end. The rarity is
 * always written and shown by its pips, never by colour alone; screen readers get one
 * literal line. Still with Reduce motion (styles.css `.drop-card`).
 */

export const componentName = (rarity: Rarity, element: Element): string =>
  copy.forge.component(copy.forge.rarities[rarity], copy.forge.materials[element]);

/** "s0-sigil-fire-2" → "Ember Sigil II". */
export function partName(id: string): string {
  const [, slot, element, variant] = id.split('-') as [string, keyof typeof copy.forge.slots, Element, string?];
  return copy.forge.part(copy.forge.materials[element], copy.forge.slots[slot], variant === '2');
}

/** The ingot: a bar with as many pips as the rarity's rank (1 Scrap … 5 Starforged). */
export function ingot(rarity: Rarity): string {
  const pips = RARITIES.indexOf(rarity) + 1;
  const dots = Array.from({ length: pips }, (_, i) => {
    const x = 40 + (i - (pips - 1) / 2) * 9;
    return rarity === 'starforged'
      ? `<path class="pip" style="--i:${i}" d="M${x} 25.5l1.4 3 3.2.4-2.4 2.2.7 3.2-2.9-1.6-2.9 1.6.7-3.2-2.4-2.2 3.2-.4Z"/>`
      : `<circle class="pip" style="--i:${i}" cx="${x}" cy="30" r="2.6"/>`;
  }).join('');
  return `<svg class="ingot" viewBox="0 0 80 48" aria-hidden="true">
    <path class="ingot-body" d="M8 40 18 14h44l10 26Z"/>
    <path class="ingot-top" d="M18 14h44l-4 6H22Z"/>
    <g class="ingot-pips">${dots}</g>
  </svg>`;
}

export function dropReveal(drop: Drop): HTMLElement {
  const component = componentName(drop.rarity, drop.element);
  const title = drop.part && !drop.duplicate ? partName(drop.part) : component;
  const notes: HTMLElement[] = [];
  if (drop.part && !drop.duplicate) notes.push(h('p', { class: 'drop-note', text: copy.forge.partLabel }));
  if (drop.duplicate) notes.push(h('p', { class: 'drop-note', text: copy.forge.duplicate(drop.smelted, component) }));
  if (drop.upgraded) notes.push(h('p', { class: 'drop-note good', text: copy.forge.upgraded }));
  if (drop.pity) notes.push(h('p', { class: 'drop-note good', text: copy.forge.pityHit(copy.forge.rarities[drop.pity]) }));

  const card = h(
    'button',
    {
      class: `drop-card rarity-${drop.rarity}`,
      attrs: { type: 'button', 'aria-label': copy.forge.a11yDrop(title) },
    },
    h('span', { class: 'drop-flare', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'drop-art', html: ingot(drop.rarity), attrs: { 'aria-hidden': 'true' } }),
    h(
      'span',
      { class: 'drop-text', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'drop-label', text: copy.forge.dropLabel }),
      h('strong', { class: 'drop-name', text: title }),
      h(
        'span',
        { class: 'drop-meta' },
        h('span', { class: 'drop-element', html: ICONS.elements[drop.element] }),
        h('span', { text: `${copy.forge.rarities[drop.rarity]} · ${copy.forge.elements[drop.element]}` }),
      ),
    ),
  );
  // A tap skips the reveal to its end state.
  card.addEventListener('click', () => {
    for (const el of [card, ...card.querySelectorAll('*')]) {
      // (the Starforged glint loops forever: leave it running)
      for (const a of el.getAnimations()) if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
    }
  });

  // the nearest guarantee still ahead
  let pity: HTMLElement | null = null;
  if (drop.pityLeft) {
    const ahead = (['tempered', 'runed', 'starforged'] as const)
      .filter((r) => RARITIES.indexOf(r) > RARITIES.indexOf(drop.rarity))
      .map((r) => ({ r, n: drop.pityLeft![r] }))
      .sort((a, b) => a.n - b.n)[0];
    if (ahead) pity = h('p', { class: 'drop-pity', text: copy.forge.pityLeft(copy.forge.rarities[ahead.r], ahead.n) });
  }
  return h('div', { class: 'drop' }, card, ...notes, pity);
}

/** "+5 influence for Fire", with the element's mark. */
export function influenceLine(influence: { affinity: Element; amount: number }): HTMLElement {
  return h(
    'p',
    { class: 'influence-line' },
    h('span', { class: 'drop-element', html: ICONS.elements[influence.affinity], attrs: { 'aria-hidden': 'true' } }),
    h('span', { text: copy.forge.influence(influence.amount, copy.forge.elements[influence.affinity]) }),
  );
}
