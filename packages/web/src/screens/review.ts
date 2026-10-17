import { fetchReview, moderate, type ModerationAction, type ReviewGame, type ReviewPlayer } from '../backend.ts';
import { ICONS } from '../icons.ts';
import { goBack, h, openModal, toast, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';

/**
 * Review dashboard (founders only; the server enforces it): every player whose
 * Ranked wins were flagged as copied, why, and what to do about it. Clearing
 * marks the flags as a mistake; a ban only closes Ranked (for 30 days or until
 * lifted). Nothing here ever deletes an account or its progress.
 */
export function reviewScreen(source: () => Promise<ReviewPlayer[]> = fetchReview): Screen {
  let filter: 'open' | 'all' = 'open';
  let players: ReviewPlayer[] = [];

  const summary = h('div', { class: 'review-summary' });
  const list = h('div', { class: 'review-list' });
  const tabs = (['open', 'all'] as const).map((value) =>
    h('button', {
      class: 'segment',
      text: value === 'open' ? 'To review' : 'All flagged',
      attrs: { role: 'radio' },
      onclick: () => {
        filter = value;
        paint();
      },
    }),
  );

  function paint() {
    tabs.forEach((tab, i) => {
      const on = (i === 0) === (filter === 'open');
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-checked', String(on));
    });
    const open = players.filter((p) => p.toReview > 0).length;
    const banned = players.filter((p) => p.restricted).length;
    summary.replaceChildren(stat(String(open), 'To review'), stat(String(banned), 'Banned from Ranked'), stat(String(players.length), 'Flagged'));
    const shown = filter === 'open' ? players.filter((p) => p.toReview > 0) : players;
    list.replaceChildren(
      ...(shown.length
        ? shown.map(card)
        : [h('p', { class: 'review-empty', text: filter === 'open' ? 'Nothing to review. All clear.' : 'No player has been flagged yet.' })]),
    );
  }

  async function load() {
    list.replaceChildren(h('p', { class: 'review-empty', text: 'Loading…' }));
    try {
      players = await source();
      paint();
    } catch (error) {
      list.replaceChildren(h('p', { class: 'review-empty', text: (error as Error).message }));
    }
  }

  function card(player: ReviewPlayer): HTMLElement {
    const latest = player.games[0];
    const act = (label: string, action: ModerationAction, days: number | null, primary = false) =>
      h('button', { class: `btn${primary ? ' btn-primary' : ''}`, text: label, onclick: () => confirmAction(player, action, days, label) });
    // The likely next step is the wide button: a ban while Ranked is open, lifting it once banned.
    // While banned, the other button switches to the other kind of ban.
    const actions = h(
      'div',
      { class: 'review-actions' },
      act('It was a mistake', 'clear', null),
      player.restricted && !player.restrictedUntil
        ? act('Ban 30 days instead', 'restrict', 30)
        : act('Ban until lifted', 'restrict', null),
      player.restricted ? act('Lift ban', 'lift', null, true) : act('Ban from Ranked 30 days', 'restrict', 30, true),
    );

    const games = h(
      'details',
      { class: 'review-games' },
      h('summary', { text: `Flagged games (${player.games.length})` }),
      ...player.games.map(gameRow),
    );

    return h(
      'section',
      { class: `review-card${player.toReview ? ' open' : ''}` },
      h(
        'div',
        { class: 'review-head' },
        h(
          'div',
          {},
          h('h2', { text: player.name }),
          h('p', { class: 'note', text: player.email ?? 'Guest account' }),
          h('p', { class: 'note', text: `Elo ${player.elo}` }),
        ),
        h('span', { class: `review-pill ${player.restricted ? 'banned' : 'allowed'}`, text: rankedStatus(player) }),
      ),
      h('p', { class: 'review-verdict', text: `${verdict(latest)}: ${why(latest)}` }),
      h('p', {
        class: 'note',
        text:
          `${player.toReview ? `${player.toReview} to review` : 'Reviewed'} · last flagged ${when(player.lastFlag)}` +
          (player.restricted && player.restrictionReason ? ` · Ban reason: ${player.restrictionReason}` : ''),
      }),
      games,
      actions,
    );
  }

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
      game.note ? h('span', { class: 'note', text: `Note: ${game.note}` }) : null,
    );
  }

  function confirmAction(player: ReviewPlayer, action: ModerationAction, days: number | null, label: string) {
    const explain: Record<string, string> = {
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
      void load();
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
    summary,
    h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': 'Show' } }, ...tabs),
    list,
  );
  void load();
  return { el };
}

function stat(value: string, label: string): HTMLElement {
  return h('div', { class: 'review-stat' }, h('strong', { text: value }), h('span', { text: label }));
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

function rankedStatus(player: ReviewPlayer): string {
  if (!player.restricted) return 'Ranked allowed';
  return player.restrictedUntil ? `Banned until ${day(player.restrictedUntil)}` : 'Banned until lifted';
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
