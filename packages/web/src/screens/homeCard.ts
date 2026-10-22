import { avatarSvg, emblemUrl } from '../avatar.ts';
import { cachedAccount, registered } from '../backend/account.ts';
import { cachedLoadout, cachedPolish } from '../backend/forge.ts';
import { myBadges } from '../backend/leaderboard.ts';
import { badgeArt, badgeLabel } from '../badges.ts';
import { paintPlate } from '../plates.ts';
import { BANNER_EMBLEM, bannerPlace, cardWalls, type Box } from '../profileWalls.ts';
import { loadProfile, rankTier } from '../profile.ts';
import { rankName } from '../rankName.ts';
import { h } from '../ui.ts';
import { xpLevel } from '../xp.ts';
import * as copy from '../copy/en.ts';

/**
 * Home's profile card (owner, 2026-10-22: "the Forge Link"): a sudoku box in the tile's own Art
 * Deco frame. You and your name on top, Level and Elo as the givens under you, your three chosen
 * badges on the floor, your faction's banner hung from the frame. Stardust and Spirits live on
 * the Forge tile, where they are spent (home.ts). The walls (profileWalls.ts) are drawn to the
 * cells as laid out, so they follow every screen and Text size.
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

/** An empty badge slot: a dashed diamond socket. */
const SOCKET = '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10L10 0L0 10L-10 0Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 2"/></svg>';

