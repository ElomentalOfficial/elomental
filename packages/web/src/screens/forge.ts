import { avatarSvg, partSvg } from '../avatar.ts';
import { loadStandings, type Standing } from '../backend/affinity.ts';
import { FORGE_COST, MAX_PLATE, MAX_POLISH, PLATE_COST, POLISH_COST, SLOTS, buyPlate, equipPart, forgePart, loadForge, needsCrown, polishPart, type Forge, type Part } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { paintPlate } from '../plates.ts';
import { ELEMENTS, RARITIES, loadProfile, type Element, type Rarity } from '../profile.ts';
import { partName, rarityName } from '../reward.ts';
import { closeButton, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge (docs/PROGRESSION_DESIGN.md, revised): your avatar, your Stardust and Crowns,
 * and the season's parts by slot: wearing, owned, ready to forge, or not yet affordable.
 * A part opens a sheet with its price and the one action that fits. Parts arrive every
 * 3rd solved square; Stardust forges any that are missing. Spent on the server.
 */

type State = 'wearing' | 'owned' | 'ready' | 'needs' | 'starter';

function stateOf(f: Forge, p: Part): State {
  if (f.loadout[p.slot] === p.id) return 'wearing';
  if (f.owned.has(p.id)) return 'owned';
  if (p.source !== 'craft') return 'starter';
  return f.stardust >= FORGE_COST[p.rarity] && (!needsCrown(p.rarity) || f.crowns >= 1) ? 'ready' : 'needs';
}

const price = (r: Rarity) => (needsCrown(r) ? copy.forge.priceCrown(FORGE_COST[r]) : copy.forge.price(FORGE_COST[r]));
const rarityTag = (r: Rarity) => h('span', { class: `rarity-tag rarity-${r}`, text: rarityName(r) });

export function forgeScreen(back: () => Screen = homeScreen): Screen {
  const body = h('div', { class: 'forge-body' }, h('p', { class: 'forge-status', text: copy.forge.loading }));
  const el = subPage({ className: 'forge', title: copy.forge.title, onBack: () => void goBack(back) }, body);
  let forge: Forge | null = null;
  let standings: Standing[] | null = null;

  const refresh = async () => {
    [forge, standings] = await Promise.all([loadForge(), loadStandings()]);
    render();
  };

  function render() {
    if (!forge) {
      body.replaceChildren(h('p', { class: 'forge-status', text: copy.forge.offline }));
      return;
    }
    const f = forge;
    const craftable = f.parts.filter((p) => p.source === 'craft');
    const head = h(
      'section',
      { class: 'forge-head' },
      h('span', { class: 'forge-avatar', html: avatarSvg(f.loadout, f.polish) }),
      h(
        'div',
        { class: 'forge-balances' },
        h('p', { class: 'forge-intro', text: copy.forge.intro }),
        h('button', { class: 'link-btn', text: copy.forge.oddsButton, attrs: { type: 'button' }, onclick: () => openOdds() }),
        f.affinity ? affinityLine(f.affinity) : null,
        h('span', { class: 'balance' }, h('span', { html: ICONS.dust, attrs: { 'aria-hidden': 'true' } }), h('strong', { text: String(f.stardust) }), h('span', { text: copy.common.stardust })),
        h('span', { class: 'balance' }, h('span', { html: ICONS.crown, attrs: { 'aria-hidden': 'true' } }), h('strong', { text: String(f.crowns) }), h('span', { text: copy.common.crowns })),
      ),
    );
    const groups = SLOTS.map((slot) => {
      const parts = f.parts
        .filter((p) => p.slot === slot)
        .sort((a, b) => ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
      return h('section', { class: 'forge-group' }, h('h2', { text: copy.forge.slots[slot] }), h('div', { class: 'part-grid' }, ...parts.map((p) => partCard(f, p))));
    });
    body.replaceChildren(
      head,
      platesSection(f),
      h(
        'div',
        { class: 'forge-heading-row' },
        h('h2', { class: 'forge-heading', text: copy.forge.parts }),
        h('span', { class: 'forge-count', text: copy.forge.collected(craftable.filter((p) => f.owned.has(p.id)).length, craftable.length) }),
      ),
      ...groups,
    );
  }

  /** Your side and where it stands this month. */
  function affinityLine(e: Element): HTMLElement {
    const place = (standings?.findIndex((s) => s.affinity === e) ?? -1) + 1;
    const name = copy.forge.elements[e];
    return h(
      'p',
      { class: 'forge-affinity' },
      h('span', { class: 'drop-element', html: ICONS.elements[e], attrs: { 'aria-hidden': 'true' } }),
      h('span', { text: place ? copy.affinity.yours(name, copy.affinity.place(place)) : name }),
    );
  }

  function stateLabel(state: State): string {
    return state === 'wearing' ? copy.forge.wearing
      : state === 'owned' ? copy.forge.owned
      : state === 'ready' ? copy.forge.ready
      : state === 'starter' ? copy.forge.withAffinity
      : copy.forge.needsMore;
  }

  function partCard(f: Forge, p: Part): HTMLElement {
    const state = stateOf(f, p);
    const name = partName(p.id);
    return h(
      'button',
      {
        class: `part-card rarity-${p.rarity} state-${state}`,
        attrs: { type: 'button', 'aria-label': `${name}, ${rarityName(p.rarity)}, ${copy.forge.elements[p.element]}. ${stateLabel(state)}.` },
        onclick: () => openPart(p),
      },
      h('span', { class: 'part-art', html: partSvg(p.id, f.owned.get(p.id)?.polish ?? 0), attrs: { 'aria-hidden': 'true' } }),
      h('strong', { class: 'part-name', text: name, attrs: { 'aria-hidden': 'true' } }),
      h('span', { attrs: { 'aria-hidden': 'true' } }, rarityTag(p.rarity)),
      h('span', { class: 'part-state', text: stateLabel(state), attrs: { 'aria-hidden': 'true' } }),
    );
  }

  function openPart(p: Part) {
    const f = forge!;
    const state = stateOf(f, p);
    const name = partName(p.id);
    const edition = f.owned.get(p.id)?.edition;
    const polish = f.owned.get(p.id)?.polish ?? 0;
    let action: HTMLElement | null = null;
    const busy = (btn: HTMLButtonElement, work: () => Promise<string | null>, done: string | null) => {
      btn.disabled = true;
      void work().then(async (err) => {
        close();
        if (err) toast(err);
        else if (done) toast(done);
        await refresh();
      });
    };
    if (state === 'ready' || state === 'needs') {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.forge });
      if (state === 'needs') btn.disabled = true;
      else btn.addEventListener('click', () => busy(btn, () => forgePart(p.id), copy.forge.forged(name)));
      action = btn;
    } else if (state === 'owned') {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.wear });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, p.id), null));
      action = btn;
    } else if (state === 'wearing') {
      const btn = h('button', { class: 'btn', text: copy.forge.takeOff });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, null), null));
      action = btn;
    }
    let polishBtn: HTMLElement | null = null;
    if (state === 'owned' || state === 'wearing') {
      if (polish >= MAX_POLISH) polishBtn = h('p', { class: 'note', text: copy.forge.fullyPolished });
      else {
        const cost = POLISH_COST[polish];
        const btn = h('button', { class: 'btn', text: copy.forge.polishTo(polish + 1, cost) });
        if (f.stardust < cost) btn.disabled = true;
        else btn.addEventListener('click', () => busy(btn, () => polishPart(p.id), copy.forge.polished(name, polish + 1)));
        polishBtn = btn;
      }
    }
    const close = openModal(
      h(
        'div',
        { class: 'sheet part-sheet' },
        closeButton(() => close()),
        h('span', { class: 'part-sheet-art', html: partSvg(p.id, polish), attrs: { 'aria-hidden': 'true' } }),
        h('h2', { text: name }),
        h('p', { class: 'part-sheet-meta' }, rarityTag(p.rarity), `${copy.forge.elements[p.element]} · ${copy.forge.slots[p.slot]}`, edition ? ` · ${copy.forge.edition(edition)}` : '', polish ? ` · ${copy.forge.polishLevel(polish)}` : ''),
        state === 'starter' ? h('p', { class: 'note', text: copy.forge.withAffinity }) : null,
        state === 'ready' || state === 'needs' ? h('p', { class: 'part-price', text: price(p.rarity) }) : null,
        action,
        polishBtn,
      ),
    );
  }

  /**
   * The four name plates, right under the head: each drawn on its card, bought in order,
   * each replacing the last. Only the next one is a button; it opens a sheet to confirm.
   */
  function platesSection(f: Forge): HTMLElement {
    const t = copy.forge;
    const card = (n: number) => {
      const next = n === f.plate + 1;
      const state = n === f.plate ? 'yours' : n < f.plate ? 'replaced' : next ? (f.stardust >= PLATE_COST[n - 1] ? 'ready' : 'needs') : 'later';
      const label = state === 'yours' ? t.plateYours
        : state === 'replaced' ? t.plateReplaced
        : state === 'ready' ? t.ready
        : state === 'needs' ? t.plateNeeds
        : t.plateAfter(t.plates[n - 1]);
      const price = state === 'yours' || state === 'replaced' ? null : t.price(PLATE_COST[n - 1]);
      const sample = h('span', { class: 'plate-sample' });
      paintPlate(sample, t.plates[n], n);
      const kids = [
        sample,
        h('span', { class: 'part-state', text: label }),
        price ? h('span', { class: 'plate-price', text: price }) : null,
      ];
      const cls = `plate-card plate-card-${n} state-${state}`;
      const a11y = `${t.plateA11y(t.plates[n])}. ${label}.${price ? ` ${price}.` : ''}`;
      if (!next) return h('div', { class: cls, attrs: { role: 'group', 'aria-label': a11y } }, ...kids.map((k) => k && (k.setAttribute('aria-hidden', 'true'), k)));
      return h('button', { class: cls, attrs: { type: 'button', 'aria-label': a11y }, onclick: () => openPlate(n) }, ...kids.map((k) => k && (k.setAttribute('aria-hidden', 'true'), k)));
    };
    return h(
      'section',
      { class: 'forge-plates' },
      h('div', { class: 'forge-heading-row' }, h('h2', { class: 'forge-heading', text: t.plateTitle }), h('span', { class: 'forge-count', text: t.plateCount(f.plate, MAX_PLATE) })),
      h('p', { class: 'forge-intro', text: t.plateIntro }),
      h('div', { class: 'plate-grid' }, ...[1, 2, 3, 4].map(card)),
    );
  }

  /** The next plate: your own name on it, its price, and Get. */
  function openPlate(n: number) {
    const f = forge!;
    const cost = PLATE_COST[n - 1];
    const name = copy.forge.plates[n];
    const preview = h('span', { class: 'plate-sample plate-preview' });
    paintPlate(preview, loadProfile().name, n);
    const btn = h('button', { class: 'btn btn-primary', text: copy.forge.plateBuy(name, cost) });
    if (f.stardust < cost) btn.disabled = true;
    else btn.addEventListener('click', () => {
      btn.disabled = true;
      void buyPlate().then(async (err) => {
        close();
        toast(err ?? copy.forge.plateBought(name));
        await refresh();
      });
    });
    const close = openModal(
      h(
        'div',
        { class: 'sheet plate-sheet' },
        closeButton(() => close()),
        h('h2', { text: copy.forge.plateA11y(name) }),
        preview,
        h('p', { class: 'note', text: f.stardust < cost ? copy.forge.needsMore : copy.forge.plateReplaces }),
        btn,
      ),
    );
  }
  function openOdds() {
    const ODDS: [Rarity, string][] = [['common', '62%'], ['rare', '28%'], ['epic', '8%'], ['mythic', '2%']];
    const section = (title: string, ...lines: string[]) => h('section', { class: 'odds-section' }, h('h3', { text: title }), ...lines.map((t) => h('p', { text: t })));
    const close = openModal(
      h(
        'div',
        { class: 'sheet odds-sheet' },
        closeButton(() => close()),
        h('h2', { text: copy.forge.oddsTitle }),
        h('p', { class: 'note', text: copy.forge.oddsIntro }),
        h('table', { class: 'odds' }, h('tbody', {}, ...ODDS.map(([r, pct]) => h('tr', {}, h('th', { attrs: { scope: 'row' } }, rarityTag(r)), h('td', { text: pct }))))),
        section(copy.forge.oddsPityTitle, ...copy.forge.oddsPity),
        section(copy.forge.oddsDupeTitle, copy.forge.oddsDupe),
        section(copy.forge.oddsForgeTitle, copy.forge.oddsForge),
        section(copy.forge.oddsPaceTitle, copy.forge.oddsPace),
        section(copy.forge.oddsCrownTitle, copy.forge.oddsCrown),
        section(copy.forge.oddsSpendTitle, ...copy.forge.oddsSpend),
      ),
    );
  }

  void refresh();
  return { el, title: copy.forge.title };
}
