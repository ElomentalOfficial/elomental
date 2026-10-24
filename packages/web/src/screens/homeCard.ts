import { avatarSvg } from '../avatar.ts';
import { elementMark } from '../elementMarks.ts';
import { cachedAccount, registered } from '../backend/account.ts';
import { cachedLoadout, cachedPolish } from '../backend/forge.ts';
import { myBadges } from '../backend/leaderboard.ts';
import { badgeArt, badgeLabel } from '../badges.ts';
import { openBadgePicker } from '../badgePicker.ts';
import { levelStep } from '../level.ts';
import { loadProfile, nextRank, rankTier } from '../profile.ts';
import { rankName } from '../rankName.ts';
import { withRays } from '../rays.ts';
import { h } from '../ui.ts';
import { xpLevel } from '../xp.ts';
import * as copy from '../copy/en.ts';

/**
 * Home's profile card, "Ledger" (owner, 2026-10-23): one reading order inside the tile's own Art
 * Deco frame. Who you are leads and takes the room: your avatar on a sunburst, your name and your
 * rank beside it. Under them two rows of three recessed tiles on one grid (owner, 2026-10-24): how
 * you are doing, Elo, Level and your faction, each a caption over a ring (it replaced the flag over
 * the name), then the three badges you show off.
 * Stardust and Spirits live on the Forge tile, where they are spent (home.ts).
 */
export interface HomeCard {
  el: HTMLElement;
  /** Your avatar: the way into your Profile (home.ts wires it). */
  avatar: HTMLButtonElement;
  /** The faction tile's choice, shown while you have none (home.ts wires it). */
  chooseSide: HTMLButtonElement;
  /** Repaint from the account cache. */
  paint(): void;
  /** The lowest edge of the card's content, to tell whether it fits (home.ts fitNote). */
  contentBottom(): number;
  destroy(): void;
}

/**
 * An empty slot's rim (owner's mock-up): a dashed line a little in from the slot's edge, following
 * its rounded corners. The rect fills its svg, which the CSS insets (home.css .pc-slot-rim).
 */
const RIM = '<svg class="pc-slot-rim" aria-hidden="true"><rect width="100%" height="100%"/></svg>';
/** An empty badge slot: a dashed diamond socket. */
const SOCKET = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10L10 0L0 10L-10 0Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 2"/></svg>';
/**
 * An empty badge slot you can fill (owner's mock-up): a hexagon socket (the badges' own shape),
 * sunk a little into the card, its rim a fine line with a fainter, finer one just inside it
 * (owner), and a soft glowing "+" whose arms narrow a little towards their ends.
 */
const ADD =
  '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path class="pc-add-socket" d="M0 -11L9.5 -5.5V5.5L0 11L-9.5 5.5V-5.5Z"/>' +
  '<path class="pc-add-inner" d="M0 -9.6L8.3 -4.8V4.8L0 9.6L-8.3 4.8V-4.8Z"/>' +
  '<path class="pc-add-plus" d="M-0.75 -0.75L-0.3 -4.4H0.3L0.75 -0.75L4.4 -0.3V0.3L0.75 0.75L0.3 4.4H-0.3L-0.75 0.75L-4.4 0.3V-0.3Z"/></svg>';

