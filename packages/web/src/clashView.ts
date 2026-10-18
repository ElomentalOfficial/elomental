import {
  HINT_PENALTY_S,
  MISTAKE_PENALTY_S,
  adjustedSeconds,
  compare,
  share,
  type ClashResult,
} from './clash.ts';
import { formatSeconds, h, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/** Headline for a finished (or half-finished) clash, from my side. */
export function clashVerdict(mine: ClashResult, theirs?: ClashResult | null): { title: string; tone: '' | 'good' } {
  if (!theirs) return { title: mine.solved ? copy.clash.verdict.timeSet : copy.clash.verdict.lost, tone: mine.solved ? 'good' : '' };
  const result = compare(mine, theirs);
  if (result > 0) return { title: copy.clash.verdict.won, tone: 'good' };
  if (result < 0) return { title: copy.clash.verdict.defeated, tone: '' };
  return { title: copy.clash.verdict.draw, tone: '' };
}

/**
 * You-vs-friend table: raw time, mistakes, hints, and the total that decides
 * the winner (time + penalties). The better value in each row is marked.
 */
export function clashTable(code: string, mine: ClashResult, theirs?: ClashResult | null): HTMLElement {
  const cell = (r: ClashResult | null | undefined, text: (r: ClashResult) => string, better: boolean) =>
    h('strong', { class: better ? 'good' : '', text: r ? text(r) : copy.clash.noTime });
  const lower = (a: number, b: number | undefined) => b !== undefined && a < b;

  const row = (label: string, value: (r: ClashResult) => number, text: (r: ClashResult) => string, solvedOnly = false) => {
    const a = solvedOnly && !mine.solved ? undefined : value(mine);
    const b = theirs && !(solvedOnly && !theirs.solved) ? value(theirs) : undefined;
    return h(
      'div',
      { class: 'clash-row' },
      h('span', { text: label }),
      cell(mine, (r) => (solvedOnly && !r.solved ? copy.clash.notFinished : text(r)), a !== undefined && lower(a, b)),
      cell(theirs, (r) => (solvedOnly && !r.solved ? copy.clash.notFinished : text(r)), b !== undefined && lower(b, a)),
    );
  };

  return h(
    'div',
    { class: 'clash-table', attrs: { 'aria-label': copy.clash.a11y.table(code) } },
    h('div', { class: 'clash-row clash-head' }, h('span', { text: code }), h('span', { text: copy.common.you }), h('span', { text: copy.common.friend })),
    row(copy.clash.table.time, (r) => r.seconds, (r) => formatSeconds(r.seconds), true),
    row(copy.clash.table.mistakes, (r) => r.mistakes, (r) => String(r.mistakes)),
    row(copy.clash.table.hints, (r) => r.hints, (r) => String(r.hints)),
    row(copy.clash.table.total, adjustedSeconds, (r) => formatSeconds(adjustedSeconds(r)), true),
    h('p', {
      class: 'note',
      text: copy.clash.totalRule(HINT_PENALTY_S, MISTAKE_PENALTY_S),
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
      if (how === 'copied') toast(copy.clash.linkCopied);
      else if (how === 'failed') toast(copy.clash.shareFailed(code));
    },
  });
}
