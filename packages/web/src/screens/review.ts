import {
  REVIEW_PAGE,
  fetchReviewPage,
  moderate,
  searchReview,
  type ModerationAction,
  type ReviewDecision,
  type ReviewGame,
  type ReviewPage,
  type ReviewPlayer,
  type ReviewView,
} from '../backend.ts';
import { ICONS } from '../icons.ts';
import { formatSeconds, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
import { devScreen } from './dev.ts';
import * as copy from '../copy/en.ts';

type Item = ReviewPlayer | ReviewDecision;
interface Sources {
  page: (view: ReviewView, offset: number, limit: number) => Promise<ReviewPage<Item>>;
  search: (query: string) => Promise<ReviewPlayer[]>;
}

const VIEWS: { view: ReviewView; label: string }[] = [
  { view: 'open', label: copy.review.tabs.open },
  { view: 'banned', label: copy.review.tabs.banned },
  { view: 'history', label: copy.review.tabs.history },
];

/** Typing pauses this long before a search goes out. */
const SEARCH_DELAY = 250;
/** The most results a search returns (admin_search's default limit). */
const SEARCH_LIMIT = 20;

/**
 * Review dashboard (founders only; the server enforces it), made for a long
 * queue: one compact row per player, worst first, 25 at a time. Opening a row
 * shows why and the buttons; once decided, the player leaves the queue (into
 * History, and Banned if banned) and the next row opens by itself.
 *
 * Search (name, email or account id) finds one player's whole case, wherever
 * it sits: open flags, ban, and every decision so far.
 * Nothing here ever deletes an account or its progress.
 */
export function reviewScreen(sources: Sources = { page: fetchReviewPage, search: searchReview }): Screen {
  let view: ReviewView = 'open';
  let items: Item[] = [];
  let counts: Record<ReviewView, number> = { open: 0, banned: 0, history: 0 };
  let expanded = -1;
  /** The search in effect (2+ characters); '' shows the tabs. */
  let query = '';
  let searchTimer = 0;
  let searchRun = 0;

  const list = h('div', { class: 'review-list' });
  const more = h('button', { class: 'btn review-more' });
  const resultsNote = h('p', { class: 'review-results', attrs: { role: 'status' } });

  const input = h('input', {
    class: 'review-search-input',
    attrs: {
      type: 'search',
      placeholder: copy.review.searchPlaceholder,
      'aria-label': copy.review.a11ySearch,
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'search',
    },
  });
  const clear = h('button', {
    class: 'review-search-clear',
    html: ICONS.close,
    attrs: { 'aria-label': copy.review.a11yClearSearch },
    onclick: () => {
      input.value = '';
      onQuery(true);
      input.focus();
    },
  });
  const searchBox = h('label', { class: 'review-search' }, h('span', { class: 'review-search-icon', html: ICONS.search }), input, clear);

  const tabs = VIEWS.map(({ view: value, label }) => {
    const count = h('span', { class: 'review-count' });
    const tab = h(
      'button',
      {
        class: 'segment',
        attrs: { role: 'radio' },
        onclick: () => {
          if (view === value) return;
          view = value;
          items = [];
          void load();
        },
      },
      h('span', { text: label }),
      count,
    );
    return { value, tab, count };
  });
  const tabBar = h('div', { class: 'segmented review-tabs', attrs: { role: 'radiogroup', 'aria-label': copy.review.a11yTabs } }, ...tabs.map((t) => t.tab));

  const searching = () => query !== '';

  function paintTabs() {
    for (const { value, tab, count } of tabs) {
      const on = value === view;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-checked', String(on));
      count.textContent = value === 'history' ? '' : String(counts[value]);
    }
  }

  function paint() {
    tabBar.hidden = searching();
    clear.hidden = !input.value;
    paintTabs();
    if (searching()) {
      resultsNote.textContent = items.length
        ? copy.review.matches(items.length, query, SEARCH_LIMIT)
        : '';
      list.replaceChildren(
        ...(items.length
          ? items.map((item, i) => playerRow(item as ReviewPlayer, i))
          : [h('p', { class: 'review-empty', text: copy.review.noMatch(query) })]),
      );
      more.hidden = true;
      return;
    }
    resultsNote.textContent = '';
    list.replaceChildren(
      ...(items.length
        ? items.map((item, i) => (view === 'history' ? logRow(item as ReviewDecision, true) : playerRow(item as ReviewPlayer, i)))
        : [h('p', { class: 'review-empty', text: EMPTY[view] })]),
    );
    const total = counts[view];
    more.hidden = items.length >= total;
    more.textContent = copy.review.showMore(items.length, total);
  }

  /** Reloads the view or the search, keeping as many rows as were showing; `open` is the row to open afterwards. */
  async function load(open = -1) {
    if (searching()) return runSearch(open);
    const keep = Math.min(Math.max(items.length, REVIEW_PAGE), 100);
    const viewNow = view;
    paintTabs();
    if (!items.length || open < 0) list.replaceChildren(h('p', { class: 'review-empty', text: copy.common.loading }));
    try {
      const page = await sources.page(viewNow, 0, open >= 0 ? keep : REVIEW_PAGE);
      if (viewNow !== view || searching()) return; // moved on meanwhile
      counts = page.counts;
      items = page.items;
      expanded = open >= 0 && view !== 'history' ? Math.min(open, items.length - 1) : -1;
      paint();
      if (expanded >= 0) list.children[expanded]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (error) {
      items = [];
      more.hidden = true;
      list.replaceChildren(h('p', { class: 'review-empty', text: (error as Error).message }));
    }
  }

  async function runSearch(open = -1) {
    const run = ++searchRun;
    const term = query;
    try {
      const found = await sources.search(term);
      if (run !== searchRun) return; // a newer search went out
      items = found;
      // One match: open it straight away.
      expanded = open >= 0 ? Math.min(open, found.length - 1) : found.length === 1 ? 0 : -1;
      paint();
    } catch (error) {
      if (run !== searchRun) return;
      items = [];
      list.replaceChildren(h('p', { class: 'review-empty', text: (error as Error).message }));
    }
  }

  /** The field changed: search once typing pauses (or now), or go back to the tabs when it's cleared. */
  function onQuery(now = false) {
    clearTimeout(searchTimer);
    const term = input.value.trim();
    clear.hidden = !input.value;
    if (term.length < 2) {
      if (!searching()) return;
      query = '';
      searchRun++;
      items = [];
      expanded = -1;
      void load();
      return;
    }
    const go = () => {
      if (term === query) return;
      const wasSearching = searching();
      query = term;
      if (!wasSearching) {
        items = [];
        tabBar.hidden = true;
        more.hidden = true;
        list.replaceChildren(h('p', { class: 'review-empty', text: copy.common.searching }));
      }
      void runSearch();
    };
    if (now) go();
    else searchTimer = window.setTimeout(go, SEARCH_DELAY);
  }
  input.addEventListener('input', () => onQuery());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      onQuery(true);
      input.blur(); // hides the phone keyboard so the results show
    } else if (event.key === 'Escape') {
      input.value = '';
      onQuery(true);
    }
  });

  more.addEventListener('click', async () => {
    more.disabled = true;
    try {
      const page = await sources.page(view, items.length, REVIEW_PAGE);
      counts = page.counts;
      items = items.concat(page.items);
      paint();
    } catch {
      toast(copy.review.loadMoreFailed);
    } finally {
      more.disabled = false;
    }
  });

  function playerRow(player: ReviewPlayer, index: number): HTMLElement {
    const open = index === expanded;
    const latest = player.games[0];
    let summary: string;
    if (searching()) summary = `${status(player)} · ${player.email ?? copy.common.guest}`;
    else if (view === 'banned') summary = copy.review.bannedSummary(banLength(player), player.restrictionReason);
    else summary = `${latest ? verdict(latest) : copy.review.flagged}${player.games.length > 1 ? ` · ${copy.review.games(player.games.length)}` : ''}`;
    const inQueue = !searching() && view === 'open';
    const head = h(
      'button',
      {
        class: 'review-row-head',
        attrs: { 'aria-expanded': String(open) },
        onclick: () => {
          expanded = open ? -1 : index;
          paint();
        },
      },
      h('span', { class: 'review-row-text' }, h('strong', { text: player.name }), h('span', { text: summary })),
      inQueue && player.decisions ? h('span', { class: 'review-pill', text: copy.review.pillAgain }) : null,
      (inQueue || searching()) && player.restricted ? h('span', { class: 'review-pill banned', text: copy.review.pillBanned }) : null,
      searching() && player.toReview ? h('span', { class: 'review-pill', text: copy.review.pillOpen }) : null,
      h('span', { class: 'review-chevron', html: ICONS.back }),
    );
    return h('section', { class: `review-row${open ? ' open' : ''}` }, head, open ? detail(player, index) : null);
  }

  function detail(player: ReviewPlayer, index: number): HTMLElement {
    const latest = player.games[0];
    const act = (label: string, action: ModerationAction, days: number | null, primary = false) =>
      h('button', {
        class: `btn${primary ? ' btn-primary' : ''}`,
        text: label,
        onclick: () => confirmAction(player, index, action, days, label),
      });
    // The likely next step is the wide button: a ban while Ranked is open, lifting it once banned.
    // While banned, the other button switches to the other kind of ban.
    const actions = h(
      'div',
      { class: 'review-actions' },
      act(copy.review.actions.clear, 'clear', null),
      player.restricted && !player.restrictedUntil ? act(copy.review.actions.ban30Instead, 'restrict', 30) : act(copy.review.actions.banUntilLifted, 'restrict', null),
      player.restricted ? act(copy.review.actions.lift, 'lift', null, true) : act(copy.review.actions.ban30, 'restrict', 30, true),
    );
    const last = player.lastDecision;
    const openGames = player.games.filter((g) => !g.reviewed).length;
    return h(
      'div',
      { class: 'review-detail' },
      h('p', { class: 'note', text: copy.review.emailAndElo(player.email ?? copy.review.guestAccount, player.elo) }),
      searching() ? h('p', { class: 'note review-id', text: copy.review.id(player.userId) }) : null,
      latest ? h('p', { class: 'review-verdict', text: `${verdict(latest)}: ${why(latest)}` }) : null,
      player.restricted
        ? h('p', { class: 'note', text: copy.review.bannedLine(banLength(player), player.restrictionReason) })
        : null,
      // A search shows the full decision list instead.
      last && !player.log ? h('p', { class: 'note', text: copy.review.earlier(decisionText(last.action, last.days), when(last.at), last.note) }) : null,
      player.games.length
        ? h(
            'details',
            { class: 'review-games' },
            h('summary', {
              text:
                !searching() && view === 'open'
                  ? copy.review.flaggedGames(player.games.length)
                  : copy.review.flaggedGamesOpen(player.flagged, openGames),
            }),
            ...player.games.map((game) => gameRow(game, searching())),
          )
        : null,
      player.log?.length
        ? h(
            'details',
            { class: 'review-games', attrs: { open: '' } },
            h('summary', { text: copy.review.decisions(player.log.length) }),
            ...player.log.map((entry) => logRow(entry, false)),
          )
        : null,
      actions,
    );
  }

  function confirmAction(player: ReviewPlayer, index: number, action: ModerationAction, days: number | null, label: string) {
    const explain: Record<ModerationAction, string> = {
      clear: copy.review.confirm.clear(player.name),
      restrict: copy.review.confirm.restrict(player.name, days),
      lift: copy.review.confirm.lift(player.name),
    };
    const confirmLabel = copy.review.confirm.button[action];
    const note = h('input', {
      class: 'text-field',
      attrs: { type: 'text', maxlength: '200', placeholder: action === 'restrict' ? copy.review.confirm.reason : copy.review.confirm.note },
    });
    const status = h('p', { class: 'note', attrs: { role: 'status' } });
    const go = h('button', { class: 'btn btn-primary', text: confirmLabel });
    const body = h(
      'div',
      { class: 'sheet review-confirm' },
      h('h2', { text: label }),
      h('p', { text: explain[action] }),
      action === 'lift' ? null : note,
      status,
      go,
      h('button', { class: 'btn', text: copy.common.cancel, onclick: () => close() }),
    );
    const close = openModal(body);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const error = await moderate(player.userId, action, days, note.value);
      if (error) {
        status.textContent = error;
        go.disabled = false;
        return;
      }
      close();
      toast(copy.review.done[action](player.name));
      // In a list the player leaves (or changes in place): open whichever row is now in their spot.
      // In a search they stay, updated, with the new decision on top.
      void load(index);
    });
  }

  const el = subPage(
    { className: 'setup review', title: copy.review.title, onBack: () => void goBack(devScreen) },
    searchBox,
    tabBar,
    resultsNote,
    list,
    more,
  );
  clear.hidden = true;
  more.hidden = true;
  void load();
  return { el, title: copy.review.title, destroy: () => clearTimeout(searchTimer) };
}

