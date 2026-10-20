/**
 * App icons. The Home tile icons are brush-style art baked to PNGs (art/, `brush`);
 * the game icons come from the Figma exports in /assets; the
 * small utility icons below them (back, lock, play, ...) are our own until
 * Figma has versions of them. Cut-outs use `fill-rule="evenodd"` so they show
 * whatever is behind the icon, which keeps them right in both themes.
 */

import handCupDark from './art/hand-cup-dark.png';
import handCupLight from './art/hand-cup-light.png';
import feather from './art/feather.png';
import cogDark from './art/cog-dark.png';
import cogLight from './art/cog-light.png';
import calendar from './art/calendar.png';
import calendarBack from './art/calendar-back.webp';
import calendarUnder from './art/calendar-under.webp';
import calendarStub from './art/calendar-stub.webp';
import calendarFall from './art/calendar-fall.webp';
import calendarRings from './art/calendar-rings.webp';
import walletDark from './art/wallet-dark.png';
import walletLight from './art/wallet-light.png';
import sword from './art/sword.png';
import swordFlame from './art/sword-flame.png';
import swordBody from './art/sword-body.png';
import swordHeat from './art/sword-heat.png';
import clashLeftDark from './art/clash-dark-left.png';
import clashLeftLight from './art/clash-light-left.png';
import clashRightDark from './art/clash-dark-right.png';
import clashRightLight from './art/clash-light-right.png';
import clashBurstDark from './art/clash-dark-burst.png';
import clashBurstLight from './art/clash-light-burst.png';
import megaphoneDark from './art/megaphone-dark.png';
import megaphoneLight from './art/megaphone-light.png';

