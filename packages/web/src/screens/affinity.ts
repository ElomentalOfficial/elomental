import { crestSvg } from '../avatar.ts';
import { chooseAffinity, loadStandings, putOffAffinity, type Standing } from '../backend/affinity.ts';
import { loadLoadout } from '../backend/forge.ts';
import { ELEMENTS, type Element } from '../profile.ts';
import { closeButton, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * Choosing an affinity (docs/PROGRESSION_DESIGN.md §13.2), opened from Home's line after the
 * third solved square: the four elements, each with its crest, its line and this month's
 * standing, the weakest side tagged "Needs you". Joining asks once (it holds for the
 * season), then sets it. "Decide later" puts Home's line away for 5 solves. The Profile's
 * Change button opens it again while switching is allowed (the first 7 days of a season),
 * and it goes back to wherever it was opened from.
 */
export function affinityScreen(back: () => Screen = homeScreen): Screen {
  const grid = h('div', { class: 'affinity-grid' });
  const later = h('button', {
    class: 'btn',
    text: copy.affinity.later,
    onclick: () => {
      putOffAffinity();
      void goBack(back);
    },
  });
  const el = subPage(
    { className: 'affinity', title: copy.affinity.title, onBack: () => void goBack(back) },
    h('div', { class: 'affinity-body' }, h('p', { class: 'affinity-intro', text: copy.affinity.intro }), grid, later),
  );

  const render = (standings: Standing[] | null) => {
    const place = (e: Element) => (standings ? standings.findIndex((s) => s.affinity === e) + 1 : 0);
    // the side with the lowest strength (standings come best first), once anyone counts
    const active = standings?.some((s) => s.members > 0);
    const weakest = active ? standings![standings!.length - 1] : null;
    const fewest = weakest && weakest.standing < standings![0].standing ? weakest.affinity : null;
    grid.replaceChildren(
      ...ELEMENTS.map((e) => {
        const s = standings?.find((x) => x.affinity === e);
        const name = copy.forge.elements[e];
        const line = copy.affinity.character[e];
        const where = place(e) ? copy.affinity.place(place(e)) : '';
        return h(
          'button',
          {
            class: `affinity-card el-${e}`,
            attrs: { type: 'button', 'aria-label': copy.affinity.a11yCard(name, line, where, fewest === e) },
            onclick: () => confirm(e),
          },
          fewest === e ? h('span', { class: 'affinity-tag', text: copy.affinity.needsYou, attrs: { 'aria-hidden': 'true' } }) : null,
          h('span', { class: 'affinity-art', html: crestSvg(e, 2), attrs: { 'aria-hidden': 'true' } }),
          h('strong', { class: 'affinity-name', text: name, attrs: { 'aria-hidden': 'true' } }),
          h('span', { class: 'affinity-line', text: line, attrs: { 'aria-hidden': 'true' } }),
          s && where
            ? h(
                'span',
                { class: 'affinity-standing', attrs: { 'aria-hidden': 'true' } },
                h('strong', { text: `${where} ${copy.affinity.thisMonth.toLowerCase()}` }),
                h('span', { text: copy.affinity.members(s.members) }),
              )
            : null,
        );
      }),
    );
  };

  function confirm(e: Element) {
    const name = copy.forge.elements[e];
    const join = h('button', { class: 'btn btn-primary', text: copy.affinity.join });
    join.addEventListener('click', () => {
      join.disabled = true;
      void chooseAffinity(e).then((err) => {
        close();
        if (err) {
          toast(err);
          return;
        }
        toast(copy.affinity.joined(name));
        void loadLoadout().finally(() => void goBack(back));
      });
    });
    const close = openModal(
      h(
        'div',
        { class: 'sheet affinity-confirm' },
        closeButton(() => close()),
        h('span', { class: 'affinity-art', html: crestSvg(e, 3), attrs: { 'aria-hidden': 'true' } }),
        h('h2', { text: copy.affinity.confirmTitle(name) }),
        h('p', { class: 'note', text: copy.affinity.confirmText }),
        join,
      ),
    );
  }

  render(null);
  void loadStandings().then((s) => el.isConnected && render(s));
  return { el, title: copy.affinity.title };
}
