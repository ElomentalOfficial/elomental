import {
  HINT_PENALTY_S,
  MISTAKE_PENALTY_S,
  adjustedSeconds,
  compare,
  share,
  type ClashResult,
} from './clash.ts';
import { formatSeconds, h, toast } from './ui.ts';

/** Headline for a finished (or half-finished) clash, from my side. */
export function clashVerdict(mine: ClashResult, theirs?: ClashResult | null): { title: string; tone: '' | 'good' } {
  if (!theirs) return { title: mine.solved ? 'Time set!' : 'Square lost', tone: mine.solved ? 'good' : '' };
  const result = compare(mine, theirs);
  if (result > 0) return { title: 'You won the clash', tone: 'good' };
  if (result < 0) return { title: 'You lost the clash', tone: '' };
  return { title: 'Dead heat', tone: '' };
}

/**
 * You-vs-friend table: raw time, mistakes, hints, and the total that decides
 * the winner (time + penalties). The better value in each row is marked.
 */
export function clashTable(code: string, mine: ClashResult, theirs?: ClashResult | null): HTMLElement {
  const cell = (r: ClashResult | null | undefined, text: (r: ClashResult) => string, better: boolean) =>
    h('strong', { class: better ? 'good' : '', text: r ? text(r) : '—' });
  const lower = (a: number, b: number | undefined) => b !== undefined && a < b;

  const row = (label: string, value: (r: ClashResult) => number, text: (r: ClashResult) => string, solvedOnly = false) => {
    const a = solvedOnly && !mine.solved ? undefined : value(mine);
    const b = theirs && !(solvedOnly && !theirs.solved) ? value(theirs) : undefined;
    return h(
      'div',
      { class: 'clash-row' },
      h('span', { text: label }),
      cell(mine, (r) => (solvedOnly && !r.solved ? 'DNF' : text(r)), a !== undefined && lower(a, b)),
      cell(theirs, (r) => (solvedOnly && !r.solved ? 'DNF' : text(r)), b !== undefined && lower(b, a)),
    );
  };

  return h(
    'div',
    { class: 'clash-table', attrs: { 'aria-label': `Clash ${code} results` } },
    h('div', { class: 'clash-row clash-head' }, h('span', { text: code }), h('span', { text: 'You' }), h('span', { text: 'Friend' })),
    row('Time', (r) => r.seconds, (r) => formatSeconds(r.seconds), true),
    row('Mistakes', (r) => r.mistakes, (r) => String(r.mistakes)),
    row('Hints', (r) => r.hints, (r) => String(r.hints)),
    row('Total', adjustedSeconds, (r) => formatSeconds(adjustedSeconds(r)), true),
    h('p', {
      class: 'note',
      text: `Total = time + ${HINT_PENALTY_S}s per hint + ${MISTAKE_PENALTY_S}s per mistake. Lowest total wins.`,
    }),
  );
}

/** "Challenge a friend" / "Send result" button: native share sheet, else copy the link. */
export function shareButton(code: string, mine: ClashResult | undefined, label: string, primary = true): HTMLElement {
  return h('button', {
    class: primary ? 'btn btn-primary' : 'btn',
    text: label,
    onclick: async () => {
      const how = await share(code, mine);
      if (how === 'copied') toast('Link copied. Paste it to your friend.');
      else if (how === 'failed') toast(`Share failed. Your code is ${code}.`);
    },
  });
}
