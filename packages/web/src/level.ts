import { reducedMotion } from './a11y.ts';
import { h } from './ui.ts';
import { PLATE_LEVELS, xpLevel } from './xp.ts';
import * as copy from './copy/en.ts';

/**
 * The account level (migration account_level): a permanent level from XP, never reset. Every
 * rated win earns XP (Easy 10, Medium 20, Hard 30, the Daily 30, Ranked 40) with no daily cap;
 * from level L to L+1 costs min(20 x L, 2000) (level_plates), with no top level. XP is status
 * only: never spent, never a Ranked edge, never on the leaderboard. The level shows in the name
 * plate's medallion (plates.ts); the cartouche badge here is the result's.
 */

export interface XpGain {
  gained: number;
  total: number;
  level: number;
  /** XP into this level, and what the next one needs */
  into: number;
  need: number;
  levelUp: boolean;
  /** A name plate this win unlocked (level_plates), and whether it was equipped. */
  plate?: number | null;
  plateEquipped?: boolean;
}

export { xpLevel };

/** The cartouche's pointed end (the right one is its mirror); non-scaling so it stays 1.5px. */
const END = '<svg class="level-end" viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true">'
  + '<path vector-effect="non-scaling-stroke" d="M10 1H6L1 50L6 99H10"/></svg>';

/** "LEVEL 12" in its cartouche; the accessible name is literal ("Level 12"). */
export function levelBadge(level: number, cls = ''): HTMLElement {
  return h(
    'span',
    { class: `level-badge ${cls}`.trim(), attrs: { role: 'img', 'aria-label': copy.level.label(level) } },
    h('span', { class: 'level-frame', html: END + END.replace('level-end', 'level-end e-r'), attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'level-cap', text: copy.level.cap, attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'level-num', text: String(level), attrs: { 'aria-hidden': 'true' } }),
  );
}

/** What the next level needs, saying so when it brings a name plate. */
const toNext = (left: number, next: number): string =>
  (PLATE_LEVELS as readonly number[]).includes(next) ? copy.plates.nextCaption(left, next) : copy.level.toNext(left, next);

/** A bar of `share` (0 to 1), its track and fill drawn by .xp-bar. */
function bar(share: number): HTMLElement {
  const fill = h('span');
  fill.style.width = `${Math.round(Math.min(Math.max(share, 0), 1) * 100)}%`;
  return h('span', { class: 'xp-bar', attrs: { 'aria-hidden': 'true' } }, fill);
}

/**
 * The result's one progress row (ux-reviewer: the only bar on the result): the level, the XP
 * gained, the bar, and what the next level needs. On a level-up the bar fills to the end, the
 * number turns over and the bar starts the new level; `hero` gives that its stamp (when the
 * level is the result's one moment). The final text is in place from the start.
 */
export function xpRow(xp: XpGain, hero = false): HTMLElement {
  const before = xpLevel(xp.total - xp.gained);
  const badge = levelBadge(xp.level);
  const fill = bar(xp.into / xp.need);
  const caption = h('span', { class: 'xp-caption', text: xp.levelUp ? copy.level.reached(xp.level) : toNext(xp.need - xp.into, xp.level + 1) });
  const row = h(
    'div',
    { class: `xp-row${xp.levelUp && hero ? ' is-hero' : ''}`, attrs: { role: 'group', 'aria-label': copy.level.a11y(xp.level, xp.gained, xp.need - xp.into) } },
    h('div', { class: 'xp-head', attrs: { 'aria-hidden': 'true' } }, badge, h('strong', { class: 'xp-gain', text: copy.level.gain(xp.gained) })),
    h('div', { attrs: { 'aria-hidden': 'true' } }, fill),
    h('div', { attrs: { 'aria-hidden': 'true' } }, caption),
  );
  // the bar fills from where it was; a level-up runs it to the end first
  if (!reducedMotion()) {
    const inner = fill.firstElementChild as HTMLElement;
    const end = inner.style.width;
    const from = xp.levelUp ? before.into / before.need : (xp.into - xp.gained) / xp.need;
    inner.style.width = `${Math.round(Math.max(from, 0) * 100)}%`;
    if (xp.levelUp) badge.querySelector('.level-num')!.textContent = String(before.level);
    setTimeout(() => {
      if (!xp.levelUp) return void (inner.style.width = end);
      inner.style.width = '100%';
      inner.addEventListener('transitionend', () => {
        badge.querySelector('.level-num')!.textContent = String(xp.level);
        if (hero) badge.classList.add('stamp');
        inner.style.transition = 'none';
        inner.style.width = '0%';
        void inner.offsetWidth;
        inner.style.transition = '';
        inner.style.width = end;
      }, { once: true });
    }, 400);
  }
  return row;
}

/** The Profile's progress: the bar and what the next level needs (no gain). */
export function levelProgress(total: number): HTMLElement {
  const l = xpLevel(total);
  return h(
    'div',
    { class: 'level-progress' },
    h('div', { attrs: { 'aria-hidden': 'true' } }, bar(l.into / l.need)),
    h('span', { class: 'xp-caption', text: toNext(l.need - l.into, l.level + 1) }),
  );
}
