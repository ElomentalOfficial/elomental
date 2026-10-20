import { settingGroup } from '../controls.ts';
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
    settingGroup(s.supportedTitle, [list(s.supported)], 'setting'),
    settingGroup(s.limitsTitle, [list(s.limits)], 'setting'),
    settingGroup(
      s.feedbackTitle,
      [
        h('p', { text: s.feedback }),
        h('a', { class: 'btn statement-link', text: s.feedbackLink, attrs: { href: s.feedbackUrl, target: '_blank', rel: 'noopener' } }),
        h('p', { class: 'note', text: s.reviewed }),
      ],
      'setting',
    ),
  );
  return { el, title: s.title };
}
