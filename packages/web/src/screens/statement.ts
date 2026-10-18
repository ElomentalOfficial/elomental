import { goBack, h, subPage, type Screen } from '../ui.ts';
import { accessibilityScreen } from './accessibility.ts';
import * as copy from '../copy/en.ts';

/** Setup > Accessibility > Accessibility statement: what works, the known limits, and how to tell us. */
export function statementScreen(): Screen {
  const s = copy.statement;
  const list = (items: readonly string[]) => h('ul', { class: 'statement-list' }, ...items.map((text) => h('li', { text })));
  const el = subPage(
    { className: 'setup statement', title: s.title, onBack: () => void goBack(accessibilityScreen) },
    h('p', { class: 'page-intro', text: s.intro }),
    h('section', { class: 'setting-group' }, h('h2', { text: s.supportedTitle }), h('div', { class: 'setting' }, list(s.supported))),
    h('section', { class: 'setting-group' }, h('h2', { text: s.limitsTitle }), h('div', { class: 'setting' }, list(s.limits))),
    h(
      'section',
      { class: 'setting-group' },
      h('h2', { text: s.feedbackTitle }),
      h(
        'div',
        { class: 'setting' },
        h('p', { text: s.feedback }),
        h('a', { class: 'btn statement-link', text: s.feedbackLink, attrs: { href: s.feedbackUrl, target: '_blank', rel: 'noopener' } }),
        h('p', { class: 'note', text: s.reviewed }),
      ),
    ),
  );
  return { el, title: s.title };
}
