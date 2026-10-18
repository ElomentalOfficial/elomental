import { ICONS } from '../icons.ts';
import { goBack, h, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';
import * as copy from '../copy/en.ts';

/** Setup > Accessibility > Accessibility statement: what works, the known limits, and how to tell us. */
export function statementScreen(): Screen {
  const s = copy.statement;
  const list = (items: readonly string[]) => h('ul', { class: 'statement-list' }, ...items.map((text) => h('li', { text })));
  const el = h(
    'div',
    { class: 'screen setup statement scrollable' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': copy.common.back }, onclick: () => void goBack(setupScreen) }),
      h('h1', { text: s.title }),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h('section', { class: 'setting' }, h('p', { text: s.intro })),
    h('section', { class: 'setting' }, h('h2', { text: s.supportedTitle }), list(s.supported)),
    h('section', { class: 'setting' }, h('h2', { text: s.limitsTitle }), list(s.limits)),
    h(
      'section',
      { class: 'setting' },
      h('h2', { text: s.feedbackTitle }),
      h('p', { text: s.feedback }),
      h('a', { class: 'btn statement-link', text: s.feedbackLink, attrs: { href: s.feedbackUrl, target: '_blank', rel: 'noopener' } }),
      h('p', { class: 'note', text: s.reviewed }),
    ),
  );
  return { el, title: s.title };
}
