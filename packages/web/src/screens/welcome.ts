import { applyTheme } from '../theme.ts';
import { h, mount, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';

/**
 * Welcome frame from Figma: a torn Forest ribbon unfurls from the top, then
 * E-L-O / M-E-N / T-A-L appear letter by letter. Drawn in the frame's own
 * 390×844 coordinates so it scales to any phone.
 */
const RIBBON =
  'M42 0H347V152L336 196L347 188V740L291 694L300 688L253 664L244 630L236 678L178 653L126 630L170 657L49 723L42 718V388L54 386L42 366Z';

const LETTERS: { ch: string; x: number; y: number; dark?: boolean }[] = [
  { ch: 'E', x: 134, y: 278 },
  { ch: 'L', x: 195, y: 278, dark: true },
  { ch: 'O', x: 256, y: 278 },
  { ch: 'M', x: 134, y: 353 },
  { ch: 'E', x: 195, y: 353 },
  { ch: 'N', x: 256, y: 353, dark: true },
  { ch: 'T', x: 134, y: 428, dark: true },
  { ch: 'A', x: 195, y: 428 },
  { ch: 'L', x: 256, y: 428 },
];

const DURATION_MS = 3000;

export function welcomeScreen(): Screen {
  const letters = LETTERS.map(
    (l, i) =>
      `<text x="${l.x}" y="${l.y}" class="${l.dark ? 'dark' : ''}" style="animation-delay:${1000 + i * 90}ms">${l.ch}</text>`,
  ).join('');

  const el = h('button', {
    class: 'screen welcome',
    attrs: { 'aria-label': 'Elomental. Tap to continue.' },
    html:
      `<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMin meet" aria-hidden="true">` +
      `<defs>` +
      `<clipPath id="unfurl"><rect class="unfurl" width="390" height="844"/></clipPath>` +
      `<linearGradient id="fold-shade" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".35"/>` +
      `<stop offset=".85" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<g class="ribbon" clip-path="url(#unfurl)"><path d="${RIBBON}"/>` +
      `<rect class="fold" x="42" y="-60" width="305" height="60" fill="url(#fold-shade)"/></g>` +
      `<g class="wordmark">${letters}</g>` +
      `</svg>`,
  });

  // The page stays dark behind the ribbon whatever the theme. The status bar keeps
  // the theme's colour: iOS sets it at launch and may not follow a later switch.
  document.documentElement.classList.add('welcome-active');

  let done = false;
  const next = () => {
    if (done) return;
    done = true;
    el.classList.add('leaving');
    setTimeout(() => mount(homeScreen()), 280);
  };
  const timer = setTimeout(next, DURATION_MS);
  el.addEventListener('click', next);

  return {
    el,
    destroy() {
      clearTimeout(timer);
      document.documentElement.classList.remove('welcome-active');
      applyTheme();
    },
  };
}
