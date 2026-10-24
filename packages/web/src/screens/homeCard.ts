import { avatarSvg, plainEmblemUrls } from '../avatar.ts';
import { cachedAccount, registered } from '../backend/account.ts';
import { cachedLoadout, cachedPolish } from '../backend/forge.ts';
import { myBadges } from '../backend/leaderboard.ts';
import { badgeArt, badgeLabel } from '../badges.ts';
import { openBadgePicker } from '../badgePicker.ts';
import { levelProgress } from '../level.ts';
import { loadProfile, rankTier } from '../profile.ts';
import { rankProgress } from '../rankBar.ts';
import { rankName } from '../rankName.ts';
import { placeIn } from '../tileSprites.ts';
import { withRays } from '../rays.ts';
import { h } from '../ui.ts';
import { xpLevel } from '../xp.ts';
import * as copy from '../copy/en.ts';

/**
 * Home's profile card, "Ledger" (owner, 2026-10-23): one reading order inside the tile's own Art
 * Deco frame. Who you are leads and takes the room: your avatar on a sunburst, your name and your
 * rank beside it under your faction's flag (owner, 2026-10-24). Under a hairline, how you are
 * doing: Elo and Level, each with its bar and what's next. Last, the three badges you show off,
 * each in a recessed slot.
 * Stardust and Spirits live on the Forge tile, where they are spent (home.ts).
 */
