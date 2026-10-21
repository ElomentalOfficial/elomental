import { difficultyForRating, rankedStage } from '@elomental/engine';
import { avatarSvg } from '../avatar.ts';
import { cachedAccount } from '../backend/account.ts';
import { cachedLoadout, cachedPolish, loadLoadout } from '../backend/forge.ts';
import { recentWins } from '../backend/leaderboard.ts';
import { badgeArt, badgeLabel, badgeMonth } from '../badges.ts';
import { ICONS } from '../icons.ts';
import { rankName } from '../rankName.ts';
import { levelBadge, xpLevel } from '../level.ts';
import { paintPlate } from '../plates.ts';
import { readJson, writeJson } from '../storage.ts';
import { profileScreen } from './profile.ts';
import { addToHomeNote, countNoteVisit } from '../install.ts';
import { openLazy, prefetch } from '../lazy.ts';
import { enableTilt, turnstileIn, turnstileOut } from '../motion.ts';
import {
  eloDelta,
  loadProfile,
  parMs,
  rankTier,
  rankedOpponent,
  rankedStageFor,
  stageIntroduces,
  stageRating,
} from '../profile.ts';
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

  // The avatar: the player's forged loadout (avatar.ts), and the way into their profile.
  const avatarBtn = h('button', { class: 'avatar avatar-btn', attrs: { type: 'button', 'aria-label': copy.profile.a11yAvatar } });
  // Happy until another avatar is worn (avatar.ts)
  const paintAvatar = (loadout = cachedLoadout()) => {
    avatarBtn.innerHTML = avatarSvg(loadout, cachedPolish());
    avatarBtn.classList.add('worn');
  };
  paintAvatar();
  if (signedIn()) void loadLoadout().then((l) => l && el.isConnected && paintAvatar(l));
  avatarBtn.addEventListener('click', () => leave(profileCard, () => mount(profileScreen())));
  enableTilt(avatarBtn, 6);

  const nameEl = h('strong', { class: 'profile-name' });
  const rankEl = h('span', { class: 'profile-rank' });
  const eloChip = stat('', copy.common.elo);
  const dustChip = stat('', copy.common.stardust, ICONS.dust);
  const spiritChip = stat('', copy.common.spirits, ICONS.spirit);
  const stats = h('div', { class: 'profile-stats' }, eloChip, dustChip, spiritChip);
  /** Signed in, the numbers come from the server cache and update when it refreshes. */
  const paintProfile = () => {
    const p = loadProfile();
    // on the name plate bought with Stardust (plates.ts), if any
    paintPlate(nameEl, p.name, cachedAccount()?.plate ?? 0);
    // the rank's name in its colours, after the player's title if they have one
    const tier = rankTier(p.elo, p.tier);
    // and the account level beside it, once there's an account to keep it
    const account = cachedAccount();
    rankEl.replaceChildren(rankName(tier.tier, tier.label, p.title), account ? levelBadge(xpLevel(account.xp ?? 0).level) : '');
    eloChip.querySelector('strong')!.textContent = copy.formatNumber(p.elo);
    dustChip.querySelector('strong')!.textContent = copy.formatNumber(p.dust);
    spiritChip.querySelector('strong')!.textContent = copy.formatNumber(p.spirits);
    spiritChip.lastElementChild!.textContent = copy.common.spiritsLabel(p.spirits);
    // Spirits are rare (months for most players): the chip shows once there's one (decision D6)
    spiritChip.hidden = p.spirits === 0;
    stats.classList.toggle('two', p.spirits === 0);
  };
  const profileCard = h(
    'section',
    { class: 'profile-card area-profile' },
    h(
      'div',
      { class: 'profile-main' },
      avatarBtn,
      nameEl,
      rankEl,
    ),
    stats,
    h('div', { class: 'setup-notch' }, setupTile),
  );
  setupTile.addEventListener('click', () => leave(profileCard, () => mount(setupScreen())));

  const daily = tile('daily', ICONS.daily, copy.home.tiles.daily, (el) => leave(el, () => mount(dailyScreen())));
  paintProfile();
  const stopProfile = onAccountChange(paintProfile);
  if (signedIn()) void refreshAccount();
  // the leaderboard is split off the main script (lazy.ts): fetched ahead, it opens at once
  if (signedIn()) prefetch(() => import('./leaderboard.ts'));
  // The Store stays, so players know it's coming (the owner's call on D1); the Forge is on the Profile.
  const store = tile('store', ICONS.store, copy.home.tiles.store, () => toast(copy.home.storeLater));
  const leader = tile('leader', ICONS.leaderboard, copy.home.tiles.leaderboard, (el) =>
    signedIn() ? openLazy(() => import('./leaderboard.ts'), (m) => leave(el, () => mount(m.leaderboardScreen()))) : toast(copy.leaderboard.offline));
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
    const spills = () => stats.getBoundingClientRect().bottom > profileCard.getBoundingClientRect().bottom + 1;
    if (note) {
      if (spills()) {
        note.remove();
        animated.pop();
      } else countNoteVisit();
    }
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
  // Your side won last month: once, a calm sheet with what it brought (full review M12).
  setTimeout(() => {
    if (el.isConnected && !leaving && signedIn()) {
      void showMonthWon(
        () => el.isConnected && !leaving,
        () => leave(profileCard, () => mount(profileScreen({ at: 'badges' }))),
      );
    }
  }, 900);

  return { el, destroy: stopProfile };
}

