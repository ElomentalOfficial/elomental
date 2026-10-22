import { signedIn } from './backend.ts';
import { cycleNews, cycleNewsSeen } from './backend/cycles.ts';
import { badgeLabel } from './badges.ts';
import { h, openModal } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * "While you were away" (migration cycles): once a season has ended or a faction month was
 * settled since the player last looked, one pop-up on Home says what came of it. Everything in
 * it was already paid and reset on the server; this only tells. Asked once per launch, shown
 * after the splash and never over another pop-up; seen once it's shown.
 */
let asked = false;

export function showAwayNews(): void {
  if (asked || !signedIn()) return;
  asked = true;
  void cycleNews().then((news) => {
    if (!news || (!news.seasons.length && !news.months.length)) return;
    const t = copy.away;
    const lines: HTMLElement[] = [];
    for (const s of news.seasons) {
      const name = copy.seasonName(s.id, s.name);
      lines.push(h('p', { text: t.season(name, s.bestTier == null ? null : copy.common.ranks[s.bestTier]) }));
      if (s.badge) lines.push(h('p', { text: t.seasonBadge(badgeLabel(s.badge).text) }));
      if (s.elo !== s.eloAfter) lines.push(h('p', { text: t.seasonElo(s.elo, s.eloAfter) }));
    }
    for (const m of news.months) {
      const month = new Date(m.month).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const side = copy.forge.elements[m.side];
      lines.push(h('p', { text: m.won ? t.monthWon(month, side, m.badge) : t.monthLost(month, side) }));
    }
    const show = () => {
      // after the splash, and never over another pop-up
      if (!document.querySelector('.screen.home') || document.querySelector('.modal')) return void setTimeout(show, 800);
      const close = openModal(
        h('div', { class: 'confirm away-news' },
          h('h2', { text: t.title }),
          ...lines,
          h('button', { class: 'btn btn-primary', text: t.ok, attrs: { type: 'button' }, onclick: () => close() })),
      );
      // shown is seen (it closes with Esc or a tap outside too)
      void cycleNewsSeen();
    };
    setTimeout(show, 800);
  });
}
