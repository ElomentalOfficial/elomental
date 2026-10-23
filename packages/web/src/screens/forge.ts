import { partSvg } from '../avatar.ts';
import { ALIVE_COST, BLUEPRINT_COST, DEFAULT_AVATAR, FORGE_COST, GILD_COST, MAX_MARKS, SLOTS, gildPart, marksOf, avatarsToWake, callSpirit, equipPart, forgePart, loadForge, polishPart, type Forge, type Part } from '../backend/forge.ts';
import forgeHero from '../art/screens/forge.svg';
import { ICONS } from '../icons.ts';
import { withRays } from '../rays.ts';
import { spinnable } from '../spin.ts';
import { ELEMENTS, RARITIES, loadProfile, type Element, type Rarity } from '../profile.ts';
import { partName, rarityName } from '../reward.ts';
import { closeButton, goBack, h, openModal, rebuildOnLayout, subPage, toast, wideLayout, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge (docs/PROGRESSION_DESIGN.md, revised): your avatar, your Stardust and Spirits,
 * and the season's avatars and frames (name plates come with the level: the Profile's Name
 * plates page, screens/plates.ts): wearing, owned, a blueprint to forge, ready to forge, or
 * not yet affordable. A part opens a sheet with its price and the one action that fits; an
 * avatar you own can be brought to life (polished) once. Blueprints arrive every 3rd solved
 * square and forge cheaply; Stardust forges any part without one for more. Spent on the server.
 */

type State = 'wearing' | 'owned' | 'blueprint' | 'blueprint-needs' | 'ready' | 'needs';

/** What's worn in a slot (Happy when no avatar is). */
const worn = (f: Forge, slot: Part['slot']) => f.loadout[slot] ?? (slot === 'avatar' ? DEFAULT_AVATAR : null);

function stateOf(f: Forge, p: Part): State {
  if (worn(f, p.slot) === p.id) return 'wearing';
  if (f.owned.has(p.id)) return 'owned';
  if (f.blueprints.has(p.id)) return f.stardust >= BLUEPRINT_COST[p.rarity] ? 'blueprint' : 'blueprint-needs';
  return f.stardust >= FORGE_COST[p.rarity] ? 'ready' : 'needs';
}

/** What forging it costs you now: its blueprint's price, or the full one. */
const costOf = (f: Forge, p: Part) => (f.blueprints.has(p.id) ? BLUEPRINT_COST : FORGE_COST)[p.rarity];
const price = (f: Forge, p: Part) => (f.blueprints.has(p.id) ? copy.forge.blueprintPrice(BLUEPRINT_COST[p.rarity]) : copy.forge.price(FORGE_COST[p.rarity]));
const forgeable = (s: State) => s === 'ready' || s === 'needs' || s === 'blueprint' || s === 'blueprint-needs';
/** "Fire · Frame" for a frame, "Avatar" for an avatar. */
const kind = (p: Part) => (p.element ? `${copy.forge.elements[p.element]} · ${copy.forge.slots[p.slot]}` : copy.forge.slots[p.slot]);
const order = (p: Part) => (p.element ? ELEMENTS.indexOf(p.element) : 0);
const rarityTag = (r: Rarity) => h('span', { class: `rarity-tag rarity-${r}`, text: rarityName(r) });
/** A balance between its two rules (forge.css): the number, then what it counts. */
const balance = (kind: 'stardust' | 'spirit', n: number, what: string) => {
  const rule = () => h('span', { class: 'purse-rule', attrs: { 'aria-hidden': 'true' } });
  const el = h('span', { class: `balance balance-${kind}` }, rule(), h('strong', { text: copy.formatNumber(n) }), h('span', { text: what }), rule());
  el.style.setProperty('--flourish', FLOURISH);
  return el;
};
/**
 * The ornament at the middle of each rule, the owner's reference border: a small hollow diamond
 * sitting on the line (the line breaks around it), a smaller one nested inside it. A mask in the
 * rule's colour, 24 × 12 units.
 */
const FLOURISH = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><path d="M12 1.2L19.5 6L12 10.8L4.5 6Z" fill="none" stroke="#000" stroke-width="0.9"/><path d="M12 4.4L14.5 6L12 7.6L9.5 6Z"/></svg>',
)}")`;
/** A frame's marks: three small diamonds, earned ones filled (the words say it too). */
const markPips = (n: number) => h('span', { class: 'mark-pips', attrs: { 'aria-hidden': 'true' } },
  ...Array.from({ length: MAX_MARKS }, (_, i) => h('span', { class: `mark-pip${i < n ? ' on' : ''}` })));
