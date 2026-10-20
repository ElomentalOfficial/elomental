import { partSvg } from './avatar.ts';
import { ICONS } from './icons.ts';
import type { Drop, Element, Rarity } from './profile.ts';
import { h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Parts on the result pop-up (docs/PROGRESSION_DESIGN.md, revised): every 3rd rated solve
 * brings one whole avatar part. Its card turns over in its rarity's colour; Epic glows and
 * Mythic flares, the rarer the longer. A tap skips to the end. In between, a three-step
 * counter shows how close the next part is. Rarity is always written; screen readers
 * get one literal line. Still with Reduce motion (styles.css `.part-reveal`).
 */

/** "s0-sigil-fire-2" → "Ember Sigil II". */
export function partName(id: string): string {
  const [, slot, element, n] = id.split('-') as [string, keyof typeof copy.forge.slots, Element, string?];
  return copy.forge.part(copy.forge.names[element], copy.forge.slots[slot], Number(n ?? 1));
}

/** The element of a part, from its id. */
export const partElement = (id: string): Element => id.split('-')[2] as Element;

export const rarityName = (r: Rarity): string => copy.forge.rarities[r];

/** onOpenForge: where the link under the part goes (the result passes the Forge). */
export function dropReveal(drop: Drop, onOpenForge?: () => void): HTMLElement {
  const name = partName(drop.part);
  const element = partElement(drop.part);
  const card = h(
    'button',
    { class: `part-reveal rarity-${drop.rarity}`, attrs: { type: 'button', 'aria-label': copy.forge.a11yDrop(name, rarityName(drop.rarity)) } },
    h('span', { class: 'reveal-flare', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'reveal-art', html: partSvg(drop.part), attrs: { 'aria-hidden': 'true' } }),
    h(
      'span',
      { class: 'reveal-text', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'reveal-rarity', text: rarityName(drop.rarity) }),
      h('strong', { class: 'reveal-name', text: name }),
      h(
        'span',
        { class: 'reveal-meta' },
        h('span', { class: 'drop-element', html: ICONS.elements[element] }),
        h('span', { text: drop.duplicate ? copy.forge.elements[element] : `${copy.forge.newPart} · ${copy.forge.elements[element]}` }),
      ),
    ),
  );
  // A tap skips the reveal to its end state.
  card.addEventListener('click', () => {
    for (const el of [card, ...card.querySelectorAll('*')]) {
      for (const a of el.getAnimations()) if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
    }
  });

  const notes: HTMLElement[] = [];
  // the way into the Forge, right where the player cares about parts
  if (onOpenForge) notes.push(h('button', { class: 'link-btn drop-forge', text: copy.forge.openForge, attrs: { type: 'button' }, onclick: onOpenForge }));
  if (drop.duplicate) notes.push(h('p', { class: 'drop-note', text: copy.forge.duplicate(drop.stardust) }));
  if (drop.pity) notes.push(h('p', { class: 'drop-note good', text: copy.forge.pityHit(rarityName(drop.pity)) }));
  // the nearest guarantee, only once it's close (3 parts or fewer)
  const g = drop.guarantee;
  if (g.mythic <= 3) notes.push(h('p', { class: 'drop-pity', text: copy.forge.guarantee(rarityName('mythic'), g.mythic) }));
  else if (g.epic <= 3) notes.push(h('p', { class: 'drop-pity', text: copy.forge.guarantee(rarityName('epic'), g.epic) }));
  return h('div', { class: 'drop' }, card, ...notes);
}

/** Toward the next part: three steps, filled as squares are solved. */
export function progressLine(progress: { count: number; every: number }): HTMLElement {
  const text = progress.count === 0 ? copy.forge.progressDone : copy.forge.progress(progress.count, progress.every);
  return h(
    'p',
    { class: 'part-progress' },
    h('span', { class: 'part-steps', attrs: { 'aria-hidden': 'true' } }, ...Array.from({ length: progress.every }, (_, i) => h('i', { class: i < progress.count ? 'done' : '' }))),
    h('span', { text }),
  );
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
