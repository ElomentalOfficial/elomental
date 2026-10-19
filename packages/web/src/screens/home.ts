import { difficultyForRating } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { addToHomeNote, countNoteVisit } from '../install.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import { loadProfile, rankTitle, rankedTarget } from '../profile.ts';
import { closeButton, h, hiddenHeading, mount, navigatingBack, openModal, toast, type Screen } from '../ui.ts';
import { handleEmailLink } from '../emailLink.ts';
import { onAccountChange, refreshAccount, signedIn } from '../backend.ts';
import { casualScreen } from './casual.ts';
import { handleClashLink } from './clashSheet.ts';
import { dailyScreen } from './daily.ts';
import { loadSavedGame, resumeGame, startGame } from './game.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/** Layout from the Figma home frame: profile card with the Setup notch, then the mode tiles. */
export function homeScreen(): Screen {
  let leaving = false;

  /** Play the turnstile-out with `from` last, then run `then`. */
  const leave = async (from: HTMLElement, then: () => void) => {
    if (leaving) return;
    leaving = true;
    await turnstileOut(grid, animated, from);
    then();
  };

  function tile(area: string, icon: string, label: string, onTap: (el: HTMLElement) => void, ...extra: (HTMLElement | null)[]) {
    const face = h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: icon }), h('span', { class: 'tile-label', text: label }));
    const el = h('button', { class: `tile area-${area}` }, face, ...extra);
    el.addEventListener('click', () => onTap(el));
    enableTilt(el);
    return el;
  }

  const setupTile = h(
    'button',
    { class: 'tile tile-setup' },
    h('span', { class: 'tile-face' }, h('span', { class: 'tile-icon', html: ICONS.setup }), h('span', { class: 'tile-label', text: copy.home.tiles.setup })),
  );
  enableTilt(setupTile);

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const eloChip = stat('', copy.common.elo);
  const dustChip = stat('', copy.common.stardust, ICONS.dust);
  const crownChip = stat('', copy.common.crowns, ICONS.crown);
  /** Signed in, the numbers come from the server cache and update when it refreshes. */
  const paintProfile = () => {
    const p = loadProfile();
    nameEl.textContent = p.name;
    rankEl.textContent = p.title ?? rankTitle(p.elo);
    eloChip.querySelector('strong')!.textContent = String(p.elo);
    dustChip.querySelector('strong')!.textContent = String(p.dust);
    crownChip.querySelector('strong')!.textContent = String(p.crowns);
  };
  paintProfile();
  const stopProfile = onAccountChange(paintProfile);
  if (signedIn()) void refreshAccount();

  const profileCard = h(
    'section',
    { class: 'profile-card area-profile' },
    h(
      'div',
      { class: 'profile-main' },
      h('span', { class: 'avatar' }),
      nameEl,
      rankEl,
    ),
    h('div', { class: 'profile-stats' }, eloChip, dustChip, crownChip),
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, copy.home.tiles.daily, (el) => leave(el, () => mount(dailyScreen())));
  const store = tile('store', ICONS.store, copy.home.tiles.store, () => toast(copy.home.storeLater));
  const leader = tile('leader', ICONS.leaderboard, copy.home.tiles.leaderboard, () => toast(copy.home.leaderboardLater));
  const casual = tile('casual', ICONS.casual, copy.home.tiles.casual, (el) => leave(el, () => mount(casualScreen())));
  const ranked = tile('ranked', ICONS.ranked, copy.home.tiles.ranked, (el) => openRanked((go) => leave(el, go)));
  // Wide screens give Setup a tile of its own (Figma desktop home); phones keep it in the notch.
  const setupWide = tile('setup', ICONS.setup, copy.home.tiles.setup, (el) => leave(el, () => mount(setupScreen())));

  const tiles = [profileCard, daily, store, leader, casual, ranked, setupWide];
  const grid = h('div', { class: 'home-grid' }, ...tiles);
  // A few visits after the first game, on phones in the browser: Add to Home Screen (install.ts).
  const note = addToHomeNote();
  // The note turns in and out with the tiles, last in reading order.
  const animated = note ? [...tiles, note] : tiles;
  const el = h('div', { class: 'screen home' }, hiddenHeading(copy.common.appName), grid, note);

  /** Home fits the screen without scrolling, so on a short one (browser bars) the note
      would squeeze the tiles until the profile's stats spill out: there it stays away. */
  const fitNote = () => {
    if (!note) return;
    const card = profileCard.getBoundingClientRect();
    const stats = profileCard.querySelector('.profile-stats')!.getBoundingClientRect();
    if (stats.bottom > card.bottom + 1) {
      note.remove();
      animated.pop();
    } else countNoteVisit();
  };
  const enter = () => {
    fitNote();
    turnstileIn(grid, animated, backward);
  };

  // Runs right after mount, before the new screen is ever painted, so tiles never
  // flash in place. (A requestAnimationFrame is too late when Home is mounted from
  // an animation's end, as goBack does: that frame is painted first.)
  const backward = navigatingBack();
  queueMicrotask(() => {
    if (el.isConnected) enter();
    else requestAnimationFrame(enter);
  });
  setTimeout(() => handleClashLink((go) => leave(casual, go)), 420);
  setTimeout(() => void handleEmailLink(), 420);

  return { el, destroy: stopProfile };
}

function stat(value: string, label: string, icon?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat-chip' },
    icon ? h('span', { class: 'stat-icon', html: icon }) : null,
    h('strong', { text: value }),
    h('span', { text: label }),
  );
}

/**
 * The Ranked pop-up's sword: every tap or click heats the blade a step, from steel to
 * glowing like molten metal (its hot layer fades in, the flame swells, a glow spreads),
 * and it cools back down once the taps stop. Purely decorative, like the Casual feather:
 * no role, not in the tab order. `--heat` (0 to 1) drives it all in styles.css.
 */
function heatingSword(badge: HTMLElement): HTMLElement {
  const sword = () => badge.querySelector<HTMLElement>('.sword-live');
  let heat = 0;
  let lastTap = 0;
  let lastFrame = 0;
  let frame = 0;
  const paint = () => sword()?.style.setProperty('--heat', heat.toFixed(3));
  const cool = (now: number) => {
    // a short hold after each tap, then about four seconds from white-hot back to steel
    if (now - lastTap > 600) heat = Math.max(0, heat - ((now - lastFrame) / 1000) * 0.25);
    lastFrame = now;
    paint();
    frame = heat > 0 && badge.isConnected ? requestAnimationFrame(cool) : 0;
  };
  badge.addEventListener('pointerdown', () => {
    heat = Math.min(1, heat + 0.17);
    lastTap = lastFrame = performance.now();
    paint();
    if (!frame) frame = requestAnimationFrame(cool);
  });
  return badge;
}

function openRanked(leave: (go: () => void) => void) {
  const saved = loadSavedGame();
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  const difficulty = difficultyForRating(rankedTarget(profile.elo));
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      heatingSword(h('span', { class: 'sheet-icon ranked', html: ICONS.rankedLive, attrs: { 'aria-hidden': 'true' } })),
      h('h2', { text: copy.home.ranked.title }),
      h('p', { class: 'ranked-copy', text: copy.home.ranked.text }),
      h('button', {
        class: 'btn btn-primary btn-start',
        text: copy.home.ranked.start,
        onclick: () => {
          close();
          leave(() => void startGame({ mode: 'ranked', difficulty }));
        },
      }),
    ),
  );
}