const stroke = (body: string, width = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const fill = (d: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;

/** Exact shapes from the Figma exports in /assets, recoloured through currentColor. */
const figma = (viewBox: string, body: string) =>
  `<svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true">${body}</svg>`;
/**
 * Brush-style art (art/*.png): PNGs baked at ~3x their largest size from the SVG sources,
 * because iOS Safari renders the grain/stipple SVG filters at 1x and they come out blurry.
 * `cls` picks the theme (ic-light / ic-dark) and any extra fit class.
 */
const brush = (src: string, cls = '') => `<img class="brush-art ${cls}" src="${src}" alt="" aria-hidden="true" draggable="false">`;
const figmaStroke = (body: string) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // Home icons: brush-style art baked to PNGs in art/ (see `brush`).
  /** Brush-style cog, one image per theme; the axle hole is see-through. */
  setup: brush(cogLight, 'ic-light') + brush(cogDark, 'ic-dark'),
  /** Brush-style wallet with a bill tucked in and coins on its corner, one image per theme. */
  store: brush(walletLight, 'ic-light') + brush(walletDark, 'ic-dark'),
  /**
   * Leaderboard: a long arm reaching in from the tile edge, raising a cup. Brush-icon
   * style in palette colours only, one image per theme. `brush-arm` covers the box
   * anchored right, so a narrow tile trims the arm, never the cup.
   */
  leaderboard: brush(handCupLight, 'ic-light brush-arm') + brush(handCupDark, 'ic-dark brush-arm'),
  /**
   * Clash: a fist bump, two brush-outlined fists meeting with impact lines
   * (icons/build_clash.py). Three layers per theme (each fist, the impact lines) so
   * the bump can play every few seconds (`.clash-live` in styles.css).
   */
  clash:
    '<span class="clash-live">' +
    brush(clashLeftLight, 'ic-light clash-left') + brush(clashLeftDark, 'ic-dark clash-left') +
    brush(clashRightLight, 'ic-light clash-right') + brush(clashRightDark, 'ic-dark clash-right') +
    brush(clashBurstLight, 'ic-light clash-burst') + brush(clashBurstDark, 'ic-dark clash-burst') +
    '</span>',
  // Mode-tile icons sit on fixed-colour tiles, so one export serves both themes.
  /** Brush-style calendar: the days crossed off, today ticked; drawn for the Crimson tile. */
  daily: brush(calendar),
  /**
   * The same calendar in layers, for the Daily Square page: the page behind, the next
   * day's page right under the front one, the front page in two parts split along a
   * zig-zag tear (the stub at the rings, the rest) and the rings on top. The front page
   * lifts in a breeze now and then (`.calendar-live` in styles.css) and is torn off and
   * falls when tapped (tearOffCalendar in daily.ts). The torn part is six strips of
   * the same image, each bending a little more than the one above, so the page curls
   * up from the bottom like paper.
   */
  dailyLive:
    '<span class="calendar-live">' +
    brush(calendarBack) +
    brush(calendarUnder) +
    `<span class="calendar-turn">${brush(calendarStub)}<span class="calendar-fall">` +
    [1, 2, 3, 4, 5, 6].map((n) => brush(calendarFall, `curl curl-${n}`)).join('') +
    '</span></span>' +
    brush(calendarRings) +
    '</span>',
  /** Brush-style feather with a Lava shaft, drawn for the Forest tile and badge. */
  casual: brush(feather),
  /** Brush-style sword wrapped in one flame, drawn for the Lava tile and the Ranked pop-up badge. */
  ranked: brush(sword),
  /**
   * The same sword in layers for the Ranked pop-up: the flame behind (it flickers,
   * `.sword-live` in styles.css), the sword in front (stacked, they match `ranked`), and
   * the blade glowing hot on top, faded in tap by tap (heatingSword in home.ts).
   */
  rankedLive: `<span class="sword-live">${brush(swordFlame, 'sword-flame')}${brush(swordBody)}${brush(swordHeat, 'sword-heat')}</span>`,
  /**
   * The loader: a hand-drawn 2x2 square (a rounded box in one overshooting pen stroke and
   * a wobbly cross, ink that swells and thins: icons/build_loader.py) in one colour. Two
   * numbers are written into it stroke by stroke, each landing with a pop that makes the
   * square jiggle like jelly; then they shrink away and the next round fills the other two
   * cells (.loader-icon in styles.css). The digits are single strokes (pathLength 1),
   * each in a group that places it, so the path itself is free to pop.
   */
  loader: `<svg class="loader-icon" viewBox="0 0 64 64" aria-hidden="true">
    <g class="loader-grid" fill="currentColor">
      <path d="M22.0,10.0 C22.4,10.3 23.6,9.9 24.7,9.8 C25.7,9.7 27.1,9.4 28.3,9.3 C29.5,9.2 30.5,9.4 31.9,9.4 C33.3,9.4 34.9,9.4 36.6,9.4 C38.2,9.4 40.3,9.5 41.7,9.6 C43.2,9.6 44.3,9.6 45.2,9.7 C46.2,9.8 46.9,10.0 47.3,10.1 C47.8,10.1 47.7,10.0 47.9,10.0 C48.1,10.1 48.1,10.4 48.5,10.6 C48.8,10.7 49.5,10.7 49.9,10.9 C50.4,11.1 50.7,11.4 51.0,11.7 C51.3,11.9 51.4,12.2 51.7,12.4 C51.9,12.7 52.1,12.9 52.3,13.2 C52.6,13.5 53.1,13.8 53.3,14.1 C53.6,14.4 53.6,14.6 53.7,14.9 C53.8,15.2 54.1,15.4 54.1,15.7 C54.2,16.0 54.1,16.2 54.2,16.6 C54.3,17.1 54.5,17.7 54.6,18.7 C54.6,19.7 54.6,21.1 54.6,22.5 C54.6,23.9 54.6,25.6 54.6,27.1 C54.7,28.7 54.9,30.4 54.9,32.0 C54.8,33.6 54.6,35.2 54.5,36.8 C54.5,38.3 54.6,40.1 54.5,41.5 C54.5,42.9 54.2,44.2 54.2,45.2 C54.1,46.1 54.2,46.9 54.2,47.4 C54.1,47.9 53.8,48.1 53.8,48.3 C53.7,48.5 53.9,48.3 53.8,48.6 C53.7,48.9 53.2,49.5 53.0,49.9 C52.9,50.3 53.0,50.4 52.8,50.7 C52.6,51.1 52.0,51.5 51.6,51.8 C51.3,52.1 51.0,52.4 50.8,52.6 C50.5,52.9 50.4,53.1 50.0,53.3 C49.7,53.4 49.0,53.4 48.7,53.5 C48.4,53.6 48.4,53.8 48.2,53.9 C48.0,54.0 47.8,54.0 47.3,54.1 C46.9,54.1 46.4,54.3 45.5,54.4 C44.6,54.4 43.3,54.4 41.8,54.4 C40.3,54.4 38.4,54.2 36.7,54.3 C35.1,54.3 33.4,54.6 31.8,54.6 C30.2,54.7 28.5,54.5 27.0,54.4 C25.4,54.4 24.0,54.2 22.6,54.1 C21.2,54.1 19.5,54.1 18.5,54.1 C17.6,54.1 17.3,54.2 16.9,54.1 C16.5,54.0 16.4,53.7 16.1,53.7 C15.9,53.6 15.6,53.7 15.3,53.6 C14.9,53.6 14.4,53.5 14.0,53.4 C13.7,53.2 13.5,53.0 13.2,52.7 C12.9,52.5 12.7,52.3 12.4,51.9 C12.1,51.6 11.7,51.2 11.5,50.9 C11.3,50.5 11.2,50.2 11.0,49.9 C10.8,49.5 10.3,49.1 10.2,48.9 C10.1,48.6 10.3,48.5 10.3,48.2 C10.2,47.9 9.9,47.8 9.8,47.3 C9.7,46.8 9.7,46.3 9.7,45.3 C9.7,44.4 9.9,43.1 9.9,41.6 C9.8,40.2 9.5,38.3 9.4,36.7 C9.3,35.1 9.3,33.7 9.3,32.1 C9.3,30.5 9.3,28.7 9.3,27.0 C9.3,25.4 9.3,23.6 9.4,22.2 C9.5,20.8 9.7,19.4 9.8,18.4 C9.9,17.4 9.8,16.9 9.9,16.4 C9.9,16.0 9.9,16.0 10.0,15.8 C10.1,15.5 10.2,15.4 10.3,15.0 C10.4,14.7 10.4,14.2 10.6,13.9 C10.8,13.6 11.4,13.4 11.7,13.1 C11.9,12.9 12.0,12.5 12.3,12.2 C12.5,11.9 13.0,11.8 13.3,11.6 C13.5,11.4 13.6,11.2 14.0,11.0 C14.3,10.9 14.7,10.8 15.1,10.7 C15.5,10.6 15.9,10.6 16.3,10.5 C16.6,10.4 16.8,10.2 17.2,10.1 C17.6,10.1 18.2,10.1 18.6,10.0 C19.1,10.0 19.5,9.7 19.8,9.7 C20.2,9.7 20.4,9.9 20.8,9.9 C21.2,9.9 21.5,9.8 22.3,9.8 C23.1,9.8 24.3,9.9 25.4,10.0 C26.4,10.1 27.6,10.3 28.6,10.3 C29.5,10.4 30.8,10.4 31.2,10.1 C31.5,9.8 31.3,8.9 30.9,8.6 C30.4,8.4 29.4,8.6 28.5,8.5 C27.6,8.4 26.3,8.0 25.4,7.9 C24.4,7.8 23.5,7.9 22.7,7.8 C22.0,7.7 21.3,7.4 20.8,7.3 C20.2,7.2 20.0,7.2 19.5,7.2 C19.1,7.2 18.7,7.3 18.2,7.3 C17.8,7.3 17.3,7.1 16.9,7.2 C16.5,7.2 16.2,7.4 15.7,7.6 C15.3,7.7 14.5,7.8 14.1,8.0 C13.6,8.1 13.4,8.2 12.9,8.5 C12.5,8.8 11.9,9.4 11.5,9.8 C11.0,10.1 10.7,10.4 10.4,10.7 C10.1,11.0 10.0,11.3 9.8,11.7 C9.5,12.1 9.0,12.7 8.8,13.1 C8.6,13.5 8.6,13.7 8.5,14.0 C8.4,14.4 8.3,14.9 8.1,15.3 C8.0,15.6 7.7,15.6 7.5,16.2 C7.4,16.7 7.2,17.6 7.2,18.6 C7.1,19.6 7.3,20.8 7.3,22.2 C7.2,23.5 6.8,25.3 6.8,26.9 C6.7,28.5 6.8,30.3 6.8,31.9 C6.8,33.5 6.5,35.2 6.6,36.8 C6.6,38.4 7.0,40.1 7.1,41.6 C7.2,43.0 7.1,44.6 7.1,45.6 C7.1,46.6 7.2,46.9 7.2,47.5 C7.3,48.0 7.3,48.3 7.5,48.7 C7.7,49.1 8.1,49.6 8.4,50.0 C8.6,50.4 8.7,50.9 8.9,51.3 C9.1,51.7 9.2,51.8 9.5,52.2 C9.8,52.6 10.4,53.1 10.8,53.5 C11.2,53.8 11.6,54.0 11.9,54.2 C12.3,54.5 12.5,55.0 12.9,55.2 C13.3,55.5 14.0,55.5 14.4,55.6 C14.7,55.8 14.7,55.9 15.0,56.1 C15.3,56.3 15.8,56.7 16.3,56.8 C16.9,56.9 17.4,56.6 18.4,56.7 C19.4,56.8 20.9,57.2 22.3,57.3 C23.7,57.5 25.3,57.6 26.9,57.6 C28.5,57.7 30.4,57.6 32.1,57.5 C33.7,57.5 35.2,57.3 36.8,57.2 C38.4,57.1 40.3,57.1 41.8,57.1 C43.2,57.0 44.5,57.0 45.5,56.9 C46.5,56.9 47.2,56.9 47.8,56.8 C48.4,56.7 48.7,56.4 49.1,56.2 C49.4,56.1 49.6,55.9 49.9,55.7 C50.2,55.5 50.5,55.3 51.0,55.0 C51.4,54.8 52.0,54.3 52.4,54.0 C52.8,53.7 52.9,53.4 53.3,53.2 C53.6,53.0 54.1,52.9 54.5,52.5 C54.8,52.1 54.9,51.3 55.2,50.9 C55.4,50.4 55.7,50.2 55.9,49.9 C56.1,49.5 56.3,49.4 56.5,49.0 C56.6,48.7 56.6,48.3 56.7,47.7 C56.8,47.1 57.0,46.3 57.1,45.4 C57.1,44.4 56.9,43.3 57.0,41.9 C57.1,40.5 57.5,38.7 57.6,37.1 C57.6,35.5 57.4,33.9 57.3,32.2 C57.3,30.6 57.3,28.7 57.2,27.1 C57.1,25.4 56.8,23.7 56.8,22.3 C56.7,20.8 56.6,19.5 56.6,18.5 C56.6,17.5 56.6,16.7 56.6,16.2 C56.5,15.6 56.3,15.6 56.2,15.3 C56.0,14.9 55.7,14.4 55.6,14.0 C55.4,13.7 55.6,13.5 55.4,13.0 C55.2,12.6 54.7,11.9 54.4,11.5 C54.1,11.1 54.0,10.8 53.6,10.5 C53.3,10.2 52.8,9.8 52.4,9.6 C52.0,9.3 51.6,9.2 51.1,8.9 C50.7,8.6 50.3,8.2 49.9,8.0 C49.6,7.8 49.5,7.8 49.1,7.7 C48.7,7.6 48.1,7.2 47.5,7.1 C47.0,7.0 46.8,7.1 45.8,7.1 C44.8,7.1 43.1,7.1 41.6,7.1 C40.0,7.0 38.1,6.7 36.4,6.7 C34.8,6.7 33.2,6.9 31.8,6.9 C30.3,7.0 29.2,7.0 27.9,7.1 C26.7,7.1 25.3,7.3 24.3,7.5 C23.3,7.6 22.4,7.7 22.0,8.1 C21.6,8.5 21.5,9.7 22.0,10.0 Z"/>
      <path d="M31.6,10.6 C31.4,10.9 31.5,11.3 31.4,11.7 C31.3,12.1 31.1,12.6 31.0,13.1 C30.9,13.7 30.8,14.3 30.7,15.0 C30.6,15.7 30.4,16.6 30.3,17.4 C30.3,18.2 30.3,18.9 30.2,19.7 C30.2,20.5 30.2,21.4 30.2,22.2 C30.2,23.0 30.3,23.6 30.3,24.4 C30.3,25.2 30.3,26.0 30.4,26.9 C30.5,27.8 30.9,28.9 31.0,29.9 C31.1,30.8 31.0,31.9 31.0,32.8 C31.0,33.7 31.1,34.5 31.1,35.3 C31.2,36.2 31.2,37.0 31.2,37.8 C31.2,38.7 31.0,39.7 31.0,40.7 C31.0,41.7 31.0,42.8 31.0,43.8 C31.0,44.8 30.9,45.7 30.9,46.6 C30.8,47.6 30.8,48.5 30.7,49.4 C30.7,50.2 30.6,51.0 30.6,51.7 C30.6,52.4 30.8,53.1 30.9,53.6 C31.1,54.0 31.2,54.3 31.5,54.2 C31.7,54.2 32.3,53.8 32.5,53.4 C32.7,53.0 32.5,52.5 32.6,51.9 C32.6,51.3 32.8,50.6 32.9,49.7 C32.9,48.9 33.0,48.0 33.1,47.0 C33.2,46.0 33.5,44.8 33.6,43.8 C33.7,42.8 33.5,42.0 33.6,41.0 C33.6,40.0 33.7,38.9 33.7,37.9 C33.7,36.9 33.6,36.0 33.5,35.1 C33.4,34.2 33.4,33.3 33.3,32.4 C33.2,31.5 33.0,30.7 32.9,29.7 C32.8,28.8 32.7,27.7 32.7,26.8 C32.7,25.9 32.8,25.3 32.8,24.5 C32.8,23.7 32.8,22.8 32.9,22.0 C32.9,21.3 32.9,20.7 32.9,19.9 C32.9,19.2 32.8,18.2 32.8,17.5 C32.9,16.7 33.1,16.2 33.2,15.5 C33.2,14.9 33.2,14.2 33.3,13.6 C33.3,13.0 33.4,12.5 33.4,12.0 C33.5,11.5 33.6,11.0 33.5,10.7 C33.4,10.3 33.1,9.8 32.8,9.8 C32.4,9.8 31.9,10.3 31.6,10.6 Z"/>
      <path d="M10.4,32.4 C10.7,32.7 11.2,32.6 11.6,32.7 C12.1,32.8 12.4,33.0 12.9,33.0 C13.5,33.1 14.4,33.1 15.1,33.1 C15.8,33.2 16.3,33.2 17.0,33.4 C17.7,33.5 18.5,33.7 19.3,33.8 C20.2,33.9 21.3,33.9 22.2,33.8 C23.1,33.8 23.7,33.8 24.7,33.7 C25.6,33.7 27.0,33.6 28.0,33.6 C29.0,33.6 29.9,33.6 30.9,33.6 C31.9,33.5 33.1,33.3 34.2,33.1 C35.2,33.0 36.3,32.6 37.3,32.4 C38.2,32.3 39.0,32.2 39.9,32.2 C40.8,32.1 41.8,32.1 42.8,32.2 C43.7,32.2 44.5,32.4 45.4,32.5 C46.2,32.5 46.9,32.5 47.7,32.6 C48.5,32.6 49.5,32.8 50.2,32.8 C50.9,32.9 51.4,32.8 51.9,32.9 C52.5,32.9 52.9,33.0 53.3,32.9 C53.7,32.8 54.2,32.7 54.3,32.4 C54.3,32.2 54.0,31.6 53.7,31.5 C53.4,31.3 52.8,31.4 52.3,31.4 C51.7,31.3 51.1,31.2 50.4,31.1 C49.7,31.0 48.9,30.9 48.0,30.8 C47.2,30.7 46.2,30.4 45.3,30.4 C44.4,30.3 43.7,30.4 42.8,30.4 C42.0,30.3 41.0,30.2 40.0,30.2 C39.0,30.2 38.0,30.2 37.0,30.2 C36.0,30.1 35.0,30.0 34.0,30.0 C32.9,30.0 31.7,30.0 30.6,30.1 C29.5,30.3 28.4,30.7 27.4,30.8 C26.4,30.9 25.5,30.7 24.6,30.8 C23.7,30.8 22.8,31.3 22.0,31.3 C21.2,31.4 20.5,31.1 19.8,31.0 C19.0,31.0 18.1,31.0 17.4,31.0 C16.6,31.0 15.9,31.0 15.2,30.9 C14.5,30.8 13.7,30.7 13.2,30.6 C12.7,30.6 12.4,30.6 12.0,30.6 C11.6,30.6 11.1,30.4 10.7,30.5 C10.3,30.6 9.8,30.9 9.8,31.2 C9.7,31.5 10.1,32.2 10.4,32.4 Z"/>
    </g>
    <g class="loader-digits" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(20.5 20.5) rotate(-6) scale(0.85)"><path class="loader-a1" pathLength="1" d="M-3 -4L1 -7.5L1 7"/></g>
      <g transform="translate(43.5 43.5) rotate(-5) scale(0.85)"><path class="loader-a2" pathLength="1" d="M-5 -3C-4 -8.5 5 -8.5 4.5 -2.5C4 1 -3 4 -5.5 7L5.5 6.5"/></g>
      <g transform="translate(43.5 20.5) rotate(4) scale(0.85)"><path class="loader-b1" pathLength="1" d="M-4.5 -6C1 -9 6 -6 1 -1C7 -0.5 6 8 -5 6"/></g>
      <g transform="translate(20.5 43.5) rotate(-7) scale(0.85)"><path class="loader-b2" pathLength="1" d="M2.5 7.5L2.5 -7L-5.5 3L5.5 3"/></g>
    </g>
  </svg>`,
  mistake: figma(
    '0 0 19 18',
    '<path d="M15.6211 3.99512L17.4609 6.05957L18.3594 9.96484L16.0254 13.5107L14.9922 14.7227L13.332 14.9473V17.4609L12.793 18L11.0869 17.8203L10.459 15.082L9.56152 14.7227L9.91992 17.6406L6.86816 17.4609L5.83496 14.7227H5.02734L5.29688 17.1924H4.30957L3.77051 16.6982L3.14258 14.5439L1.30176 13.2871L0 10.5488V7.81055L1.70605 4.71289L5.16211 1.48145L5.65625 0.717773L9.91992 0L15.6211 3.99512ZM7.54199 10.458L6.68848 11.625V12.3887L7.31738 12.792L7.81055 12.3887L8.25977 12.6582L9.02246 12.3887V11.625L8.25977 10.458H7.54199ZM10.3242 4.39844L10.1006 5.07129L10.3242 5.9248L10.7285 6.23926L11.626 8.4834L10.4141 10.2783L10.3242 11.2217L11.1328 11.5801L11.8057 11.2217L12.8379 10.1885L13.9609 11.625L14.8584 11.5801L15.3076 10.8174L13.8711 8.34863L15.4414 5.9248L14.8584 5.07129L13.8711 5.65527L12.8379 6.64258C12.315 5.89561 11.2437 4.40369 11.1328 4.39844H10.3242ZM3.00781 5.65527L2.02051 7.27148L1.88574 8.61816L2.46973 10.1885L3.72656 11.2217H5.11719L6.375 9.875L6.86816 7.49609L6.15039 5.43066L4.71387 4.84766L3.00781 5.65527Z"/>',
  ),
  /** Two-tone: the lower half of the eraser uses --eraser-shade. */
  eraser: figma(
    '0 0 32 33',
    '<path d="M1.94648 22.2678C0.871467 21.1928 0.871467 19.4498 1.94648 18.3748L9.34308 10.9782L21.0219 22.6571C15.8619 27.8171 7.49581 27.8171 2.33577 22.6571L1.94648 22.2678Z" fill="var(--eraser-shade)"/>' +
      '<path d="M10.978 9.34326L18.1998 2.1215C19.3714 0.949926 21.2709 0.949924 22.4424 2.1215L29.8786 9.55771C31.0502 10.7293 31.0502 12.6288 29.8786 13.8004L22.6569 21.0221L10.978 9.34326Z"/>' +
      '<path d="M10 31H27" stroke="currentColor" stroke-width="4"/>',
  ),
  hint: figmaStroke(
    '<path d="M14.4096 13.3332C15.7937 12.1116 16.6666 10.3243 16.6666 8.33317C16.6666 4.65128 13.6818 1.6665 9.99992 1.6665C6.31803 1.6665 3.33325 4.65128 3.33325 8.33317C3.33325 10.3243 4.20618 12.1116 5.59022 13.3332"/><path d="M10 9.1665V13.3332"/><path d="M7.08325 15.8335H12.9166"/><path d="M8.33325 18.3335H11.6666"/>',
  ),
  undo: figmaStroke(
    '<path d="M3.3269 1.6665V4.27666C3.3269 4.52155 3.63294 4.6324 3.78963 4.44428C5.31474 2.73942 7.53106 1.6665 9.99783 1.6665C14.5978 1.6665 18.3269 5.39746 18.3269 9.99984C18.3269 13.2983 16.4115 16.1493 13.6327 17.4998"/><path d="M9.77241 18.3337C10.1615 18.3337 10.5444 18.3077 10.9194 18.2573M1.8813 7.22266C1.78763 7.55365 1.71413 7.88816 1.66016 8.22454M1.68896 11.2821C1.74755 11.6155 1.82386 11.9456 1.91726 12.2707M3.18758 14.9973C3.38619 15.2918 3.60148 15.5753 3.83273 15.8459M6.18396 17.801C6.47872 17.9697 6.78551 18.1223 7.10371 18.2573"/>',
  ),
  /** Hand-drawn rule used under the top bar and above the controls. */
  separator: `<svg viewBox="0 0 390 2" preserveAspectRatio="none" fill="currentColor" aria-hidden="true"><path d="M390 1.64876V1L386.87 0.857143L390 0.48231L388.76 0.351249H286.453L280.449 0.571429L282.113 0.351249L272.311 0.285714L274.815 0.714286L259.171 0.351249H173.403L162.761 0.714286L158.379 0.351249H142.103V0L133.965 0.351249H29.8987L22.5361 0.571429L21.4894 0.351249H3.09424L1.23412 0.442992V0.639584L3.75602 0.714289L1.25201 0.922677L1.23412 1.28179L0 1.28571L1.23412 1.67497L3.71429 1.77982L68.4724 1.97606L78.2504 1.57143L76.3724 2L91.1553 1.77982L123.949 1.57143L133.03 1.77982L132.087 2L161.509 1.77982H227.363L243.515 1.42857L244.724 1.77982H386.466L390 1.64876Z"/></svg>`,
  pause: stroke('<path d="M9 5v14M15 5v14"/>', 1.6),
  play: fill('M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5Z'),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
  back: stroke('<path d="M15 5l-7 7 7 7"/>', 2.4),
  search: stroke('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>', 2.2),
  copy: stroke('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>', 1.8),
  /** Square code (a puzzle's shareable code): a brush-style megaphone calling it out (icons/build_megaphone.py), one image per theme. */
  square: brush(megaphoneLight, 'ic-light') + brush(megaphoneDark, 'ic-dark'),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7"/>', 2.6),
  lock: stroke('<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  crown: fill('M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5Z M5 19h14v2H5Z'),
  dust: fill('M12 2.5 18 9l-6 12.5L6 9Z M5 4.5l1 1.8L8 7 6 7.8 5 9.8 4 7.8 2 7l2-.7Z'),
  pencil: stroke('<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/><path d="M13.5 7l3.5 3.5"/>'),
  sun: stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  /** Add to Home Screen: a phone with an app tile on it. */
  phone: stroke('<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 18.5h3"/><rect x="9.5" y="7.5" width="5" height="5" rx="1"/>', 1.8),
  moon: fill('M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5 8.5 8.5 0 1 0 20.5 14.6Z'),
} as const;