export interface HomeCard {
  el: HTMLElement;
  /** Your avatar: the way into your Profile (home.ts wires it). */
  avatar: HTMLButtonElement;
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

/**
 * The burst behind the flag's emblem (owner's reference, 2026-10-24): sixteen slim blades round
 * its centre (26, 32), long and short in turn, each a lozenge widest a third of the way out, in the
 * flag's units. Not the sunburst: that stands beside it, behind your avatar.
 */
const BLADES = Array.from({ length: 16 }, (_, k) => {
  const a = (k * Math.PI) / 8;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const from = 16;
  const to = k % 2 ? 23 : 31;
  const mid = from + (to - from) / 3;
  const w = k % 2 ? 1.1 : 1.6;
  const at = (r: number, side = 0) => `${(26 + c * r - s * side).toFixed(2)} ${(32 + s * r + c * side).toFixed(2)}`;
  return `M${at(from)}L${at(mid, w)}L${at(to)}L${at(mid, -w)}Z`;
}).join('');

/** The flag's cloth: 52 × 80 units with its gem (owner: wider and shorter than its first 44 × 92). */
const CLOTH = 'M1 0V56L26 70L51 56V0Z';
/** Its width for its height (home.css .pc-flag aspect-ratio, homeCard.ts placeFlag). */
const FLAG_RATIO = 52 / 80;

/**
 * Your faction's flag (owner, 2026-10-24, the banner of an earlier version of the card): a pennant,
 * its cloth coming to a point with a step inside its tip and a gem under it, the emblem high on
 * the cloth on its burst of blades (kept to the cloth), one picture of it for each theme (home.css
 * shows the theme's). Its top starts above the frame's top line and lies over it (home.css
 * .pc-flag).
 */
const FLAG = (emblem: { dark: string; light: string }) =>
  `<svg viewBox="0 0 52 80" aria-hidden="true"><clipPath id="pc-flag-clip"><path d="${CLOTH}"/></clipPath>` +
  `<path class="pc-flag-cloth" d="${CLOTH}"/>` +
  `<path class="pc-flag-blades" clip-path="url(#pc-flag-clip)" d="${BLADES}"/>` +
  '<path class="pc-flag-lines" d="M1 0V56L26 70L51 56V0M10 53L26 62L42 53"/><path class="pc-flag-gem" d="M26 73L29 76L26 79L23 76Z"/>' +
  `<image class="pc-flag-dark" href="${emblem.dark}" x="12" y="18" width="28" height="28"/>` +
  `<image class="pc-flag-light" href="${emblem.light}" x="12" y="18" width="28" height="28"/></svg>`;

export function homeCard(): HomeCard {
  /** Your badges when you haven't chosen three: your newest, fetched once a visit to Home. */
  let newest: string[] | null = null;
  let fetching = false;
  /** Every badge you own, once fetched (for the badge choice). */
  let owned: string[] | null = null;
  /** The name as painted, for fitting it to its cell (draw). */
  let shown = '';

  // ---- who you are: the avatar on its sunburst; name and rank, your faction's flag over them
  const avatar = h('button', { class: 'avatar avatar-btn worn', attrs: { type: 'button', 'aria-label': copy.profile.a11yAvatar } });
  const portrait = h('div', { class: 'pc-cell pc-portrait' }, withRays(h('span', { class: 'pc-medallion' }, avatar)));
  // your faction's flag over your name (draw places it), read out after it; none without a faction
  const flag = h('span', { class: 'pc-flag', attrs: { role: 'img' } });
  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const name = h('div', { class: 'pc-cell pc-name' }, h('div', { class: 'pc-in' }, nameEl, rankEl));

  // ---- how you're doing: Elo and Level, each with its bar and what's next
  const eloNum = h('span', { class: 'pc-num' });
  const eloNext = h('div', { class: 'pc-next' });
  const levelNum = h('span', { class: 'pc-num' });
  const levelNext = h('div', { class: 'pc-next' });
  const stat = (cls: string, cap: string, num: HTMLElement, next: HTMLElement) =>
    h('div', { class: `pc-stat ${cls}` }, h('div', { class: 'pc-in' }, h('span', { class: 'pc-cap', text: cap }), num, next));
  const stats = h('div', { class: 'pc-cell pc-stats' }, stat('pc-elo', copy.common.elo, eloNum, eloNext), stat('pc-level', copy.level.cap, levelNum, levelNext));

  // ---- what you show off: your three badges, each in its own recessed slot
  const badges = h('ul', { class: 'pc-badges', attrs: { 'aria-label': copy.home.card.badges } });
  const showcase = h('div', { class: 'pc-cell pc-showcase' }, badges);

  const el = h('section', { class: 'profile-card area-profile' }, portrait, name, flag, stats, showcase);

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
    // Elo, and how far the next rank is once you've played Ranked (as on the Profile)
    eloNum.textContent = copy.formatNumber(p.elo);
    eloNext.replaceChildren(...[p.rankedGames > 0 ? rankProgress(p.elo, p.tier) : null].filter((n): n is HTMLElement => !!n));
    // the level, and what the next one needs
    const xp = account?.xp ?? 0;
    levelNum.textContent = String(xpLevel(xp).level);
    levelNext.replaceChildren(levelProgress(xp));
    // your faction's flag over your name, read out after it
    const side = account?.affinity ?? null;
    flag.hidden = !side;
    if (side) {
      flag.className = `pc-flag el-${side}`;
      flag.innerHTML = FLAG(plainEmblemUrls(side));
      flag.setAttribute('aria-label', copy.home.card.faction(copy.forge.elements[side]));
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

  // ---- the flag, placed as laid out: beside you, its left edge on your name's first letter, the
  // name brought down just enough to clear it; stacked (large text, the name centred under you),
  // in the top right corner, clear of the frame's corner ornament
  const placeFlag = () => {
    name.style.paddingTop = '';
    flag.style.width = '';
    if (flag.hidden) return;
    const css = getComputedStyle(el);
    const stacked = css.gridTemplateColumns.trim().split(/\s+/).length < 2;
    if (stacked) {
      const corner = (parseFloat(css.getPropertyValue('--frame-corner')) || 44) * (parseFloat(css.getPropertyValue('--frame-zoom')) || 1);
      flag.style.left = `${el.clientWidth - corner - 8 - flag.offsetWidth}px`;
      return;
    }
    // from layout, not the screen: the card swings in on a transform (tileSprites.ts placeIn)
    flag.style.left = `${placeIn(el, nameEl).x}px`;
    // in a short card (a tablet's) the flag shrinks so the name still fits under it, down to two
    // thirds of its size
    const content = placeIn(el, name.firstElementChild as HTMLElement).h;
    const room = name.offsetTop + name.clientHeight - content - 8 - flag.offsetTop;
    if (flag.offsetHeight > room) flag.style.width = `${Math.max((flag.offsetWidth * 2) / 3, room * FLAG_RATIO)}px`;
    // the name's block is centred in its cell: padding the cell's top by twice what's missing
    // brings its top to 8 px under the flag's gem
    const need = flag.offsetTop + flag.offsetHeight + 8 - name.offsetTop;
    const free = (name.clientHeight - content) / 2;
    if (need > free) name.style.paddingTop = `${2 * need - name.clientHeight + content}px`;
  };

  // ---- the name, fitted to its cell as laid out
  const zoomOf = (node: Element) => parseFloat(getComputedStyle(node).zoom || '1') || 1;
  const draw = () => {
    if (!el.isConnected || !el.offsetWidth) return;
    placeFlag();
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
    paint,
    contentBottom: () => badges.getBoundingClientRect().bottom,
    destroy: () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
