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
import walletDark from './art/wallet-dark.png';
import walletLight from './art/wallet-light.png';
import sword from './art/sword.png';
import swordFlame from './art/sword-flame.png';
import swordBody from './art/sword-body.png';
import clashDark from './art/clash-dark.png';
import clashLight from './art/clash-light.png';
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
  /** Clash: a fist bump, two brush-outlined fists meeting with impact lines (icons/build_clash.py), one image per theme. */
  clash: brush(clashLight, 'ic-light') + brush(clashDark, 'ic-dark'),
  // Mode-tile icons sit on fixed-colour tiles, so one export serves both themes.
  /** Brush-style calendar: the days crossed off, today ticked; drawn for the Crimson tile. */
  daily: brush(calendar),
  /** Brush-style feather with a Lava shaft, drawn for the Forest tile and badge. */
  casual: brush(feather),
  /** Brush-style sword wrapped in one flame, drawn for the Lava tile and the Ranked pop-up badge. */
  ranked: brush(sword),
  /**
   * The same sword in two layers for the Ranked pop-up: the flame behind (it flickers,
   * `.sword-live` in styles.css) and the sword in front. Stacked, they match `ranked`.
   */
  rankedLive: `<span class="sword-live">${brush(swordFlame, 'sword-flame')}${brush(swordBody)}</span>`,
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