export function homeCard(): HomeCard {
  /** Your badges when you haven't chosen three: your newest, fetched once a visit to Home. */
  let newest: string[] | null = null;
  let fetching = false;
  /** Every badge you own, once fetched (for the badge choice). */
  let owned: string[] | null = null;
  /** The name as painted, for fitting it to its cell (draw). */
  let shown = '';

  // ---- who you are: the avatar on its sunburst; name and rank beside it
  const avatar = h('button', { class: 'avatar avatar-btn worn', attrs: { type: 'button', 'aria-label': copy.profile.a11yAvatar } });
  const portrait = h('div', { class: 'pc-cell pc-portrait' }, withRays(h('span', { class: 'pc-medallion' }, avatar)));
  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const name = h('div', { class: 'pc-cell pc-name' }, h('div', { class: 'pc-in' }, nameEl, rankEl));

  // ---- how you're doing: three tiles cut like the badge slots under them, each its caption over a
  // ring (owner, 2026-10-24): Elo and Level, the number inside a ring that fills as the next rank or
  // level nears (what's left, in words, for screen readers only: the ring shows it), and your
  // faction, its name the caption and its emblem in a closed ring; without one, a tile to choose
  const ring = (cls: string, inner: HTMLElement) => h('span', { class: `pc-num pc-ring ${cls}` }, inner);
  const eloNum = h('span', { class: 'pc-ring-val' });
  const eloRing = ring('pc-ring-rank', eloNum);
  const eloLeft = h('span', { class: 'sr-only' });
  const levelNum = h('span', { class: 'pc-ring-val' });
  const levelRing = ring('pc-ring-level', levelNum);
  const levelLeft = h('span', { class: 'sr-only' });
  const sideMark = h('span', { class: 'pc-mark', attrs: { 'aria-hidden': 'true' } });
  const sideName = h('span');
  const tile = (cls: string, cap: Node, value: HTMLElement, left: HTMLElement | null) =>
    h('div', { class: `pc-stat ${cls}` }, h('div', { class: 'pc-in' }, h('span', { class: 'pc-cap' }, cap), value, left));
  // (the faction's caption is its name, read as "Faction Air")
  const sideStat = tile('pc-faction', h('span', {}, h('span', { class: 'sr-only', text: `${copy.home.card.factionCap} ` }), sideName), ring('pc-ring-seal', sideMark), null);
  const chooseSide = h(
    'button',
    { class: 'pc-stat pc-faction pc-choose', attrs: { type: 'button', 'aria-label': copy.home.line.chooseSide } },
    h('div', { class: 'pc-in' }, h('span', { class: 'pc-cap', text: copy.home.card.factionCap }), ring('pc-ring-seal', h('span', { class: 'pc-mark', html: ADD }))),
  );
  const stats = h('div', { class: 'pc-cell pc-stats' },
    tile('pc-elo', document.createTextNode(copy.common.elo), eloRing, eloLeft),
    tile('pc-level', document.createTextNode(copy.level.cap), levelRing, levelLeft),
    sideStat, chooseSide);

  // ---- what you show off: your three badges, each in its own recessed slot
  const badges = h('ul', { class: 'pc-badges', attrs: { 'aria-label': copy.home.card.badges } });
  const showcase = h('div', { class: 'pc-cell pc-showcase' }, badges);

  const el = h('section', { class: 'profile-card area-profile' }, portrait, name, stats, showcase);

  /** Opens the badge choice (badgePicker.ts) with every badge you own. */
  const chooseBadges = () => {
    const open = (list: string[]) => openBadgePicker(list, cachedAccount()?.showcase ?? []);
    if (owned) return open(owned);
    void myBadges().then((list) => {
      owned = list ?? [];
      open(owned);
    });
  };
  const paintBadges = (ids: string[]) => {
    // a player with an account: three slots, each a way to choose the badges on the card (owner,
    // 2026-10-23), an empty one a "+" in a hexagon socket
    if (registered()) {
      badges.replaceChildren(...[0, 1, 2].map((i) => {
        const id = ids[i];
        const btn = id
          ? h('button', { class: 'pc-badge-btn', html: badgeArt(id), attrs: { type: 'button', 'aria-label': copy.home.card.a11yBadge(badgeLabel(id).text) } })
          : h('button', { class: 'pc-badge-btn pc-add', html: ADD, attrs: { type: 'button', 'aria-label': copy.home.card.a11yAddBadge } });
        btn.addEventListener('click', chooseBadges);
        return id ? h('li', { class: 'pc-badge' }, btn) : h('li', { class: 'pc-badge empty', html: RIM }, btn);
      }));
      return;
    }
    // a guest can't keep badges: no badge yet is one line on what the row is for
    if (!ids.length) {
      badges.replaceChildren(h('li', { class: 'pc-badges-note', text: copy.home.card.noBadges }));
      return;
    }
    badges.replaceChildren(...[0, 1, 2].map((i) => {
      const id = ids[i];
      return id
        ? h('li', { class: 'pc-badge' }, h('span', { class: 'pc-badge-art', html: badgeArt(id), attrs: { role: 'img', 'aria-label': badgeLabel(id).text } }))
        : h('li', { class: 'pc-badge empty', html: RIM, attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'pc-socket', html: SOCKET }));
    }));
  };

  const paint = () => {
    const p = loadProfile();
    const account = cachedAccount();
    avatar.innerHTML = avatarSvg(cachedLoadout(), cachedPolish());
    // the name alone: its plate shows on the Profile and the player card, not here (owner,
    // 2026-10-23); a long name that has to wrap breaks after its _ or -, not inside a word
    shown = p.name;
    nameEl.replaceChildren(...p.name.split(/(?<=[_-])/).flatMap((part, i) => (i ? [h('wbr'), part] : [part])));
    const tier = rankTier(p.elo, p.tier);
    rankEl.replaceChildren(rankName(tier.tier, tier.label, p.title));
    // Elo, its ring in your rank's metal filling toward the next rank once you've played Ranked
    // (as the Profile's bar); full at the top rank
    eloNum.textContent = copy.formatNumber(p.elo);
    const next = p.rankedGames > 0 ? nextRank(p.elo, p.tier) : null;
    eloRing.className = `pc-num pc-ring pc-ring-rank rank-${tier.tier}`;
    eloRing.style.setProperty('--fill', String(next ? next.share : p.rankedGames > 0 ? 1 : 0));
    eloLeft.textContent = next ? copy.common.toNextRank(next.gap, next.label) : '';
    // the level, its ring filling toward the next
    const xp = account?.xp ?? 0;
    const step = levelStep(xp);
    levelNum.textContent = String(xpLevel(xp).level);
    levelRing.style.setProperty('--fill', String(step.share));
    levelLeft.textContent = step.text;
    // your faction's tile; with an account and no faction yet, the tile to choose one; a guest on
    // this device alone has neither, and Elo and Level share the row
    const side = account?.affinity ?? null;
    sideStat.hidden = !side;
    chooseSide.hidden = !!side || !account;
    stats.classList.toggle('two', !account);
    if (side) {
      sideMark.innerHTML = elementMark(side);
      sideName.textContent = copy.forge.elements[side];
    }
    // your three chosen badges (Profile > Badges), or your newest until you choose
    const chosen = account?.showcase ?? [];
    if (chosen.length || !registered()) paintBadges(chosen);
    else if (newest) paintBadges(newest);
    else {
      paintBadges([]);
      if (!fetching) {
        fetching = true;
        void myBadges().then((list) => {
          owned = list ?? [];
          newest = owned.slice(0, 3);
          if (el.isConnected && !(cachedAccount()?.showcase ?? []).length) {
            paintBadges(newest);
            schedule();
          }
        });
      }
    }
    schedule();
  };

  // ---- the name, fitted to its cell as laid out
  const zoomOf = (node: Element) => parseFloat(getComputedStyle(node).zoom || '1') || 1;
  const draw = () => {
    if (!el.isConnected || !el.offsetWidth) return;
    const fit = name.clientWidth / zoomOf(name.firstElementChild!) - 16;
    // a long name shrinks to keep to one line, down to the label size; past that it wraps after
    // its _ or - (see paint), sized so its longest part keeps to a line, down to the body size
    // (both still over the title's)
    nameEl.style.fontSize = '';
    const measure = (s: string) => {
      const probe = h('span', { text: s });
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
      nameEl.append(probe);
      const w = probe.offsetWidth;
      probe.remove();
      return w;
    };
    const full = measure(shown);
    if (full > fit) {
      const size = parseFloat(getComputedStyle(nameEl).fontSize);
      const longest = Math.max(...shown.split(/(?<=[_-])/).map(measure));
      const one = (size * fit) / full;
      nameEl.style.fontSize = `${one >= (size * 20) / 30 ? one : Math.max((size * 16) / 30, Math.min((size * 20) / 30, (size * fit) / longest))}px`;
    }
  };
  let frame = 0;
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(el);
  resize.observe(nameEl);
  void document.fonts?.ready.then(schedule);
  paint();

  return {
    el,
    avatar,
    chooseSide,
    paint,
    contentBottom: () => badges.getBoundingClientRect().bottom,
    destroy: () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
