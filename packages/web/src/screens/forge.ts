import { avatarSvg, partSvg } from '../avatar.ts';
import {
  SLOTS,
  equipPart,
  forgePart,
  loadForge,
  refineComponents,
  swapComponents,
  type Forge,
  type Part,
} from '../backend/forge.ts';
import { loadStandings, type Standing } from '../backend/affinity.ts';
import { ICONS } from '../icons.ts';
import { ELEMENTS, RARITIES, type Element, type Rarity } from '../profile.ts';
import { componentName, partName } from '../reward.ts';
import { closeButton, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge (docs/PROGRESSION_DESIGN.md §12.2): your avatar and balances, the season's
 * parts by slot (wearing, owned, ready to forge, or what's still missing), and your
 * materials with Refine and Swap. A part opens a sheet with its recipe and the one
 * action that fits. Everything is spent on the server (backend/forge.ts).
 */

const REFINE_COST: Partial<Record<Rarity, number>> = { scrap: 50, forged: 150, tempered: 500, runed: 1500 };
const SWAP_COST: Record<Rarity, number> = { scrap: 20, forged: 40, tempered: 80, runed: 160, starforged: 320 };
const next = (r: Rarity): Rarity => RARITIES[RARITIES.indexOf(r) + 1];

type State = 'wearing' | 'owned' | 'ready' | 'needs' | 'starter';

function stateOf(f: Forge, p: Part): State {
  if (f.loadout[p.slot] === p.id) return 'wearing';
  if (f.owned.has(p.id)) return 'owned';
  if (!p.recipe) return 'starter';
  return affordable(f, p) ? 'ready' : 'needs';
}

function affordable(f: Forge, p: Part): boolean {
  if (!p.recipe) return false;
  const have = f.components[p.element];
  return (
    Object.entries(p.recipe.components).every(([r, n]) => have[r as Rarity] >= (n ?? 0)) &&
    f.stardust >= p.recipe.stardust &&
    f.crowns >= p.recipe.crowns
  );
}

const pips = (rarity: Rarity) => h('span', { class: `pips rarity-${rarity}`, attrs: { 'aria-hidden': 'true' } }, ...Array.from({ length: RARITIES.indexOf(rarity) + 1 }, () => h('i')));

export function forgeScreen(): Screen {
  const body = h('div', { class: 'forge-body' }, h('p', { class: 'forge-status', text: copy.forge.loading }));
  const el = subPage({ className: 'forge', title: copy.forge.title, onBack: () => void goBack(homeScreen) }, body);
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
    const head = h(
      'section',
      { class: 'forge-head' },
      h('span', { class: 'forge-avatar', html: avatarSvg(f.loadout) }),
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
      return h(
        'section',
        { class: 'forge-group' },
        h('h2', { text: copy.forge.slots[slot] }),
        h('div', { class: 'part-grid' }, ...parts.map((p) => partCard(f, p))),
      );
    });

    body.replaceChildren(
      head,
      h('h2', { class: 'forge-heading', text: copy.forge.parts }),
      ...groups,
      h('h2', { class: 'forge-heading', text: copy.forge.materialsTitle }),
      materials(f),
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

  function partCard(f: Forge, p: Part): HTMLElement {
    const state = stateOf(f, p);
    const label =
      state === 'wearing' ? copy.forge.wearing
      : state === 'owned' ? copy.forge.owned
      : state === 'ready' ? copy.forge.ready
      : state === 'starter' ? copy.forge.withAffinity
      : copy.forge.needsMore;
    const name = partName(p.id);
    return h(
      'button',
      {
        class: `part-card state-${state}`,
        attrs: { type: 'button', 'aria-label': `${name}, ${copy.forge.rarities[p.rarity]}, ${copy.forge.elements[p.element]}. ${label}.` },
        onclick: () => openPart(p),
      },
      h('span', { class: 'part-art', html: partSvg(p.id), attrs: { 'aria-hidden': 'true' } }),
      h('strong', { class: 'part-name', text: name, attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'part-rarity', attrs: { 'aria-hidden': 'true' } }, pips(p.rarity), copy.forge.rarities[p.rarity]),
      h('span', { class: 'part-state', text: label, attrs: { 'aria-hidden': 'true' } }),
    );
  }

  function openPart(p: Part) {
    const f = forge!;
    const state = stateOf(f, p);
    const name = partName(p.id);
    const edition = f.owned.get(p.id)?.edition;
    const rows: HTMLElement[] = [];
    if (p.recipe && state !== 'owned' && state !== 'wearing') {
      rows.push(h('h3', { text: copy.forge.recipe }));
      for (const [r, n] of Object.entries(p.recipe.components) as [Rarity, number][]) {
        rows.push(recipeRow(componentName(r, p.element), f.components[p.element][r], n));
      }
      rows.push(recipeRow(copy.common.stardust, f.stardust, p.recipe.stardust));
      if (p.recipe.crowns) rows.push(recipeRow(copy.common.crowns, f.crowns, p.recipe.crowns));
    }
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
    if (state === 'ready') {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.forge });
      btn.addEventListener('click', () => busy(btn, () => forgePart(p.id), copy.forge.forged(name)));
      action = btn;
    } else if (state === 'needs') {
      action = h('button', { class: 'btn btn-primary', text: copy.forge.forge, attrs: { disabled: '' } });
    } else if (state === 'owned') {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.wear });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, p.id), null));
      action = btn;
    } else if (state === 'wearing') {
      const btn = h('button', { class: 'btn', text: copy.forge.takeOff });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, null), null));
      action = btn;
    }
    const close = openModal(
      h(
        'div',
        { class: 'sheet part-sheet' },
        closeButton(() => close()),
        h('span', { class: 'part-sheet-art', html: partSvg(p.id), attrs: { 'aria-hidden': 'true' } }),
        h('h2', { text: name }),
        h(
          'p',
          { class: 'part-sheet-meta' },
          pips(p.rarity),
          `${copy.forge.rarities[p.rarity]} · ${copy.forge.elements[p.element]} · ${copy.forge.slots[p.slot]}`,
          edition ? ` · ${copy.forge.edition(edition)}` : '',
        ),
        state === 'starter' ? h('p', { class: 'note', text: copy.forge.withAffinity }) : null,
        rows.length ? h('div', { class: 'recipe' }, ...rows) : null,
        action,
      ),
    );
  }

  function recipeRow(label: string, have: number, need: number): HTMLElement {
    return h(
      'p',
      { class: `recipe-row ${have >= need ? 'enough' : 'short'}` },
      h('span', { text: label }),
      h('strong', { text: copy.forge.have(have, need) }),
    );
  }

  function materials(f: Forge): HTMLElement {
    const table = h(
      'table',
      { class: 'materials' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { attrs: { scope: 'col' } }, h('span', { class: 'sr-only', text: copy.forge.element })),
          ...RARITIES.map((r) => h('th', { attrs: { scope: 'col' } }, pips(r), h('span', { class: 'materials-tier', text: copy.forge.rarities[r] }))),
        ),
      ),
      h(
        'tbody',
        {},
        ...ELEMENTS.map((e) =>
          h(
            'tr',
            {},
            h('th', { attrs: { scope: 'row' } }, h('span', { class: 'drop-element', html: ICONS.elements[e], attrs: { 'aria-hidden': 'true' } }), copy.forge.materials[e]),
            ...RARITIES.map((r) => {
              const n = f.components[e][r];
              return h('td', { class: n ? '' : 'none', attrs: { 'aria-label': copy.forge.a11yCount(componentName(r, e), n) } }, String(n));
            }),
          ),
        ),
      ),
    );
    return h(
      'section',
      { class: 'forge-materials' },
      table,
      h(
        'div',
        { class: 'materials-actions' },
        h('button', { class: 'btn', text: copy.forge.refine, onclick: () => openRefine() }),
        h('button', { class: 'btn', text: copy.forge.swap, onclick: () => openSwap() }),
      ),
    );
  }

  const select = (label: string, options: [string, string][], value: string) => {
    const s = h('select', {}, ...options.map(([v, t]) => h('option', { text: t, attrs: { value: v } })));
    s.value = value;
    return { field: h('label', { class: 'forge-field' }, h('span', { text: label }), s), input: s };
  };
  const elementOptions = ELEMENTS.map((e) => [e, copy.forge.materials[e]] as [string, string]);

  function openRefine() {
    const f = forge!;
    const tier = select(copy.forge.tier, RARITIES.slice(0, 4).map((r) => [r, copy.forge.rarities[r]]), 'scrap');
    const element = select(copy.forge.element, elementOptions, f.affinity ?? 'fire');
    const cost = h('p', { class: 'note' });
    const btn = h('button', { class: 'btn btn-primary', text: copy.forge.refine });
    const update = () => {
      const r = tier.input.value as Rarity;
      const e = element.input.value as Element;
      cost.textContent = copy.forge.refineCost(REFINE_COST[r]!, componentName(next(r), e));
      btn.disabled = f.components[e][r] < 5 || f.stardust < REFINE_COST[r]!;
    };
    tier.input.addEventListener('change', update);
    element.input.addEventListener('change', update);
    update();
    btn.addEventListener('click', () => {
      btn.disabled = true;
      const r = tier.input.value as Rarity;
      const e = element.input.value as Element;
      void refineComponents(e, r).then(async (err) => {
        close();
        toast(err ?? copy.forge.refined(componentName(next(r), e)));
        await refresh();
      });
    });
    const close = openModal(
      h('div', { class: 'sheet' }, closeButton(() => close()), h('h2', { text: copy.forge.refine }), h('p', { class: 'note', text: copy.forge.refineHint }), element.field, tier.field, cost, btn),
    );
  }

  function openSwap() {
    const f = forge!;
    const from = select(copy.forge.from, elementOptions, 'fire');
    const to = select(copy.forge.to, elementOptions, f.affinity ?? 'water');
    const tier = select(copy.forge.tier, RARITIES.map((r) => [r, copy.forge.rarities[r]]), 'scrap');
    const cost = h('p', { class: 'note' });
    const btn = h('button', { class: 'btn btn-primary', text: copy.forge.swap });
    const update = () => {
      const r = tier.input.value as Rarity;
      const a = from.input.value as Element;
      const b = to.input.value as Element;
      cost.textContent = copy.forge.swapCost(SWAP_COST[r], componentName(r, b));
      btn.disabled = a === b || f.components[a][r] < 3 || f.stardust < SWAP_COST[r];
    };
    for (const s of [from.input, to.input, tier.input]) s.addEventListener('change', update);
    update();
    btn.addEventListener('click', () => {
      btn.disabled = true;
      const r = tier.input.value as Rarity;
      const b = to.input.value as Element;
      void swapComponents(from.input.value as Element, b, r).then(async (err) => {
        close();
        toast(err ?? copy.forge.swapped(componentName(r, b)));
        await refresh();
      });
    });
    const close = openModal(
      h('div', { class: 'sheet' }, closeButton(() => close()), h('h2', { text: copy.forge.swap }), h('p', { class: 'note', text: copy.forge.swapHint }), from.field, to.field, tier.field, cost, btn),
    );
  }

  function openOdds() {
    const BASE: [Rarity, string][] = [['scrap', '62%'], ['forged', '25%'], ['tempered', '9.5%'], ['runed', '3%'], ['starforged', '0.5%']];
    const section = (title: string, ...lines: string[]) => h('section', { class: 'odds-section' }, h('h3', { text: title }), ...lines.map((t) => h('p', { text: t })));
    const close = openModal(
      h(
        'div',
        { class: 'sheet odds-sheet' },
        closeButton(() => close()),
        h('h2', { text: copy.forge.oddsTitle }),
        h('p', { class: 'note', text: copy.forge.oddsIntro }),
        h(
          'table',
          { class: 'odds' },
          h('tbody', {}, ...BASE.map(([r, p]) => h('tr', {}, h('th', { attrs: { scope: 'row' } }, pips(r), copy.forge.rarities[r]), h('td', { text: p })))),
        ),
        section(copy.forge.oddsLuckTitle, copy.forge.oddsLuck),
        section(copy.forge.oddsPityTitle, ...copy.forge.oddsPity),
        section(copy.forge.oddsPaceTitle, copy.forge.oddsPace),
        section(copy.forge.oddsPartsTitle, copy.forge.oddsParts),
        section(copy.forge.oddsCrownTitle, copy.forge.oddsCrown),
      ),
    );
  }

  void refresh();
  return { el, title: copy.forge.title };
}
