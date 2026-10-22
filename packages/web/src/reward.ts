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

/** "s0-avatar-calm" → "Calm"; "s0-frame-fire-2" → "Ember Frame II". */
export function partName(id: string): string {
  const [, slot, element, n] = id.split('-') as [string, keyof typeof copy.forge.slots, string, string?];
  if (slot === 'avatar') return copy.forge.avatars[element] ?? element;
  return copy.forge.part(copy.forge.names[element as Element], copy.forge.slots[slot], Number(n ?? 1));
}

/** The element of a part, from its id (frames have one; avatars don't). */
export const partElement = (id: string): Element | null => (id.split('-')[1] === 'frame' ? (id.split('-')[2] as Element) : null);

export const rarityName = (r: Rarity): string => copy.forge.rarities[r];

/**
 * onOpenForge: where the link under the part goes (the result passes the Forge). `compact`:
 * a small row (another moment holds the result), the whole row the way into the Forge.
 */
export function dropReveal(drop: Drop, onOpenForge?: () => void, compact = false): HTMLElement {
  const name = partName(drop.part);
  const element = partElement(drop.part);
  const gift = !!drop.gift && !!element && !drop.duplicate;
  // a drop is a blueprint (blueprints); older results were whole parts
  const blueprint = !!drop.blueprint && !drop.duplicate;
  const label = gift ? copy.forge.a11yGift(name, rarityName(drop.rarity), copy.forge.elements[element!])
    : blueprint ? copy.forge.a11yBlueprint(name, rarityName(drop.rarity))
    : copy.forge.a11yDrop(name, rarityName(drop.rarity));
  const card = h(
    'button',
    { class: `part-reveal rarity-${drop.rarity}${blueprint ? ' is-blueprint' : ''}${compact ? ' compact' : ''}`, attrs: { type: 'button', 'aria-label': label } },
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
        element ? h('span', { class: 'drop-element', html: ICONS.elements[element] }) : null,
        // another faction's frame reads as a gift: "A gift from Fire"; otherwise "New part · Air"
        h('span', { text: gift
          ? copy.forge.gift(copy.forge.elements[element!])
          : [drop.duplicate ? null : blueprint ? copy.forge.blueprint : copy.forge.newPart, element ? copy.forge.elements[element] : copy.forge.slots.avatar].filter(Boolean).join(' · ') }),
      ),
    ),
  );
  if (compact) {
    if (onOpenForge) card.addEventListener('click', onOpenForge);
    return h('div', { class: 'drop' }, card, drop.duplicate ? h('p', { class: 'drop-note', text: copy.forge.duplicate(drop.stardust) }) : null);
  }
  // A tap skips the reveal to its end state.
  card.addEventListener('click', () => {
    for (const el of [card, ...card.querySelectorAll('*')]) {
      for (const a of el.getAnimations()) if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
    }
  });

  const notes: HTMLElement[] = [];
  // what forging the blueprint costs, then the way into the Forge, right where it matters
  if (blueprint && drop.forge != null) notes.push(h('p', { class: 'drop-note', text: copy.forge.blueprintNote(drop.forge) }));
  if (onOpenForge) notes.push(h('button', { class: 'link-btn drop-forge', text: copy.forge.openForge, attrs: { type: 'button' }, onclick: onOpenForge }));
  if (drop.duplicate) notes.push(h('p', { class: 'drop-note', text: copy.forge.duplicate(drop.stardust) }));
  if (drop.pity) notes.push(h('p', { class: 'drop-note good', text: copy.forge.pityHit(rarityName(drop.pity)) }));
  // (the "Epic within N" guarantee lives on the Forge now: the result keeps only what explains
  // this drop)
  return h('div', { class: 'drop' }, card, ...notes);
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
