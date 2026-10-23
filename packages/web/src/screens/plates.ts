import { cachedAccount, refreshAccount } from '../backend.ts';
import { wearPlate } from '../backend/forge.ts';
import { ICONS } from '../icons.ts';
import { paintPlate, plateBand, TIERS, type Band } from '../plates.ts';
import { readJson, writeJson } from '../storage.ts';
import { goBack, h, mount, subPage, toast, type Screen } from '../ui.ts';
import { PLATE_LEVELS, platesAt, xpLevel, xpTotal } from '../xp.ts';
import * as copy from '../copy/en.ts';

/**
 * Profile > Name plates (ux-reviewer, ui-designer): the one place every plate lives. The plate
 * you wear at the top, then the ladder by band, each card the plate drawn round its own name:
 * a collected plate is a button that equips it (Blank, the first, takes the frame off); a
 * locked one is its blueprint with the level that brings it, the next one with its XP to go.
 * Equipping is free and straight away. Plates come with the level (migration level_plates).
 */

const SEEN_KEY = 'elomental:plates-seen';
const BANDS: Band[] = ['ink', 'steel', 'gilt', 'star', 'epic', 'mythic'];

/** Plates collected since this page was last opened (the Profile's row shows "New"). */
function newPlates(): number {
  const account = cachedAccount();
  if (!account) return 0;
  const have = platesAt(xpLevel(account.xp ?? 0).level);
  return Math.max(0, have - (readJson<number>(SEEN_KEY) ?? have));
}

function platesScreen(back: () => Screen): Screen {
  const head = h('section', { class: 'panel plates-head' });
  const groups = h('div', { class: 'plates-groups' });
  let busy = false;

  function paint() {
    const account = cachedAccount();
    const xp = account?.xp ?? 0;
    const level = xpLevel(xp).level;
    const have = platesAt(level);
    const worn = Math.min(account?.plate ?? 0, have);
    const seen = readJson<number>(SEEN_KEY) ?? have;
    writeJson(SEEN_KEY, have);

    // the plate you wear, round your own name, with your level
    const mine = h('span', { class: 'plates-mine' });
    paintPlate(mine, account?.name ?? '', worn, level);
    head.replaceChildren(mine, h('p', { class: 'plates-intro', text: copy.plates.intro }));

    const card = (n: number) => {
      const name = copy.plates.names[n];
      const at = n ? PLATE_LEVELS[n - 1] : 1;
      const unlocked = n <= have;
      const yours = n === worn;
      const next = n === have + 1;
      const sample = h('span');
      paintPlate(sample, name, n, level);
      const state = yours
        ? h('span', { class: 'plate-state', html: `${ICONS.check}<span>${copy.plates.equipped}</span>` })
        : unlocked
          ? h('span', { class: 'plate-state', text: n ? copy.plates.from(at) : copy.plates.blankLine })
          : h('span', { class: 'plate-state', html: `${ICONS.lock}<span>${copy.plates.locked(at)}</span>` });
      const kids: (HTMLElement | null)[] = [sample, state];
      if (unlocked && n > seen) kids.push(h('span', { class: 'tag plate-new', text: copy.plates.isNew }));
      if (next) {
        const fill = h('span');
        fill.style.width = `${Math.round(Math.min(1, xp / xpTotal(at)) * 100)}%`;
        kids.push(h('span', { class: 'xp-bar' }, fill), h('span', { class: 'plate-next', text: copy.plates.toGo(xpTotal(at) - xp) }));
      }
      for (const k of kids) k?.setAttribute('aria-hidden', 'true');
      const cls = `panel plate-card tier-card-${n}${yours ? ' state-yours' : ''}${unlocked ? '' : ' is-blueprint'}`;
      if (!unlocked) return h('div', { class: cls, attrs: { role: 'group', 'aria-label': copy.plates.a11yLocked(name, at) } }, ...kids);
      return h('button', {
        class: cls,
        attrs: { type: 'button', 'aria-pressed': String(yours), 'aria-label': yours ? copy.plates.a11yEquipped(name) : copy.plates.a11yEquip(name), 'data-plate': String(n) },
        onclick: () => !yours && equip(n),
      }, ...kids);
    };
    groups.replaceChildren(
      ...BANDS.map((band) => {
        const tiers = TIERS.map((_, n) => n).filter((n) => plateBand(n) === band);
        return h('section', { class: 'plate-group' }, h('h2', { text: copy.plates.bands[band] }), h('div', { class: 'plate-grid' }, ...tiers.map(card)));
      }),
    );
  }

  /** Equips plate n (0: none): the buttons wait for the answer; focus stays on the card pressed. */
  function equip(n: number) {
    if (busy) return;
    busy = true;
    void wearPlate(n).then(async (err) => {
      busy = false;
      if (err) return toast(err);
      toast(n ? copy.plates.worn(copy.plates.names[n]) : copy.plates.none);
      await refreshAccount();
      paint();
      groups.querySelector<HTMLElement>(`[data-plate="${n}"]`)?.focus();
    });
  }

  paint();
  const el = subPage({ className: 'plates-page', title: copy.plates.title, onBack: () => void goBack(back) }, h('div', { class: 'plates-body' }, head, groups));
  return { el, title: copy.plates.title };
}

/** The Profile's way in: "Name plates · 4 of 9", with "New" when one came since. */
/**
 * The way to the plates on a wide screen (banner.css): a door with your name on the plate you wear,
 * your level in its medallion, as its picture; the line names the plate.
 */
export function platesDoor(back: () => Screen): HTMLElement | null {
  const account = cachedAccount();
  if (!account) return null;
  const have = platesAt(xpLevel(account.xp ?? 0).level);
  const fresh = newPlates();
  const level = xpLevel(account.xp ?? 0).level;
  const plate = account.plate ?? 0;
  // the picture is your name on the plate you wear; the line says which plate it is
  const name = h('span', { class: 'plates-door-name' });
  paintPlate(name, account.name, plate, level);
  return h(
    'button',
    { class: 'door plates-door', attrs: { type: 'button' }, onclick: () => mount(platesScreen(back)) },
    h('span', { class: 'door-pic', attrs: { 'aria-hidden': 'true' } }, name),
    h('span', { class: 'door-title', text: copy.plates.title }),
    h('span', { class: 'door-line', text: copy.plates.doorLine(plate ? copy.plates.names[plate] : null, have, PLATE_LEVELS.length) }),
    fresh ? h('span', { class: 'door-state', text: copy.plates.isNew }) : null,
  );
}

export function platesRow(back: () => Screen): HTMLElement | null {
  const account = cachedAccount();
  if (!account) return null;
  const have = platesAt(xpLevel(account.xp ?? 0).level);
  const fresh = newPlates();
  return h(
    'button',
    { class: 'btn plates-row', attrs: { type: 'button' }, onclick: () => mount(platesScreen(back)) },
    h('span', { class: 'plates-row-title', text: copy.plates.title }),
    fresh ? h('span', { class: 'tag plate-new', text: copy.plates.isNew }) : null,
    h('span', { class: 'plates-row-count', text: copy.plates.count(have, PLATE_LEVELS.length) }),
  );
}
