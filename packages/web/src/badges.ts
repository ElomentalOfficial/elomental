import { ELEMENT_PATHS } from './icons.ts';
import type { Element } from './profile.ts';
import * as copy from './copy/en.ts';

/**
 * Badges (migration leaderboard: public.badges, public.player_badges): earned today (a month
 * won by your affinity, 'win-2026-10-fire'; 20 Daily squares in a month, 'daily-2026-10'),
 * and later bought in the store or won at events. Each is drawn here as a vector medal,
 * crisp at any size; a badge without its own drawing yet gets a plain star medal. Up to three
 * are shown on the show-off card.
 */

const WIN = /^win-(\d{4})-(\d{2})-(fire|water|earth|air)$/;
const DAILY = /^daily-(\d{4})-(\d{2})$/;

const monthOf = (year: string, month: string, withYear: boolean) =>
  new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-GB', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' });

/** 'win-2026-10-fire' → "Fire won October 2026", with its element; 'daily-2026-10' → "Daily Square, October 2026". */
export function badgeLabel(badge: string): { text: string; element: Element | null } {
  const d = badge.match(DAILY);
  if (d) return { text: copy.badges.daily(monthOf(d[1], d[2], true)), element: null };
  const m = badge.match(WIN);
  if (!m) return { text: copy.badges.unknown, element: null };
  const element = m[3] as Element;
  return { text: copy.leaderboard.card.winBadge(copy.forge.elements[element], monthOf(m[1], m[2], true)), element };
}

/** The month a dated badge is for, without the year: 'daily-2026-10' → "October". */
export function badgeMonth(badge: string): string {
  const m = badge.match(/-(\d{4})-(\d{2})(?:-|$)/);
  return m ? monthOf(m[1], m[2], false) : '';
}

/** Leaves along an arc, for the laurel round a medal. */
function laurel(side: 1 | -1): string {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a = ((200 - i * 22) * Math.PI) / 180;
    const x = 32 + side * 27 * Math.cos(a) * -1;
    const y = 36 - 27 * Math.sin(a) * -1;
    const rot = (side === 1 ? 70 - i * 22 : -70 + i * 22).toFixed(0);
    d += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.4" ry="5" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }
  return d;
}

/** A badge's medal as an SVG string (decorative: its name is always written beside it). */
export function badgeArt(badge: string): string {
  const m = badge.match(WIN);
  const element = (m?.[3] ?? null) as Element | null;
  const mark = element
    ? `<g transform="translate(20 20) scale(1)" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ELEMENT_PATHS[element].map((d) => `<path d="${d}"/>`).join('')}</g>`
    : DAILY.test(badge)
      ? // a small calendar page with a tick: the Daily month
        '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="23" y="23" width="18" height="17" rx="2.5"/><path d="M23 28.5h18M27.5 20.5v5M36.5 20.5v5M27.5 34l3 3 6-6"/></g>'
      : '<path d="M32 21l3.2 6.6 7.2 1-5.2 5 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.2-5 7.2-1z" fill="currentColor"/>';
  return `<svg class="badge-art${element ? ` el-${element}` : ''}" viewBox="0 0 64 64" aria-hidden="true">
    <g class="badge-laurel">${laurel(1)}${laurel(-1)}</g>
    <path class="badge-shield" d="M32 9l17 9.5v19L32 55 15 37.5v-19z"/>
    <path class="badge-inner" d="M32 14l12.6 7v15.4L32 49.6 19.4 36.4V21z"/>
    <g class="badge-mark">${mark}</g>
  </svg>`;
}
