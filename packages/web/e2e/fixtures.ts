import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test starts as a fresh guest with the backend and the captcha blocked
 * (no account is ever created), the theme of its project, and the tutorial already seen.
 */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use, info) => {
    await page.route(/supabase\.co|challenges\.cloudflare\.com/, (route) => route.abort());
    const theme = info.project.name === 'light' ? 'light' : 'dark';
    await page.addInitScript((t) => {
      if (sessionStorage.getItem('a11y-test-ready')) return;
      sessionStorage.setItem('a11y-test-ready', '1');
      localStorage.setItem('elomental:theme', JSON.stringify(t));
      localStorage.setItem('elomental:tutorial-done', 'true');
    }, theme);
    await page.goto('/');
    // The splash is a button: skip it (it also turns away by itself after a moment, so a
    // click that lands as it goes isn't waited on).
    await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
    await expect(page.locator('.tile.area-casual')).toBeVisible();
    // Home's tiles swing in one after another: a click on one still turning can miss it.
    await settled(page);
    await use(page);
  },
});

export { expect };

/**
 * axe-core with the WCAG 2.0-2.2 A/AA rules and best practices. `meta-viewport`
 * is the one documented exception: pinch zoom stays off on phones and Text
 * size (to 200%) meets WCAG 1.4.4 instead (docs/ACCESSIBILITY_AUDIT.md, D1).
 */
export async function axe(page: Page) {
  // Page turns and tiles fade in; contrast is only meaningful once they've settled.
  await settled(page);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .disableRules(['meta-viewport'])
    .analyze();
  return result.violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

/**
 * The top edge of every scrolling area (the owner's standing check): at the top of its scroll,
 * the first control in it must start at least 6px below the area's top edge, or its focus ring
 * (a 4px double outline, 2px out) is cut off by the area, as happened on Founder tools.
 */
export async function topEdgeProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((where) => {
    const out: string[] = [];
    for (const area of document.querySelectorAll<HTMLElement>('.scrollable')) {
      if (area.scrollTop > 0 || !area.offsetParent) continue;
      const first = area.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
      if (!first) continue;
      const box = (first.closest('.review-search') ?? first).getBoundingClientRect();
      const top = area.getBoundingClientRect().top;
      if (box.top - 6 < top - 0.5) out.push(`${where}: the first control's focus ring is cut at the top of .${area.className.split(' ').join('.')} (${Math.round(box.top - top)}px of room, needs 6)`);
    }
    return out;
  }, where);
}

/** Waits until no animation on the page is still running (page turns, tile entries). */
export async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
}

// --- Signed in (layout-signed-in.spec.ts) ----------------------------------------------------

const REF = 'xekeiwaxxsmvalezgtyj';
const UID = '11111111-2222-3333-4444-555555555555';
/** Names as long as the server allows (20 characters, core_schema.sql) appear too, without spaces. */
const LONG_NAME = 'Bartholomew_Fairweat';
const ME = 'Wilhelmina.Ashcombe';
const NAMES = ['Mira Vance', 'Silent Architect', LONG_NAME, 'Kestrel', 'Bogdan', 'Old Owl', 'Ines', 'Rowan', 'Catalina', 'Felix'];
const FACES = ['happy', 'calm', 'silly', 'tired', 'excited', 'scared', 'shocked', 'angry', 'sad', 'bored'];
const ELEMENTS = ['fire', 'water', 'earth', 'air'];

/** The five frames, plainest first. */
const FRAMES = ['bronze', 'silver', 'gold', 'epic', 'mythic'];

/** A season's parts (the live catalogue's shape): 12 avatars and the 5 frames. */
function catalogue() {
  const parts: Record<string, unknown>[] = [{ id: 's0-avatar-happy', slot: 'avatar', rarity: 'common', source: 'starter' }];
  for (const [n, r] of [['bored', 'common'], ['calm', 'common'], ['upset', 'common'], ['sad', 'common'], ['disappointed', 'common'], ['silly', 'rare'], ['angry', 'rare'], ['tired', 'rare'], ['excited', 'epic'], ['scared', 'epic'], ['shocked', 'mythic']])
    parts.push({ id: `s0-avatar-${n}`, slot: 'avatar', rarity: r, source: 'craft' });
  for (const [t, r] of [['bronze', 'common'], ['silver', 'common'], ['gold', 'rare'], ['epic', 'epic'], ['mythic', 'mythic']]) parts.push({ id: `s0-frame-${t}`, slot: 'frame', rarity: r, source: 'craft' });
  return parts;
}

