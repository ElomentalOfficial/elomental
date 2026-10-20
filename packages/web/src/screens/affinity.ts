import { avatarSvg } from '../avatar.ts';
import { chooseAffinity, loadStandings, markAffinityPrompted, type Standing } from '../backend/affinity.ts';
import { loadLoadout } from '../backend/forge.ts';
import { ELEMENTS, type Element } from '../profile.ts';
import { closeButton, goBack, h, openModal, subPage, toast, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

/**
 * Choosing an affinity (docs/PROGRESSION_DESIGN.md §13.2), shown once after the third
 * solved square: the four elements, each with its line and this month's standing, the
 * smallest side tagged "Needs you". Joining asks once (it holds for the season), then
 * gives that element's crest. "Decide later" asks again after the next solve.
 */
export function affinityScreen(): Screen {
  markAffinityPrompted();
  const grid = h('div', { class: 'affinity-grid' });
  const later = h('button', { class: 'btn', text: copy.affinity.later, onclick: () => void goBack(homeScreen) });
  const el = subPage(
    { className: 'affinity', title: copy.affinity.title, onBack: () => void goBack(homeScreen) },
    h('div', { class: 'affinity-body' }, h('p', { class: 'affinity-intro', text: copy.affinity.intro }), grid, later),
  );

  const render = (standings: Standing[] | null) => {
    const place = (e: Element) => (standings ? standings.findIndex((s) => s.affinity === e) + 1 : 0);
    const active = standings?.some((s) => s.members > 0);
    const fewest = active ? [...standings!].sort((a, b) => a.members - b.members)[0].affinity : null;
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
            attrs: { type: 'button', 'aria-label': copy.affinity.a11yCard(name, line, where) },
            onclick: () => confirm(e),
          },
          fewest === e ? h('span', { class: 'affinity-tag', text: copy.affinity.needsYou, attrs: { 'aria-hidden': 'true' } }) : null,
          h('span', { class: 'affinity-art', html: avatarSvg({ backdrop: `s0-backdrop-${e}-1`, sigil: `s0-sigil-${e}-1` }), attrs: { 'aria-hidden': 'true' } }),
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
        // the new crest shows on Home's avatar straight away
        void loadLoadout().finally(() => void goBack(homeScreen));
      });
    });
    const close = openModal(
      h(
        'div',
        { class: 'sheet affinity-confirm' },
        closeButton(() => close()),
        h('span', { class: 'affinity-art', html: avatarSvg({ backdrop: `s0-backdrop-${e}-1`, sigil: `s0-sigil-${e}-1`, crest: `s0-crest-${e}` }), attrs: { 'aria-hidden': 'true' } }),
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
