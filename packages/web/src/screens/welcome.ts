import { peelRibbon } from '../fabric.ts';
import { applyTheme } from '../theme.ts';
import { h, mount, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';

/**
 * Welcome (Figma "welcome screen"): the copper ribbon fades in with
 * E L O / M E N / T A L on it and "Competitive sudoku" beneath, holds a
 * moment, then flips up and away to reveal Home, which is already
 * turning in behind it. Drawn in the frame's own 390×844 coordinates so it
 * scales to any phone. A tap skips straight to the flip.
 */
const RIBBON =
  'M42 0H347V152L336 196L347 188V740L291 694L300 688L253 664L244 630L236 678L178 653L126 630L170 657L49 723L42 718V388L54 386L42 366Z';

const LETTERS: { ch: string; x: number; y: number }[] = [
  { ch: 'E', x: 134, y: 278 },
  { ch: 'L', x: 195, y: 278 },
  { ch: 'O', x: 256, y: 278 },
  { ch: 'M', x: 134, y: 353 },
  { ch: 'E', x: 195, y: 353 },
  { ch: 'N', x: 256, y: 353 },
  { ch: 'T', x: 134, y: 428 },
  { ch: 'A', x: 195, y: 428 },
  { ch: 'L', x: 256, y: 428 },
];

/** When the ribbon starts to peel away: everything has faded in (~1.6s) and had time to be read. */
const HOLD_MS = 2800;
/** The splash page fading out over Home (matches .welcome.fading-out). */
const FADE_MS = 550;

export function welcomeScreen(): Screen {
  const letters = LETTERS.map(
    (l, i) => `<text x="${l.x}" y="${l.y}" style="animation-delay:${250 + i * 70}ms">${l.ch}</text>`,
  ).join('');

  const el = h('button', {
    class: 'screen welcome',
    attrs: { 'aria-label': 'Elomental. Tap to continue.' },
    html:
      `<svg class="welcome-art" viewBox="0 0 390 844" preserveAspectRatio="xMidYMin meet" aria-hidden="true">` +
      `<g class="ribbon"><path d="${RIBBON}"/><g class="wordmark">${letters}</g></g>` +
      `<text class="tagline" x="195" y="800">Competitive sudoku</text>` +
      `</svg>`,
  });

  // The page behind the ribbon is the theme's own colour, so the splash flows
  // into Home in light and dark alike (welcome-active hides the status strip
  // while the ribbon runs up under the status bar).
  document.documentElement.classList.add('welcome-active');

  let done = false;
  const flip = () => {
    if (done) return;
    done = true;
    // The ribbon peels away like a piece of cloth (fabric.ts) over the plain
    // page. Once it has gone, Home mounts underneath and the page
    // fades out over it, so the reveal is soft rather than a cut.
    const art = el.querySelector<SVGSVGElement>('.welcome-art')!;
    const peel = peelRibbon(art);
    el.classList.add('flipping');
    void peel.then(() => {
      document.body.append(el);
      el.classList.add('fading-out');
      mount(homeScreen());
      setTimeout(() => el.remove(), FADE_MS);
    });
  };
  const timer = setTimeout(flip, HOLD_MS);
  el.addEventListener('click', flip);

  return {
    el,
    destroy() {
      clearTimeout(timer);
      document.documentElement.classList.remove('welcome-active');
      applyTheme();
    },
  };
}