const rows = (from: number, n: number, base: number, mePlace = 0) =>
  Array.from({ length: n }, (_, i) => {
    const place = from + i;
    return {
      place, id: `00000000-0000-0000-0000-${String(place).padStart(12, '0')}`,
      name: place === mePlace ? ME : `${NAMES[place % NAMES.length]}${place > NAMES.length ? ` ${place}` : ''}`,
      title: place === 2 ? 'Founder' : null, elo: base - i * 23, value: base - i * 23, plate: place <= 4 ? [0, 5, 4, 3, 2][place] : 0,
      avatar: `s0-avatar-${FACES[place % FACES.length]}`, frame: place % 3 ? `s0-frame-${FRAMES[place % 5]}` : null,
      alive: place === 1, affinity: ELEMENTS[place % 4], country: 'RO', me: place === mePlace,
    };
  });

/**
 * Signs the page in as a sample player, with every server call answered by fakes (no live
 * data): parts, plates, Stardust, an affinity, badges, the leaderboard and a player card.
 * `affinity: null` (with 3 solves) makes the Profile ask for a faction; `monthWon` leaves last month's
 * win unseen, so Home shows it; `lossRun` sets the Ranked losses in a row (2: a comeback square).
 */
export async function signedIn(page: Page, opts: { affinity?: string | null; textSize?: number; anonymous?: boolean; monthWon?: boolean; lossRun?: number } = {}) {
  const anonymous = !!opts.anonymous;
  const affinity = opts.affinity === undefined ? 'fire' : opts.affinity;
  const profile = { display_name: ME, title: null, name_changed_at: null, elo: 930, rank_tier: 2, ranked_loss_run: opts.lossRun ?? 0, ranked_games: 80, stardust: 6400, spirits: 1, settings: {}, affinity, plate: 2, xp: 1200, affinity_season: null, showcase: [] };
  const standings = [{ affinity: 'fire', members: 41, influence: 9840, standing: 240 }, { affinity: 'water', members: 12, influence: 3240, standing: 270 }, { affinity: 'earth', members: 28, influence: 5600, standing: 200 }, { affinity: 'air', members: 33, influence: 6000, standing: 182 }];
  const tables: Record<string, unknown[]> = {
    profiles: [profile], parts: catalogue(),
    player_parts: [
      ...[['s0-avatar-calm', 1], ['s0-avatar-silly', 0], ['s0-avatar-disappointed', 0], ['s0-frame-gold', 0]].map(([id, polish]) => ({ part_id: id, edition: null, polish, wins: id === 's0-frame-gold' ? 57 : 0, gilded: false })),
      // marks and gilding: a gilded frame, and one with 3 marks still to gild
      { part_id: 's0-frame-bronze', edition: null, polish: 0, wins: 120, gilded: true },
      { part_id: 's0-frame-silver', edition: null, polish: 0, wins: 120, gilded: false },
    ],
    avatar_loadouts: [{ avatar: 's0-avatar-calm', frame: 's0-frame-gold' }],
    // blueprints (migration blueprints): a free Common avatar, an Epic frame for 200
    player_blueprints: [{ part_id: 's0-avatar-bored' }, { part_id: 's0-frame-epic' }],
    player_badges: [{ badge: 'daily-2026-10', earned_at: '2026-10-20' }, { badge: 'win-2026-09-fire', earned_at: '2026-10-01' }],
    games: [], daily_mends: [], seasons: [{ id: 0, starts_at: new Date(Date.now() - 2 * 86400000).toISOString() }],
  };
  const updated = new Date(Date.now() - 3 * 60000).toISOString();
  const rpc: Record<string, unknown> = {
    lb_page: { view: 'global', scope: null, page: 0, rows: rows(1, 30, 1650, 0), total: 12480, updated },
    lb_around_me: { scope: null, place: 48, rows: rows(38, 21, 1160, 48), listed: true, updated },
    lb_me: { place: 48, total: 12480, scope: null, elo: 930, rated: true, hidden: false, restricted: false, listed: true, value: 930 },
    lb_tiers: { total: 12480, tiers: [{ floor: 0, players: 4100 }, { floor: 300, players: 3900 }, { floor: 600, players: 2900 }, { floor: 1000, players: 1450 }, { floor: 1450, players: 130 }] },
    faction_board: { month: '2026-10-01', endsAt: '2026-11-01T00:00:00Z', mine: affinity, myInfluence: 54, mySolves: 9, myPlace: 12, standings,
      top: rows(1, 10, 0).map((r, i) => ({ id: r.id, name: r.name, influence: 300 - i * 20 })), lastWinner: { month: '2026-09-01', winner: 'fire', winners: ['fire', 'water'] } },
    affinity_standings: standings,
    // no Daily reminder set yet (migration daily_reminders)
    reminder_get: { hour: null, tz: null, push: false, email: false, emailOk: !anonymous, devices: 0 },
    player_card: { id: 'x', name: LONG_NAME, title: 'Founder', elo: 1612, tier: 4, plate: 5, level: 82, avatar: 's0-avatar-calm', frame: 's0-frame-epic', alive: true, peak: 1640, place: 2, notRanked: false,
      affinity: 'fire', country: 'RO', stats: { solved: 2840, ranked: 1120 }, badges: ['win-2026-09-water', 'daily-2026-10', 'win-2026-07-earth'], showcase: ['win-2026-09-water', 'daily-2026-10', 'win-2026-07-earth'], following: false, me: false },
  };
  // Anything not faked below never leaves the browser (routes added later are tried first).
  await page.route(/supabase\.co|challenges\.cloudflare\.com/, (route) => route.abort());
  await page.route(/supabase\.co\/(auth|functions)\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/supabase\.co\/rest\/v1\//, (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const fn = url.pathname.match(/\/rpc\/(\w+)/)?.[1];
    if (fn) return json(rpc[fn] ?? null);
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/40', 'access-control-expose-headers': 'content-range', 'access-control-allow-origin': '*' }, body: '' });
    const found = tables[url.pathname.split('/').pop()!] ?? [];
    const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
    return json(single ? (found[0] ?? null) : found);
  });
  await page.addInitScript(([ref, uid, affinity, textSize, anonymous, monthWon]) => {
    if (sessionStorage.getItem('signed-in-ready')) return;
    sessionStorage.setItem('signed-in-ready', '1');
    localStorage.setItem('elomental:tutorial-done', 'true');
    localStorage.setItem('elomental:install-note', '-1');
    if (!monthWon) localStorage.setItem('elomental:month-won-seen', JSON.stringify(['win-2026-09-fire']));
    if (textSize) localStorage.setItem('elomental:a11y', JSON.stringify({ textSize }));
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'x', refresh_token: 'y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: uid, is_anonymous: anonymous, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' } }));
    localStorage.setItem('elomental:account', JSON.stringify({ userId: uid, anonymous, email: 'test@example.com', name: ME, title: null, nextNameChange: null, elo: 930, tier: 2, lossRun: 0, rankedGames: 80,
      stardust: 6400, spirits: 1, daily: {}, mended: {}, affinity, solved: 40, plate: 2, xp: 1200, showcase: [] }));
  }, [REF, UID, affinity, opts.textSize ?? 0, anonymous, !!opts.monthWon] as const);
}