/** An owned frame's marks, or null for an avatar or a part not yet yours. */
const frameMarks = (f: Forge, p: Part) => (p.slot === 'frame' && f.owned.has(p.id) ? marksOf(f.owned.get(p.id)!.wins) : null);

export function forgeScreen(back: () => Screen = homeScreen): Screen {
  const body = h('div', { class: 'forge-body' }, h('p', { class: 'forge-status', text: copy.forge.loading }));
  // wide screens (banner.css): the gem on the banner, you and your purse at its foot
  const wide = wideLayout();
  const purse = h('div', { class: 'forge-purse-foot' });
  const el = subPage(
    {
      className: 'forge',
      title: copy.forge.title,
      onBack: () => void goBack(back),
      banner: { art: spinnable(forgeHero), help: copy.forge.bannerHelp, foot: purse },
    },
    body,
  );
  rebuildOnLayout(el, () => forgeScreen(back));
  let forge: Forge | null = null;

  const refresh = async () => {
    forge = await loadForge();
    render();
  };

  function render() {
    if (!forge) {
      body.replaceChildren(h('p', { class: 'forge-status', text: copy.forge.offline }));
      return;
    }
    const f = forge;
    const craftable = f.parts.filter((p) => p.source === 'craft');
    // your purse: each between two worn gold rules, its words in its own colour (forge.css),
    // Stardust a warm gold, Spirits a red; the words say what each is
    const stardust = balance('stardust', f.stardust, copy.common.stardust);
    const spirits = balance('spirit', f.spirits, copy.common.spiritsLabel(f.spirits));
    const odds = h('button', { class: 'link-btn', text: copy.forge.oddsButton, attrs: { type: 'button' }, onclick: () => openOdds() });
    if (wide) {
      // you and your purse on the banner; how parts come and the Spirits side by side, then the parts
      purse.replaceChildren(h('div', { class: 'forge-balances forge-purse' }, stardust, spirits));
      body.replaceChildren(
        h('div', { class: 'door-row forge-top', attrs: { style: '--doors: 2' } },
          h('section', { class: 'forge-lead' }, h('h2', { class: 'forge-heading', text: copy.forge.blueprintsTitle }), h('p', { class: 'forge-intro', text: copy.forge.intro }), odds),
          spiritsSection(f)),
        h('div', { class: 'forge-heading-row' }, h('h2', { class: 'forge-heading', text: copy.forge.parts }), h('span', { class: 'forge-count', text: copy.forge.collected(craftable.filter((p) => f.owned.has(p.id)).length, craftable.length) })),
        ...groups(f),
      );
      return;
    }
    const head = h(
      'section',
      { class: 'forge-head' },
      // the page's own icon, as on a wide screen's banner (you turn it to catch the light)
      withRays(spinnable(forgeHero)),
      h(
        'div',
        { class: 'forge-balances' },
        h('p', { class: 'forge-intro', text: copy.forge.intro }),
        odds,
        h('div', { class: 'forge-purse' }, stardust, spirits),
      ),
    );
    body.replaceChildren(
      head,
      spiritsSection(f),
      h(
        'div',
        { class: 'forge-heading-row' },
        h('h2', { class: 'forge-heading', text: copy.forge.parts }),
        h('span', { class: 'forge-count', text: copy.forge.collected(craftable.filter((p) => f.owned.has(p.id)).length, craftable.length) }),
      ),
      ...groups(f),
    );
  }

  /** The season's parts, a group a slot: Happy first (everyone has it), then by element and rarity. */
  function groups(f: Forge): HTMLElement[] {
    return SLOTS.map((slot) => {
      const parts = f.parts
        .filter((p) => p.slot === slot)
        .sort((a, b) => Number(b.source === 'starter') - Number(a.source === 'starter') || order(a) - order(b) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
      return h('section', { class: 'forge-group' }, h('h2', { text: copy.forge.slotGroups[slot] }), h('div', { class: 'part-grid' }, ...parts.map((p) => partCard(f, p))));
    });
  }

  function stateLabel(state: State): string {
    return state === 'wearing' ? copy.forge.wearing
      : state === 'owned' ? copy.forge.owned
      : state === 'blueprint' ? copy.forge.blueprintReady
      : state === 'blueprint-needs' ? copy.forge.blueprintNeeds
      : state === 'ready' ? copy.forge.ready
      : copy.forge.needsMore;
  }

  function partCard(f: Forge, p: Part): HTMLElement {
    const state = stateOf(f, p);
    const name = partName(p.id);
    const alive = f.owned.get(p.id)?.polish === 1;
    const label = alive ? `${stateLabel(state)} · ${copy.forge.alive}` : stateLabel(state);
    const marks = frameMarks(f, p);
    const gilded = !!f.owned.get(p.id)?.gilded;
    return h(
      'button',
      {
        class: `part-card rarity-${p.rarity} state-${state}`,
        attrs: { type: 'button', 'aria-label': `${name}, ${rarityName(p.rarity)}, ${kind(p)}. ${label}.${marks ? ` ${copy.forge.a11yMarks(marks.marks, marks.toNext)}.` : ''}${gilded ? ` ${copy.forge.gilded}.` : ''}` },
        onclick: () => openPart(p),
      },
      h('span', { class: 'part-art', html: partSvg(p.id, f.owned.get(p.id)?.polish ?? 0, gilded), attrs: { 'aria-hidden': 'true' } }),
      h('strong', { class: 'part-name', text: name, attrs: { 'aria-hidden': 'true' } }),
      h('span', { attrs: { 'aria-hidden': 'true' } }, rarityTag(p.rarity)),
      h('span', { class: 'part-state', attrs: { 'aria-hidden': 'true' } },
        alive ? h('span', { class: 'alive-glyph', html: ICONS.spirit }) : '', label),
      marks ? h('span', { class: 'part-marks', attrs: { 'aria-hidden': 'true' } }, markPips(marks.marks), gilded ? copy.forge.gilded : marks.marks < MAX_MARKS ? copy.forge.markProgress(marks.toNext) : '') : '',
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
    if (forgeable(state)) {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.forge });
      if (f.stardust < costOf(f, p)) btn.disabled = true;
      else btn.addEventListener('click', () => busy(btn, () => forgePart(p.id), copy.forge.forged(name)));
      action = btn;
    } else if (state === 'owned') {
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.wear });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, p.id), null));
      action = btn;
    } else if (state === 'wearing' && p.id !== DEFAULT_AVATAR) {
      const btn = h('button', { class: 'btn', text: copy.forge.takeOff });
      btn.addEventListener('click', () => busy(btn, () => equipPart(p.slot, null), null));
      action = btn;
    }
    // An avatar you own can be brought to life, once: its own section under a hairline,
    // with the two costs side by side and what you have of each.
    let life: HTMLElement | null = null;
    if (p.slot === 'avatar' && (state === 'owned' || state === 'wearing') && polish < 1) {
      const can = f.stardust >= ALIVE_COST && f.spirits >= 1;
      const btn = h('button', { class: 'btn', text: copy.forge.lifeButton });
      if (!can) btn.disabled = true;
      else btn.addEventListener('click', () => busy(btn, () => polishPart(p.id), copy.forge.broughtToLife(name)));
      const cost = (icon: string, amount: string, label: string, have: number, need: number) =>
        h('li', { class: `life-cost-item${have >= need ? '' : ' short'}` },
          h('span', { class: 'life-cost-main' }, h('span', { class: 'life-cost-icon', html: icon }), h('strong', { text: amount })),
          h('span', { class: 'life-cost-label', text: label }),
          h('span', { class: 'life-cost-have', text: copy.forge.lifeHave(have) }),
          have >= need ? null : h('span', { class: 'life-cost-short', text: copy.forge.lifeShort(need - have) }));
      life = h(
        'section',
        { class: 'life-section' },
        h('h3', { text: copy.forge.lifeTitle }),
        h('p', { class: 'note', text: copy.forge.lifeNote }),
        h('ul', { class: 'life-cost', attrs: { 'aria-label': copy.forge.a11yLifeCost(ALIVE_COST, f.stardust, f.spirits) } },
          cost(ICONS.dust, String(ALIVE_COST), copy.common.stardust, f.stardust, ALIVE_COST),
          cost(ICONS.spirit, '1', copy.forge.lifeSpirit, f.spirits, 1)),
        btn,
      );
    }
    // a frame you own: its marks, and how close the next is
    const fm = frameMarks(f, p);
    const gilded = !!f.owned.get(p.id)?.gilded;
    // 3 marks: it can be gilded, once (gild_part); the price, what you have, and Gild
    let gild: (HTMLElement | null)[] = [];
    if (fm && gilded) gild = [h('p', { class: 'good', text: copy.forge.gildedLine })];
    else if (fm && fm.marks >= MAX_MARKS) {
      const cost = GILD_COST[p.rarity];
      const btn = h('button', { class: 'btn btn-primary', text: copy.forge.gildButton(cost) });
      if (f.stardust < cost) btn.disabled = true;
      else btn.addEventListener('click', () => busy(btn, () => gildPart(p.id), copy.forge.gildDone(name)));
      gild = [h('p', { class: 'note', text: copy.forge.gildNote }), btn, f.stardust < cost ? h('p', { class: 'note', text: copy.forge.gildShort(f.stardust, cost) }) : null];
    } else if (fm) gild = [h('p', { class: 'note', text: copy.forge.gildLocked })];
    const marksSection = fm
      ? h('section', { class: 'marks-section' }, h('h3', {}, copy.forge.marksTitle, markPips(fm.marks)), h('p', { text: copy.forge.marksLine(fm.marks, fm.toNext) }), h('p', { class: 'note', text: copy.forge.marksNote }), ...gild)
      : null;
    const close = openModal(
      h(
        'div',
        { class: 'sheet part-sheet' },
        closeButton(() => close()),
        h('span', { class: 'part-sheet-art', html: partSvg(p.id, polish, gilded), attrs: { 'aria-hidden': 'true' } }),
        h('h2', { text: name }),
        h('p', { class: 'part-sheet-meta' }, rarityTag(p.rarity), kind(p), edition ? ` · ${copy.forge.edition(edition)}` : '', polish ? ` · ${copy.forge.alive}` : '', gilded ? ` · ${copy.forge.gilded}` : ''),
        forgeable(state) ? h('p', { class: 'part-price', text: price(f, p) }) : null,
        action,
        marksSection,
        life,
      ),
    );
  }

  /**
   * Spirits: how close the next one is, and Call a Spirit for Stardust (full review M2, M3).
   * The button opens a sheet to confirm; it's off while every avatar you own has its Spirit.
   */
  function spiritsSection(f: Forge): HTMLElement {
    const t = copy.forge;
    const toWake = avatarsToWake(f) > 0;
    const short = toWake && f.stardust < f.callCost;
    const btn = h('button', { class: 'btn', text: t.callButton(f.callCost), attrs: { type: 'button' }, onclick: () => openCall() });
    btn.disabled = !toWake || short;
    return h(
      'section',
      { class: 'forge-spirits' },
      h('div', { class: 'forge-heading-row' }, h('h2', { class: 'forge-heading', text: t.spiritsTitle }), h('span', { class: 'forge-count', text: String(f.spirits) })),
      h('p', { class: 'forge-intro', text: t.spiritIn(f.spiritIn) }),
      h('h3', { class: 'forge-subheading', text: t.callTitle }),
      h('p', { class: 'forge-intro', text: toWake ? t.callNote : t.callNone }),
      btn,
      // a greyed-out button says why, in text a screen reader reaches too
      short ? h('p', { class: 'forge-intro', text: t.callShort(f.stardust, f.callCost) }) : '',
    );
  }

  /** Call a Spirit: its price, and Call. */
  function openCall() {
    const f = forge!;
    const btn = h('button', { class: 'btn btn-primary', text: copy.forge.callButton(f.callCost) });
    btn.addEventListener('click', () => {
      btn.disabled = true;
      void callSpirit().then(async (err) => {
        close();
        toast(err ?? copy.forge.called);
        await refresh();
      });
    });
    const close = openModal(
      h(
        'div',
        { class: 'sheet call-sheet' },
        closeButton(() => close()),
        h('span', { class: 'sheet-icon spirit', html: ICONS.spirit, attrs: { 'aria-hidden': 'true' } }),
        h('h2', { text: copy.forge.callTitle }),
        h('p', { class: 'note', text: copy.forge.callNote }),
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
        section(copy.forge.oddsSpiritTitle, copy.forge.oddsSpirit),
        section(copy.forge.oddsSpendTitle, ...copy.forge.oddsSpend),
      ),
    );
  }

  void refresh();
  return { el, title: copy.forge.title };
}