/** A stat: icon, number, name. Elo has no icon, but keeps the row so the numbers line up. */
function stat(value: string, label: string, icon = ''): HTMLElement {
  return h(
    'div',
    { class: 'stat-chip' },
    h('span', { class: 'stat-icon', html: icon, attrs: { 'aria-hidden': 'true' } }),
    h('strong', { text: value }),
    h('span', { text: label }),
  );
}

const MONTH_WON_KEY = 'elomental:month-won-seen';

/**
 * Once per win: the newest "your side won" badge (win-YYYY-MM-element, paid by
 * settle_faction_month with 300 Stardust) not yet shown, if it came in the last 3 weeks.
 */
async function showMonthWon(stillHome: () => boolean, toBadges: () => void): Promise<void> {
  const won = await recentWins();
  // the answer can come after the player has left Home: then it waits for the next visit
  if (!stillHome() || document.querySelector('.modal')) return;
  const seen = readJson<string[]>(MONTH_WON_KEY) ?? [];
  const badge = won.find((b) => !seen.includes(b));
  if (!badge) return;
  writeJson(MONTH_WON_KEY, [...seen, badge].slice(-12));
  const { element } = badgeLabel(badge);
  const month = badgeMonth(badge);
  const m = copy.home.monthWon;
  const close = openModal(
    h(
      'div',
      { class: 'sheet month-won' },
      closeButton(() => close()),
      h('span', { class: 'badge-medal month-won-art', html: badgeArt(badge), attrs: { 'aria-hidden': 'true' } }),
      h('h2', { text: m.title(element ? copy.forge.elements[element] : '', month) }),
      h('p', { text: m.text(month) }),
      // a guest account's Profile has no badges section (it can still win): just close
      cachedAccount()?.anonymous
        ? h('button', { class: 'btn btn-primary', text: copy.common.close, attrs: { type: 'button' }, onclick: () => close() })
        : h('button', { class: 'btn btn-primary', text: m.badges, attrs: { type: 'button' }, onclick: () => { close(); toBadges(); } }),
    ),
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
  const saved = loadSavedGame('ranked');
  if (saved?.config.mode === 'ranked') return leave(() => resumeGame(saved));
  const profile = loadProfile();
  // the stage the next game deals (the server decides; this is the same rule)
  const stage = rankedStageFor(profile.elo, profile.lossRun);
  const comeback = stage < rankedStage(profile.elo);
  const target = stageRating(stage);
  const difficulty = difficultyForRating(target);
  // what a player 35–45 wants to know before starting: how long, and what's at stake
  const r = copy.home.ranked;
  const facts = [
    r.rank(rankTier(profile.elo, profile.tier).label, profile.elo),
    r.length(Math.round(parMs(target) / 60_000), Math.round((2 * parMs(target)) / 60_000)),
    r.stakes(eloDelta(profile.elo, rankedOpponent(profile.elo), true), -eloDelta(profile.elo, rankedOpponent(profile.elo), false)),
    comeback ? r.comeback : null,
    r.pauses,
  ].filter((f): f is string => !!f);
  // the first square from a stage that brings in a technique family: a word on it, once
  const fresh = newTechnique(stage);
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      closeButton(() => close()),
      heatingSword(h('span', { class: 'sheet-icon ranked', html: ICONS.rankedLive, attrs: { 'aria-hidden': 'true' } })),
      h('h2', { text: copy.home.ranked.title }),
      h('p', { class: 'ranked-copy', text: copy.home.ranked.text }),
      h('ul', { class: 'ranked-facts' }, ...facts.map((f) => h('li', { text: f }))),
      fresh
        ? h('div', { class: 'ranked-new' }, h('h3', { text: r.newTechnique.title }), h('p', { text: r.newTechnique[fresh] }))
        : null,
      h('button', {
        class: 'btn btn-primary btn-start',
        text: copy.home.ranked.start,
        onclick: () => {
          close();
          // told once: this family and every one before it
          if (fresh) markTechniquesSeen(stage);
          leave(() => void startGame({ mode: 'ranked', difficulty }));
        },
      }),
    ),
  );
}

/** Technique families this phone has had the "new in your Ranked squares" word on. */
const TECHNIQUES_SEEN_KEY = 'elomental:techniques-seen';

/** The newest family a stage's squares can need, if this phone hasn't been told about it yet. */
function newTechnique(stage: number): NonNullable<ReturnType<typeof stageIntroduces>> | null {
  const seen = readJson<string[]>(TECHNIQUES_SEEN_KEY) ?? [];
  for (let s = stage; s >= 0; s--) {
    const family = stageIntroduces(s);
    if (family) return seen.includes(family) ? null : family;
  }
  return null;
}

function markTechniquesSeen(stage: number): void {
  const seen = new Set(readJson<string[]>(TECHNIQUES_SEEN_KEY) ?? []);
  for (let s = stage; s >= 0; s--) {
    const family = stageIntroduces(s);
    if (family) seen.add(family);
  }
  writeJson(TECHNIQUES_SEEN_KEY, [...seen]);
}