export function homeCard(): HomeCard {
  /** Your badges when you haven't chosen three: your newest, fetched once a visit to Home. */
  let newest: string[] | null = null;
  let fetching = false;
  const avatar = h('button', { class: 'avatar avatar-btn worn', attrs: { type: 'button', 'aria-label': copy.profile.a11yAvatar } });
  const portrait = h('div', { class: 'pc-cell pc-portrait' }, avatar);

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const name = h('div', { class: 'pc-cell pc-name' }, h('div', { class: 'pc-in' }, nameEl, rankEl));

  const given = (cap: Node, num: HTMLElement) => h('div', { class: 'pc-in pc-given' }, h('span', { class: 'pc-cap' }, cap), num);
  const levelNum = h('span', { class: 'pc-num' });
  const level = h('div', { class: 'pc-cell pc-level' }, given(h('span', { text: copy.level.cap }), levelNum));
  const eloNum = h('span', { class: 'pc-num' });
  const elo = h('div', { class: 'pc-cell pc-elo' }, given(h('span', { text: copy.common.elo }), eloNum));

  const badges = h('ul', { class: 'pc-cell pc-badges', attrs: { 'aria-label': copy.home.card.badges } });
  const walls = h('div', { class: 'pc-walls', attrs: { 'aria-hidden': 'true' } });
  const emblem = h('img', { class: 'pc-emblem', attrs: { alt: '' } }) as HTMLImageElement;
  // (the emblem, placed over the banner, is read out right after your name)
  const el = h('section', { class: 'profile-card area-profile' }, walls, portrait, name, emblem, level, elo, badges);

  const paintBadges = (ids: string[]) => {
    // no badge yet: one line on what the row is for, in place of three empty sockets
    if (!ids.length) {
      badges.replaceChildren(h('li', { class: 'pc-badges-note', text: copy.home.card.noBadges }));
      return;
    }
    badges.replaceChildren(...[0, 1, 2].map((i) => {
      const id = ids[i];
      return id
        ? h('li', { class: 'pc-badge' }, h('span', { class: 'pc-badge-art', html: badgeArt(id), attrs: { role: 'img', 'aria-label': badgeLabel(id).text } }))
        : h('li', { class: 'pc-badge empty', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'pc-socket', html: SOCKET }));
    }));
  };

  const paint = () => {
    const p = loadProfile();
    const account = cachedAccount();
    avatar.innerHTML = avatarSvg(cachedLoadout(), cachedPolish());
    // the name inside its plate (plates.ts); the level has its own cell
    paintPlate(nameEl, p.name, account?.plate ?? 0, null);
    nameEl.classList.toggle('plate-inline', nameEl.classList.contains('name-plate'));
    const tier = rankTier(p.elo, p.tier);
    rankEl.replaceChildren(rankName(tier.tier, tier.label, p.title));
    levelNum.textContent = String(account ? xpLevel(account.xp ?? 0).level : 1);
    eloNum.textContent = copy.formatNumber(p.elo);
    const side = account?.affinity ?? null;
    el.classList.remove('el-fire', 'el-water', 'el-earth', 'el-air');
    el.classList.toggle('has-faction', !!side);
    emblem.hidden = !side;
    if (side) {
      el.classList.add(`el-${side}`);
      emblem.src = emblemUrl(side);
      emblem.alt = copy.home.card.faction(copy.forge.elements[side]);
    }
    // your three chosen badges (Profile > Badges), or your newest until you choose
    const chosen = account?.showcase ?? [];
    if (chosen.length || !registered()) paintBadges(chosen);
    else if (newest) paintBadges(newest);
    else {
      paintBadges([]);
      if (!fetching) {
        fetching = true;
        void myBadges().then((owned) => {
          newest = (owned ?? []).slice(0, 3);
          if (el.isConnected && !(cachedAccount()?.showcase ?? []).length) {
            paintBadges(newest);
            schedule();
          }
        });
      }
    }
    schedule();
  };

  // ---- the walls, drawn to the cells as they are laid out
  const zoomOf = (node: Element) => parseFloat(getComputedStyle(node).zoom || '1') || 1;
  const box = (cell: HTMLElement): Box => ({ left: cell.offsetLeft, top: cell.offsetTop, right: cell.offsetLeft + cell.offsetWidth, bottom: cell.offsetTop + cell.offsetHeight });
  const draw = () => {
    if (!el.isConnected || !el.offsetWidth) return;
    // the name's plate: the rule runs through the name's middle, its ends with room to show
    const text = nameEl.querySelector<HTMLElement>('.plate-text');
    if (text && nameEl.classList.contains('plate-inline')) {
      const room = name.clientWidth / zoomOf(name.firstElementChild!) - 16;
      const tw = text.offsetWidth;
      nameEl.style.setProperty('--medal-d', `${tw + 26}px`);
      nameEl.style.setProperty('--plate-pad', `${Math.max(20, Math.min(56, (room - tw) / 2))}px`);
    }
    const css = getComputedStyle(el);
    const unit = ((parseFloat(css.getPropertyValue('--frame-corner')) || 44) * (parseFloat(css.getPropertyValue('--frame-zoom')) || 1)) / 40;
    const W = el.clientWidth;
    const bannerW = el.classList.contains('has-faction') ? 31 * unit : 0;
    // the name keeps clear of the banner hung above its cell: centred while it fits under it, else
    // pushed down just enough (at large text the name sits lower, under the portrait: no need)
    name.style.paddingTop = '';
    if (bannerW) {
      const b = bannerPlace(W, unit, bannerW);
      // inside the banner's outline, above the step in its tip (profileWalls.ts BANNER_EMBLEM)
      const size = (BANNER_EMBLEM.size / 62) * bannerW;
      Object.assign(emblem.style, { left: `${b.cx - size / 2}px`, top: `${b.top + ((BANNER_EMBLEM.top - 6) / 62) * bannerW}px`, width: `${size}px`, height: `${size}px` });
      const under = b.cx - bannerW / 2 < name.offsetLeft + name.offsetWidth && b.cx + bannerW / 2 > name.offsetLeft;
      const need = b.bottom + 4 - name.offsetTop;
      const inner = name.firstElementChild as HTMLElement;
      const cellH = name.offsetHeight, contentH = inner.offsetHeight * zoomOf(inner);
      if (under && need > (cellH - contentH) / 2) name.style.paddingTop = `${2 * need - cellH + contentH}px`;
    }
    // then the walls, to the cells as they now stand
    const H = el.clientHeight;
    walls.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${cardWalls({ width: W, height: H, unit, portrait: box(portrait), name: box(name), level: box(level), elo: box(elo), badges: box(badges), banner: bannerW })}</svg>`;
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