// --- Layout (layout.spec.ts, layout-signed-in.spec.ts) ---------------------------------------

export const DEVICES = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet upright', width: 768, height: 1024 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1302, height: 735 },
];
export const SIZES = [100, 125, 150, 200];

/** Elements that frame content: text must stay inside the nearest one. */
const BOXES =
  'button, a.btn, .tile, .setting, .modal, .profile-card, .coach-card, .resume-card, .friend-option, .subbar, .key, .action, .cell, .segment, .difficulty, .month-card, .reward-card, ' +
  '.forge-head, .part-card, .plate-card, .affinity-card, .lb-me, .lb-faction, .profile-section, .lb-who, .lb-leader-name, .door, .page-banner, .lb-podium, .pennant';
/** Rows and grids whose children must not overlap one another. */
const ROWS =
  '.home-grid, .profile-card, .pc-badges, .subbar, .segmented, .pad, .actions-row, .difficulty-picker, .friend-card, .topbar, .status, .casual-head, .coach-actions, .calendar, ' +
  '.part-grid, .plate-grid, .affinity-grid, .lb-strength-legend, .lb-me, .lb-tabs, .lb-meta-row, .badge-grid, .lb-row-btn, .lb-leader, ' +
  '.door-row, .door, .lb-controls, .lb-top, .lb-podium, .lb-pennants, .page-banner';

