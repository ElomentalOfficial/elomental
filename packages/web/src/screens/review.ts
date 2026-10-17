import {
  REVIEW_PAGE,
  fetchReviewPage,
  moderate,
  type ModerationAction,
  type ReviewDecision,
  type ReviewGame,
  type ReviewPage,
  type ReviewPlayer,
  type ReviewView,
} from '../backend.ts';
import { ICONS } from '../icons.ts';
import { goBack, h, openModal, toast, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';

type Item = ReviewPlayer | ReviewDecision;
type Source = (view: ReviewView, offset: number, limit: number) => Promise<ReviewPage<Item>>;

const VIEWS: { view: ReviewView; label: string }[] = [
  { view: 'open', label: 'To review' },
  { view: 'banned', label: 'Banned' },
  { view: 'history', label: 'History' },
];

/**
 * Review dashboard (founders only; the server enforces it), made for a long
 * queue: one compact row per player, worst first, 25 at a time. Opening a row
 * shows why and the buttons; once decided, the player leaves the queue (into
 * History, and Banned if banned) and the next row opens by itself.
 * Nothing here ever deletes an account or its progress.
 */
export function reviewScreen(source: Source = fetchReviewPage): Screen {
  let view: ReviewView = 'open';
  let items: Item[] = [];
  let counts: Record<ReviewView, number> = { open: 0, banned: 0, history: 0 };
  let expanded = -1;

  const list = h('div', { class: 'review-list' });
  const more = h('button', { class: 'btn review-more' });
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

  function paintTabs() {
    for (const { value, tab, count } of tabs) {
      const on = value === view;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-checked', String(on));
      count.textContent = value === 'history' ? '' : String(counts[value]);
    }
  }

  function paint() {
    paintTabs();
    list.replaceChildren(
      ...(items.length
        ? items.map((item, i) => (view === 'history' ? logRow(item as ReviewDecision) : playerRow(item as ReviewPlayer, i)))
        : [h('p', { class: 'review-empty', text: EMPTY[view] })]),
    );
    const total = counts[view];
    more.hidden = items.length >= total;
    more.textContent = `Show more (${items.length} of ${total})`;
  }

  /** Reloads the view, keeping as many rows as were showing; `open` is the row to open afterwards. */
  async function load(open = -1) {
    const keep = Math.min(Math.max(items.length, REVIEW_PAGE), 100);
    const viewNow = view;
    paintTabs();
    if (!items.length || open < 0) list.replaceChildren(h('p', { class: 'review-empty', text: 'Loading…' }));
    try {
      const page = await source(viewNow, 0, open >= 0 ? keep : REVIEW_PAGE);
      if (viewNow !== view) return; // switched tab meanwhile
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

  more.addEventListener('click', async () => {
    more.disabled = true;
    try {
      const page = await source(view, items.length, REVIEW_PAGE);
      counts = page.counts;
      items = items.concat(page.items);
      paint();
    } catch {
      toast('Couldn’t load more. Try again.');
    } finally {
      more.disabled = false;
    }
  });

  function playerRow(player: ReviewPlayer, index: number): HTMLElement {
    const open = index === expanded;
    const latest = player.games[0];
    const summary =
      view === 'banned'
        ? `Banned ${banLength(player)}${player.restrictionReason ? ` · ${player.restrictionReason}` : ''}`
        : `${latest ? verdict(latest) : 'Flagged'}${player.games.length > 1 ? ` · ${player.games.length} games` : ''}`;
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
      view === 'open' && player.decisions ? h('span', { class: 'review-pill', text: 'Again' }) : null,
      view === 'open' && player.restricted ? h('span', { class: 'review-pill banned', text: 'Banned' }) : null,
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
      act('It was a mistake', 'clear', null),
      player.restricted && !player.restrictedUntil ? act('Ban 30 days instead', 'restrict', 30) : act('Ban until lifted', 'restrict', null),
      player.restricted ? act('Lift ban', 'lift', null, true) : act('Ban from Ranked 30 days', 'restrict', 30, true),
    );
    const last = player.lastDecision;
    return h(
      'div',
      { class: 'review-detail' },
      h('p', { class: 'note', text: `${player.email ?? 'Guest account'} · Elo ${player.elo}` }),
      latest ? h('p', { class: 'review-verdict', text: `${verdict(latest)}: ${why(latest)}` }) : null,
      player.restricted
        ? h('p', { class: 'note', text: `Banned from Ranked ${banLength(player)}${player.restrictionReason ? `: ${player.restrictionReason}` : ''}.` })
        : null,
      last ? h('p', { class: 'note', text: `Earlier: ${decisionText(last.action, last.days)} on ${when(last.at)}${last.note ? ` (${last.note})` : ''}` }) : null,
      player.games.length
        ? h(
            'details',
            { class: 'review-games' },
            h('summary', { text: view === 'open' ? `Flagged games (${player.games.length})` : `Latest flagged games (${player.games.length})` }),
            ...player.games.map(gameRow),
          )
        : null,
      actions,
    );
  }

  function logRow(entry: ReviewDecision): HTMLElement {
    const facts = [when(entry.at), entry.by ? `by ${entry.by}` : 'from the SQL Editor'];
    if (entry.flags) facts.push(`${entry.flags} flag${entry.flags === 1 ? '' : 's'}`);
    return h(
      'div',
      { class: `review-log ${entry.action}` },
      h('strong', { text: entry.name }),
      h('span', { text: decisionText(entry.action, entry.days) + (entry.note ? `: ${entry.note}` : '') }),
      h('span', { class: 'note', text: facts.join(' · ') }),
    );
  }

  function confirmAction(player: ReviewPlayer, index: number, action: ModerationAction, days: number | null, label: string) {
    const explain: Record<ModerationAction, string> = {
      clear: `${player.name}'s flags are marked as a mistake, and any Ranked ban is lifted.`,
      restrict: `${player.name} can't play Ranked ${days ? `for ${days} days` : 'until you lift the ban'} and is off the leaderboard meanwhile. Nothing else changes: Elo, Stardust, Casual, Daily and Clash all stay.`,
      lift: `${player.name} can play Ranked again and returns to the leaderboard.`,
    };
    const confirmLabel = { clear: 'Clear flags', restrict: 'Ban', lift: 'Lift ban' }[action];
    const note = h('input', {
      class: 'text-field',
      attrs: { type: 'text', maxlength: '200', placeholder: action === 'restrict' ? 'Reason (optional)' : 'Note (optional)' },
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
      h('button', { class: 'btn', text: 'Cancel', onclick: () => close() }),
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
      toast(action === 'clear' ? `${player.name}: cleared` : action === 'lift' ? `${player.name} can play Ranked again` : `${player.name} is banned from Ranked`);
      // The player leaves this list (or changes in place); open whichever row is now in their spot.
      void load(index);
    });
  }

  const el = h(
    'div',
    { class: 'screen setup review scrollable' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': 'Back' }, onclick: () => void goBack(setupScreen) }),
      h('h1', { text: 'Review' }),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h('div', { class: 'segmented review-tabs', attrs: { role: 'radiogroup', 'aria-label': 'Show' } }, ...tabs.map((t) => t.tab)),
    list,
    more,
  );
  more.hidden = true;
  void load();
  return { el };
}

const EMPTY: Record<ReviewView, string> = {
  open: 'Nothing to review. All clear.',
  banned: 'Nobody is banned from Ranked.',
  history: 'No decisions yet.',
};

function gameRow(game: ReviewGame): HTMLElement {
  const facts = [when(game.at)];
  if (game.rating) facts.push(`puzzle rated ${game.rating}`);
  if (game.seconds) facts.push(`solved in ${minutes(game.seconds)}`);
  return h(
    'div',
    { class: 'review-game' },
    h('strong', { text: verdict(game) }),
    h('span', { text: why(game) }),
    h('span', { class: 'note', text: facts.join(' · ') }),
    game.reviewed && game.note ? h('span', { class: 'note', text: `Note: ${game.note}` }) : null,
  );
}

function verdict(game: ReviewGame): string {
  if (game.reason === 'unchecked') return 'Not checked';
  if (game.potential !== null && game.evidence !== null && game.potential > 0 && game.evidence < 0) return 'Very likely copied';
  return 'Likely copied';
}

function why(game: ReviewGame): string {
  if (game.reason === 'unchecked') return 'the app never sent its moves for checking, usually a dropped connection.';
  if (!game.validPuzzle) return 'the puzzle it reported was not a valid Sudoku.';
  return `${game.leaps} of ${game.placements} squares were filled in before they could be worked out.`;
}

function banLength(player: ReviewPlayer): string {
  return player.restrictedUntil ? `until ${day(player.restrictedUntil)}` : 'until lifted';
}

function decisionText(action: ModerationAction, days: number | null): string {
  if (action === 'clear') return 'Cleared as a mistake';
  if (action === 'lift') return 'Ban lifted';
  return days ? `Banned from Ranked for ${days} days` : 'Banned from Ranked until lifted';
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