const EMPTY: Record<ReviewView, string> = copy.review.empty;

/** Where a player's case stands, in a few words. */
function status(player: ReviewPlayer): string {
  if (player.restricted) return copy.review.status.banned(banLength(player));
  if (player.toReview) return copy.review.status.toReview(player.toReview);
  if (player.lastDecision) return decisionText(player.lastDecision.action, player.lastDecision.days);
  return copy.review.status.none;
}

/** One decision; `named` adds the player's name (History lists everyone, a case only one player). */
function logRow(entry: ReviewDecision, named: boolean): HTMLElement {
  const facts = [when(entry.at), entry.by ? copy.review.by(entry.by) : copy.review.fromSqlEditor];
  if (entry.flags) facts.push(copy.review.flags(entry.flags));
  return h(
    'div',
    { class: `review-log ${entry.action}${named ? '' : ' inline'}` },
    named ? h('strong', { text: entry.name }) : null,
    h('span', { text: decisionText(entry.action, entry.days) + (entry.note ? `: ${entry.note}` : '') }),
    h('span', { class: 'note', text: facts.join(' · ') }),
  );
}

/** One flagged game; `markOpen` tags the ones still to review (where settled ones show too). */
function gameRow(game: ReviewGame, markOpen: boolean): HTMLElement {
  const facts = [when(game.at)];
  if (game.rating) facts.push(copy.review.rated(game.rating));
  if (game.seconds) facts.push(copy.review.solvedIn(formatSeconds(game.seconds)));
  return h(
    'div',
    { class: 'review-game' },
    h('strong', { text: verdict(game) + (markOpen && !game.reviewed ? copy.review.toReviewTag : '') }),
    h('span', { text: why(game) }),
    h('span', { class: 'note', text: facts.join(' · ') }),
    game.reviewed && game.note ? h('span', { class: 'note', text: copy.review.noteLine(game.note) }) : null,
  );
}

function verdict(game: ReviewGame): string {
  if (game.reason === 'unchecked') return copy.review.verdict.unchecked;
  if (game.potential !== null && game.evidence !== null && game.potential > 0 && game.evidence < 0) return copy.review.verdict.veryLikely;
  return copy.review.verdict.likely;
}

function why(game: ReviewGame): string {
  if (game.reason === 'unchecked') return copy.review.why.unchecked;
  if (!game.validPuzzle) return copy.review.why.invalid;
  return copy.review.why.leaps(game.leaps, game.placements);
}

function banLength(player: ReviewPlayer): string {
  return player.restrictedUntil ? copy.review.until(day(player.restrictedUntil)) : copy.review.untilLifted;
}

function decisionText(action: ModerationAction, days: number | null): string {
  if (action === 'clear') return copy.review.decision.clear;
  if (action === 'lift') return copy.review.decision.lift;
  return copy.review.decision.restrict(days);
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