/** What runs out of its box, off the screen, or over its neighbours, on the page as it is now. */
export async function problems(page: Page, where: string): Promise<string[]> {
  await test.step(`settle: ${where}`, () => settled(page));
  return page.evaluate(
    ([BOXES, ROWS, where]) => {
      const out: string[] = [];
      const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 18)}"`;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('.sr-only, [aria-hidden="true"]');
      };
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`${where}: page scrolls sideways`);
      // Leaf text: inside its box and on screen.
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (!visible(el) || el.closest('.board, .welcome, .brand-banner, svg')) continue;
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!ownText) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        // (a row that scrolls sideways on purpose, like the leaderboard tabs, may hold more than it shows)
        const scrollsSideways = (row: Element | null) => !!row && /auto|scroll/.test(getComputedStyle(row).overflowX);
        if ((t.right > innerWidth + 1 || t.left < -1) && !scrollsSideways(el.closest('.lb-tabs'))) out.push(`${where}: off screen ${name(el)}`);
        const box = el.closest(BOXES);
        if (box && box !== el.closest('.subbar')) {
          const b = box.getBoundingClientRect();
          // A box that scrolls may hold more than it shows, top to bottom.
          const scrolls = /auto|scroll/.test(getComputedStyle(box).overflowY);
          const outY = !scrolls && (t.top < b.top - 2 || t.bottom > b.bottom + 2);
          if (t.left < b.left - 1 || t.right > b.right + 1 || outY) out.push(`${where}: text outside its box ${name(el)} in ${name(box)}`);
        }
        // (a long name on a leaderboard row may end in … at normal text; at larger text it wraps)
        const rowName = el.closest('.lb-row-btn') && !document.documentElement.hasAttribute('data-large-text');
        if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && !rowName) out.push(`${where}: cut off ${name(el)}`);
      }
      // Siblings in a row or grid: no overlap.
      for (const row of document.querySelectorAll(ROWS)) {
        if (!visible(row)) continue;
        const kids = [...row.children].filter((k) => visible(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
        for (let i = 0; i < kids.length; i++) {
          for (let j = i + 1; j < kids.length; j++) {
            const a = kids[i].getBoundingClientRect();
            const b = kids[j].getBoundingClientRect();
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 1 && h > 1) out.push(`${where}: overlap ${name(kids[i])} / ${name(kids[j])}`);
          }
        }
      }
      return [...new Set(out)];
    },
    [BOXES, ROWS, where] as const,
  );
}

/**
 * Ways into the pages that are a button on a phone and a door on a wide screen (banner.css):
 * Setup's Accessibility and Privacy, and Casual's play.
 */
export const openAccessibility = (page: Page) => page.locator('.setting:has-text("Accessibility") .btn, .setup-door.a11y-door').first().click();
export const openPrivacy = (page: Page) => page.locator('.setting:has-text("Leaderboard and card") .btn, .setup-door.privacy-door').first().click();
export const playCasual = (page: Page) => page.getByRole('button', { name: /^Play / }).first().click();

/** Start a Casual Easy game from Home using only the keyboard. */
export async function startCasualByKeyboard(page: Page) {
  await page.locator('.tile.area-casual').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle(/^Casual/);
  // a phone picks Easy, then plays; a wide screen has a door for it
  const door = page.getByRole('button', { name: /^Play Easy\./ });
  if (!(await door.count())) {
    await page.getByRole('radio', { name: 'Easy' }).focus();
    await page.keyboard.press('Enter');
  }
  await (await door.count() ? door : page.getByRole('button', { name: 'Play Easy' })).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('grid', { name: 'Sudoku board' })).toBeVisible({ timeout: 20_000 });
}
