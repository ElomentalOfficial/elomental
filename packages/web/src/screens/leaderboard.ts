import { cachedAccount, onAccountChange } from '../backend.ts';
import { cachedLoadout, cachedPolish } from '../backend/forge.ts';
import {
  factionBoard,
  followingCount,
  lbAroundMe,
  lbMe,
  lbPage,
  lbTiers,
  searchPlayers,
  type FactionBoard,
  type LbMe,
  type LbRow,
  type LbView,
  type SearchHit,
} from '../backend/leaderboard.ts';
import { signUpForm } from '../accountForm.ts';
import { ICONS } from '../icons.ts';
import { paintPlate } from '../plates.ts';
import { cardAvatar, openPlayerCard } from '../playerCard.ts';
import { ELEMENTS, nextRank, rankTier, type Element } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { closeButton, goBack, h, mount, openModal, subPage, type Screen } from '../ui.ts';
import { affinityScreen } from './affinity.ts';
import { homeScreen } from './home.ts';
import { playerProfileScreen } from './player.ts';
import { privacyScreen } from './privacy.ts';
import * as copy from '../copy/en.ts';

/**
 * The leaderboard (docs/LEADERBOARD_DESIGN.md): the affinities' month at the top, a name
 * search, then one list at a time (Friends, Everyone, your affinity, the season, your
 * country), 50 rows a page, with "Show me" jumping to your spot and a pinned bar that
 * always says where you are. Rows and places come from a 5-minute server snapshot of
 * settled, unflagged results; tapping a player opens their show-off card.
 */

const VIEWS: LbView[] = ['friends', 'global', 'faction', 'season', 'country'];
const VIEW_KEY = 'elomental:lb-view';
const t = copy.leaderboard;

const monthName = (iso: string) => new Date(iso).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });

export function leaderboardScreen(start?: { view?: LbView; focus?: string }): Screen {
  let view: LbView = start?.view ?? readJson<LbView>(VIEW_KEY) ?? 'global';
  let page = 0;
  let rows: LbRow[] = [];
  let total = 0;
  let around = false;
  let focusId = start?.focus ?? null;

  // ---- the affinities this month (compact; details in a sheet)
  const faction = h('section', { class: 'lb-faction', attrs: { 'aria-busy': 'true' } }, h('p', { class: 'note', text: t.loading }));

  // ---- search
  const searchField = h('input', {
    class: 'text-field lb-search-field',
    attrs: { type: 'search', placeholder: t.searchPlaceholder, 'aria-label': t.search, autocomplete: 'off', enterkeyhint: 'search' },
  });
  const searchStatus = h('p', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
  const results = h('ul', { class: 'lb-list lb-results' });
  results.hidden = true;

  // ---- the list
  const tabs = VIEWS.map((v) =>
    h('button', { class: 'segment', attrs: { role: 'tab', type: 'button', 'data-view': v }, onclick: () => switchView(v) }));
  const meta = h('p', { class: 'lb-meta' });
  const ranksBtn = h('button', { class: 'link-btn', text: t.ranks, attrs: { type: 'button' }, onclick: () => openTiers() });
  const list = h('ol', { class: 'lb-list', attrs: { 'aria-live': 'polite', 'aria-busy': 'true' } });
  const more = h('button', { class: 'btn lb-more', text: t.showMore, attrs: { type: 'button' }, onclick: () => void load(page + 1) });
  const notice = h('div', { class: 'lb-notice' });
  const meBar = h('div', { class: 'lb-me', attrs: { role: 'region', 'aria-label': t.you } }, h('p', { class: 'note', text: t.meLoading }));

  const main = h(
    'div',
    { class: 'lb-main' },
    h('div', { class: 'lb-search' }, searchField, searchStatus),
    results,
    h('div', { class: 'lb-tabs segmented', attrs: { role: 'tablist', 'aria-label': t.a11yViews } }, ...tabs),
    h('div', { class: 'lb-meta-row' }, meta, ranksBtn),
    notice,
    list,
    more,
  );
  const body = h('div', { class: 'lb-layout' }, faction, main, meBar);
  const el = subPage({ className: 'leaderboard', title: t.title, onBack: () => void goBack(homeScreen) }, body);

  const myElement = (): Element | null => cachedAccount()?.affinity ?? null;

  function paintTabs() {
    tabs.forEach((b) => {
      const v = b.dataset.view as LbView;
      const label = v === 'faction' && myElement() ? copy.forge.elements[myElement()!] : t.views[v];
      b.textContent = label;
      b.classList.toggle('on', v === view);
      b.setAttribute('aria-selected', String(v === view));
    });
  }

  function switchView(v: LbView) {
    view = v;
    writeJson(VIEW_KEY, v);
    around = false;
    focusId = null;
    paintTabs();
    void load(0);
    void paintMe();
  }

  /** One row: place, avatar in its frame, name on its plate, rank and affinity, Elo. */
  function row(r: LbRow): HTMLElement {
    const tier = rankTier(r.elo, r.tier);
    const rank = r.title ?? tier.label;
    const name = h('strong', { class: 'lb-name' });
    paintPlate(name, r.name, r.plate);
    const isSeason = view === 'season';
    const label = isSeason ? t.a11ySeasonRow(r.place, r.name, r.value) : t.a11yRow(r.place, r.name, rank, r.elo);
    const placeCls = r.place <= 3 ? ` medal medal-${r.place}` : r.place <= 100 ? ' top100' : '';
    return h(
      'li',
      { class: `lb-row${r.me ? ' is-me' : ''}${r.id === focusId ? ' is-focus' : ''}` },
      h(
        'button',
        { class: 'lb-row-btn', attrs: { type: 'button', 'aria-label': label }, onclick: () => openCard(r.id) },
        h('span', { class: `lb-place${placeCls}`, text: String(r.place), attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'avatar lb-avatar worn', html: cardAvatar(r), attrs: { 'aria-hidden': 'true' } }),
        h(
          'span',
          { class: 'lb-who', attrs: { 'aria-hidden': 'true' } },
          name,
          h(
            'span',
            { class: 'lb-sub' },
            // one emblem per row (M31): the rank's; the side shows on the player's card
            h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier] }),
            h('span', { text: rank }),
          ),
        ),
        h(
          'span',
          { class: 'lb-score', attrs: { 'aria-hidden': 'true' } },
          h('strong', { text: copy.formatNumber(isSeason ? r.value : r.elo) }),
          h('span', { text: isSeason ? `${t.best} ${t.elo}` : t.elo }),
        ),
      ),
    );
  }

  function openCard(id: string) {
    openPlayerCard(id, {
      fullProfile: (c) => mount(playerProfileScreen(c, () => leaderboardScreen({ view }))),
      showOnBoard: (c) => {
        // jump the Everyone list to the page holding this player
        focusId = c.id;
        if (around) {
          // leave your own window, so the button says Show me again
          around = false;
          if (view === 'global') void paintMe();
        }
        if (view !== 'global') {
          view = 'global';
          paintTabs();
          void paintMe();
        }
        searchField.value = '';
        showSearch(false);
        // by position, not place: with ties, a shared place can sit on a later page
        void load(Math.floor(((c.position ?? c.place ?? 1) - 1) / 50), true);
      },
      followChanged: () => view === 'friends' && void load(0),
    });
  }

  function paintMeta(updated: string | null) {
    if (!updated) return void (meta.textContent = '');
    const min = Math.max(0, Math.floor((Date.now() - new Date(updated).getTime()) / 60000));
    // the Season list says what it ranks
    meta.textContent = view === 'season' ? `${t.seasonNote} ${t.updated(min)}.` : t.updated(min);
  }

  /** Empty and "you're not in this list" messages, with the way forward. */
  function paintNotice(empty: boolean) {
    notice.replaceChildren();
    if (!empty) return;
    const action =
      view === 'country' && !cachedAccount()?.country
        ? h('button', { class: 'btn', text: t.chooseCountry, attrs: { type: 'button' }, onclick: () => mount(privacyScreen(() => leaderboardScreen({ view: 'country' }))) })
        : view === 'faction' && !myElement()
          ? h('button', { class: 'btn', text: t.joinIn, attrs: { type: 'button' }, onclick: () => mount(affinityScreen(() => leaderboardScreen({ view }))) })
          : view === 'friends'
            ? h('button', { class: 'btn', text: t.search, attrs: { type: 'button' }, onclick: () => searchField.focus() })
            : null;
    const text = view === 'country' && !cachedAccount()?.country ? t.notInView.country : view === 'faction' && !myElement() ? t.notInView.faction : t.empty[view];
    notice.append(h('p', { class: 'note', text }), action ?? '');
  }

  async function load(p: number, keep = false) {
    list.setAttribute('aria-busy', 'true');
    if (p === 0 && !keep) list.replaceChildren(...Array.from({ length: 6 }, () => h('li', { class: 'lb-row placeholder', attrs: { 'aria-hidden': 'true' } })));
    const data = around ? await lbAroundMe(view) : await lbPage(view, p);
    list.setAttribute('aria-busy', 'false');
    if (!data) {
      list.replaceChildren();
      notice.replaceChildren(h('p', { class: 'note', text: t.offline }), h('button', { class: 'btn', text: t.retry, attrs: { type: 'button' }, onclick: () => void load(p) }));
      more.hidden = true;
      return;
    }
    page = around ? 0 : p;
    rows = around || p === 0 || keep ? data.rows : [...rows, ...data.rows];
    total = 'total' in data ? data.total : rows.length;
    list.replaceChildren(...rows.map(row));
    paintMeta(data.updated);
    paintNotice(rows.length === 0);
    more.hidden = around || rows.length >= total || (page + 1) * 50 >= total;
    // only after Show me, or Show on the leaderboard: never on a plain load
    if (around || focusId) list.querySelector(focusId ? '.is-focus' : '.is-me')?.scrollIntoView({ block: 'center' });
  }

  /** The pinned bar: where you are in this view, whatever is on screen. */
  async function paintMe() {
    const me = await lbMe(view);
    meBar.replaceChildren(...meContent(me));
  }

  function meContent(me: LbMe | null): (HTMLElement | string)[] {
    const account = cachedAccount();
    if (!me || !account) return [h('p', { class: 'note', text: t.offline })];
    // Guests are never listed, however many games they've played: say so, and offer the way in.
    if (account.anonymous) {
      return [
        h('span', { class: 'lb-me-text' }, h('strong', { text: t.you }), h('span', { text: t.guestBar })),
        h('button', { class: 'btn btn-primary lb-jump', text: t.guestSignUp, attrs: { type: 'button' }, onclick: openGuestSignUp }),
      ];
    }
    let text: string;
    let canJump = false;
    if (me.restricted) text = t.restricted;
    else if (me.hidden) text = t.hiddenBar(me.place);
    else if (!me.rated) text = t.notRated;
    else if (me.place == null && view === 'season') text = t.seasonToGo(Math.max(1, 20 - (me.seasonGames ?? 0)));
    else if (me.place == null) text = t.notInView[view];
    else {
      text = `${t.place(me.place)}${me.total ? ` ${t.ofTotal(me.total)}` : ''}`;
      canJump = true;
    }
    const jump = h('button', {
      class: 'btn btn-primary lb-jump',
      text: around ? t.showTop : t.showMe,
      attrs: { type: 'button' },
      onclick: () => {
        around = !around;
        focusId = null;
        jump.textContent = around ? t.showTop : t.showMe;
        void load(0);
      },
    });
    return [
      h('span', { class: 'avatar lb-avatar worn', html: cardAvatar(meLoadout()), attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'lb-me-text' }, h('strong', { text: t.you }), h('span', { text })),
      me.hidden ? h('button', { class: 'link-btn', text: copy.privacy.open, attrs: { type: 'button' }, onclick: () => mount(privacyScreen(() => leaderboardScreen({ view }))) }) : '',
      canJump ? jump : '',
    ];
  }
  /** The sign-up form in a sheet; once signed up, the board reloads with your place. */
  function openGuestSignUp() {
    const close = openModal(
      h(
        'div',
        { class: 'sheet' },
        closeButton(() => close()),
        signUpForm({
          title: t.guestSheetTitle,
          text: t.guestSheetText((cachedAccount()?.rankedGames ?? 0) > 0),
          onDone: () => {
            close();
            void paintMe();
            void load(0);
          },
        }),
      ),
    );
  }
  const meLoadout = () => {
    const l = cachedLoadout() ?? {};
    const polish = cachedPolish();
    const avatar = l.avatar ?? null;
    return { avatar, frame: l.frame ?? null, alive: !!polish[avatar ?? 's0-avatar-happy'] };
  };

  // ---- search: 2+ characters, a short pause, then up to 20 players
  let searchTimer = 0;
  let searchSeq = 0;
  function showSearch(on: boolean) {
    results.hidden = !on;
    for (const n of [list, more, notice, meta.parentElement!, tabs[0].parentElement!]) n.classList.toggle('lb-dim', on);
  }
  searchField.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchField.value.trim();
    if (q.length < 2) {
      showSearch(false);
      results.replaceChildren();
      return;
    }
    searchTimer = window.setTimeout(() => void runSearch(q), 300);
  });
  async function runSearch(q: string) {
    const seq = ++searchSeq;
    showSearch(true);
    results.replaceChildren(h('li', { class: 'note', text: t.searching }));
    const hits = await searchPlayers(q);
    if (seq !== searchSeq) return;
    if (typeof hits === 'string') {
      results.replaceChildren(h('li', { class: 'note', text: hits }));
      searchStatus.textContent = hits;
      return;
    }
    searchStatus.textContent = t.a11yResults(hits.length);
    results.replaceChildren(...(hits.length ? hits.map(hitRow) : [h('li', { class: 'note', text: t.noResults(q) })]));
  }
  function hitRow(hit: SearchHit): HTMLElement {
    const tier = rankTier(hit.elo, hit.tier);
    const name = h('strong', { class: 'lb-name' });
    paintPlate(name, hit.name, hit.plate);
    return h(
      'li',
      { class: 'lb-row' },
      h(
        'button',
        { class: 'lb-row-btn', attrs: { type: 'button', 'aria-label': t.a11yRow(hit.place ?? 0, hit.name, hit.title ?? tier.label, hit.elo).replace(/^0\. /, '') }, onclick: () => openCard(hit.id) },
        h('span', { class: 'lb-place', text: hit.place ? String(hit.place) : '–', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'avatar lb-avatar worn', html: cardAvatar({ ...hit, alive: false }), attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'lb-who', attrs: { 'aria-hidden': 'true' } }, name,
          h('span', { class: 'lb-sub' }, h('span', { class: `tier-emblem tier-${tier.tier}`, html: ICONS.tiers[tier.tier] }), h('span', { text: hit.title ?? tier.label }))),
        h('span', { class: 'lb-score', attrs: { 'aria-hidden': 'true' } }, h('strong', { text: String(hit.elo) }), h('span', { text: t.elo })),
      ),
    );
  }

  // ---- the affinities card
  async function paintFaction() {
    const b = await factionBoard();
    faction.setAttribute('aria-busy', 'false');
    if (!b) return void faction.replaceChildren(h('p', { class: 'note', text: t.offline }));
    faction.replaceChildren(...factionContent(b));
  }

  /**
   * Strength as shares of 100%: each side's influence per active player (how the month is
   * won), over the four together, rounded so they always add up to exactly 100.
   */
  function shares(standings: FactionBoard['standings']): Map<Element, number> {
    const sum = standings.reduce((n, s) => n + Math.max(0, Number(s.standing)), 0);
    const out = new Map<Element, number>();
    if (sum === 0) return out;
    const raw = standings.map((s) => ({ e: s.affinity, v: (Math.max(0, Number(s.standing)) / sum) * 100 }));
    const floors = raw.map((r) => ({ ...r, f: Math.floor(r.v) }));
    let left = 100 - floors.reduce((n, r) => n + r.f, 0);
    for (const r of [...floors].sort((x, y) => (y.v - y.f) - (x.v - x.f))) if (left-- > 0) r.f++;
    for (const r of floors) out.set(r.e, r.f);
    return out;
  }

  function factionContent(b: FactionBoard): HTMLElement[] {
    const name = (e: Element) => copy.forge.elements[e];
    const pct = shares(b.standings);
    // strongest first, like the bar reads: the leader on the left
    const ranked = [...b.standings].sort((x, y) => (pct.get(y.affinity) ?? 0) - (pct.get(x.affinity) ?? 0) || ELEMENTS.indexOf(x.affinity) - ELEMENTS.indexOf(y.affinity));
    const first = ranked[0];
    const tied = !pct.size || pct.get(first.affinity) === pct.get(ranked[1].affinity);
    const days = Math.max(1, Math.ceil((new Date(b.endsAt).getTime() - Date.now()) / 86_400_000));

    const head = h('div', { class: `lb-leader${tied ? '' : ` el-${first.affinity}`}` },
      h('span', { class: 'lb-leader-mark', html: tied ? ICONS.dust : ICONS.elements[first.affinity], attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'lb-leader-name' }, h('strong', { text: tied ? t.noLeader : name(first.affinity) }), h('span', { text: tied ? (pct.size ? t.level : t.nobody) : t.leading })),
      tied ? null : h('strong', { class: 'lb-leader-pct', text: `${pct.get(first.affinity)}%` }));
    const bar = h('div', { class: 'lb-strength', attrs: { role: 'img', 'aria-label': t.a11yStrength(ranked.map((s) => `${name(s.affinity)} ${pct.get(s.affinity) ?? 25}%`).join(', ')) } },
      ...ranked.map((s) => {
        // each segment carries its element's glyph where it fits, so the bar never relies on colour
        // alone (phones hide the legend; Fire and Earth look alike to protanopes); the bar's label says it all
        const seg = h('span', { class: `strength-seg el-${s.affinity}` }, h('span', { class: 'seg-glyph', html: ICONS.elements[s.affinity] }));
        seg.style.flexGrow = String(pct.size ? Math.max(pct.get(s.affinity) ?? 0, 1) : 25);
        return seg;
      }));
    const legend = h('ul', { class: 'lb-strength-legend', attrs: { 'aria-hidden': 'true' } },
      ...ranked.map((s) => h('li', { class: `el-${s.affinity}` },
        h('span', { class: 'strength-name' }, h('span', { class: 'strength-dot', html: ICONS.elements[s.affinity] }), h('span', { text: name(s.affinity) })),
        h('strong', { text: pct.size ? `${pct.get(s.affinity)}%` : '–' }))));
    const mine = b.mine
      ? b.myInfluence > 0 && b.myPlace
        ? (b.mySolves ?? 5) < 5
          ? t.yoursNotYet(5 - (b.mySolves ?? 5), name(b.mine))
          : t.yours(b.myInfluence, b.myPlace, name(b.mine))
        : t.yoursNone(name(b.mine))
      : null;
    // Your side's place and share, unless it leads alone (the leader row says so); on phones
    // this stands in for the legend, so the bar isn't colour only.
    const minePct = b.mine ? pct.get(b.mine) : undefined;
    const side = b.mine && minePct != null && (tied || first.affinity !== b.mine)
      ? t.yourSide(name(b.mine), 1 + [...pct.values()].filter((v) => v > minePct).length, minePct)
      : null;
    // On phones the card is short (leader, bar, days left, yours) so the list shows sooner; the
    // legend, the rule and the prize are in Details (styles.css .lb-faction .wide-only).
    return [
      h('div', { class: 'lb-faction-head' },
        h('h2', { text: t.affinitiesOf(monthName(b.month)) }),
        h('button', { class: 'link-btn', text: t.details, attrs: { type: 'button' }, onclick: () => openFaction(b) })),
      head,
      bar,
      h('div', { class: 'wide-only' }, legend),
      h('p', { class: 'lb-legend-note wide-only', text: t.strengthNote }),
      ...(side ? [h('p', { class: 'lb-faction-side narrow-only', text: side })] : []),
      h('p', { class: 'lb-faction-line' }, h('span', { text: t.daysLeft(days) }), h('span', { class: 'wide-only', text: ` · ${t.prize}` })),
      mine
        ? h('p', { class: 'lb-faction-mine', text: mine })
        : h('button', { class: 'link-btn', text: t.joinIn, attrs: { type: 'button' }, onclick: () => mount(affinityScreen(() => leaderboardScreen({ view }))) }),
    ];
  }
  function openFaction(b: FactionBoard) {
    const name = (e: Element) => copy.forge.elements[e];
    const ranked = [...b.standings].sort((x, y) => Number(y.standing) - Number(x.standing));
    const close = openModal(
      h(
        'div',
        { class: 'sheet lb-faction-sheet' },
        closeButton(() => close()),
        h('h2', { text: t.sheetTitle(monthName(b.month)) }),
        h('p', { class: 'note', text: t.sheetIntro }),
        h('ol', { class: 'faction-standings' },
          ...ranked.map((s, i) => h('li', { class: `el-${s.affinity}${s.affinity === b.mine ? ' is-mine' : ''}` },
            h('span', { class: 'lb-place', text: String(i + 1) }),
            h('span', { class: 'drop-element', html: ICONS.elements[s.affinity], attrs: { 'aria-hidden': 'true' } }),
            h('span', { class: 'fs-name' }, h('strong', { text: name(s.affinity) }), h('span', { text: `${t.members(s.members)} · ${t.influence(Number(s.influence))}` })),
            h('strong', { class: 'fs-standing', text: t.perPlayer(Number(s.standing)) })))),
        h('p', { class: 'note', text: t.prize }),
        b.lastWinner?.winner
          ? h('p', { class: 'note', text: t.lastWinner((b.lastWinner.winners ?? [b.lastWinner.winner]).map(name), monthName(b.lastWinner.month)) })
          : null,
        b.mine
          ? h('section', { class: 'faction-top' }, h('h3', { text: t.topIn(name(b.mine)) }),
              b.top?.length
                ? h('ol', {}, ...b.top.map((p, i) => h('li', {},
                    h('button', { class: 'link-btn', text: `${i + 1}. ${p.name}`, attrs: { type: 'button' }, onclick: () => { close(); openCard(p.id); } }),
                    h('span', { text: t.influence(p.influence) }))))
                : h('p', { class: 'note', text: t.topEmpty }))
          : null,
      ),
    );
  }

  // ---- the ranks: every tier, its floor, and the share of players in it
  function openTiers() {
    const sheet = h('div', { class: 'sheet lb-tiers-sheet' }, h('p', { class: 'note', text: t.loading }));
    const close = openModal(sheet);
    void lbTiers().then((data) => {
      const account = cachedAccount();
      const mine = rankTier(account?.elo ?? 0, account?.tier).tier;
      // where you stand: the next rank and how far it is (once you've played Ranked)
      const up = account && account.rankedGames > 0 ? nextRank(account.elo, account.tier) : null;
      if (!data) return sheet.replaceChildren(closeButton(() => close()), h('p', { class: 'note', text: t.offline }));
      sheet.replaceChildren(
        closeButton(() => close()),
        h('h2', { text: t.tiersTitle }),
        h('p', { class: 'note', text: t.tiersIntro }),
        up ? h('p', { class: 'tier-next', text: copy.common.toNextRank(up.gap, up.label) }) : '',
        h('ol', { class: 'tier-list' },
          ...data.tiers.slice().reverse().map((tier) => {
            const index = data.tiers.indexOf(tier);
            const pct = data.total ? Math.round((Number(tier.players) / data.total) * 100) : 0;
            const from = t.from(tier.floor);
            const nameT = copy.common.ranks[index];
            const bar = h('span', { class: 'tier-share' }, h('span'));
            (bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
            return h('li', { class: index === mine ? 'is-mine' : '', attrs: { 'aria-label': t.a11yTier(nameT, from, pct) } },
              h('span', { class: `tier-emblem tier-${index}`, html: ICONS.tiers[index], attrs: { 'aria-hidden': 'true' } }),
              h('span', { class: 'tier-name', attrs: { 'aria-hidden': 'true' } }, h('strong', { text: nameT }), h('span', { text: index === mine ? `${from} · ${t.yourTier}` : from })),
              h('span', { class: 'tier-pct', attrs: { 'aria-hidden': 'true' } }, h('strong', { text: t.share(pct) }), bar));
          })),
      );
    });
  }

  // ---- start: Friends first once you follow someone (comparing with people you know)
  void (async () => {
    if (!start?.view && !readJson<LbView>(VIEW_KEY)) {
      if (await followingCount()) view = 'friends';
    }
    paintTabs();
    void paintFaction();
    void paintMe();
    void load(focusId ? 0 : 0);
  })();
  paintTabs();
  const stop = onAccountChange(() => {
    if (!el.isConnected) return stop();
    paintTabs();
  });
  return { el, title: t.title, destroy: stop };
}
