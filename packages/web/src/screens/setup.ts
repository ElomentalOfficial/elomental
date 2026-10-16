import { ICONS } from '../icons.ts';
import { getTheme, setTheme, type Theme } from '../theme.ts';
import { h, mount, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';

export function setupScreen(): Screen {
  const options: { theme: Theme; label: string; icon: string }[] = [
    { theme: 'dark', label: 'Dark', icon: ICONS.moon },
    { theme: 'light', label: 'Light', icon: ICONS.sun },
  ];

  const buttons = options.map((o) =>
    h(
      'button',
      {
        class: 'segment',
        attrs: { role: 'radio', 'data-theme-option': o.theme },
        onclick: () => {
          setTheme(o.theme);
          sync();
        },
      },
      h('span', { class: 'segment-icon', html: o.icon }),
      h('span', { text: o.label }),
    ),
  );
  const sync = () => {
    const current = getTheme();
    for (const b of buttons) {
      const on = b.dataset.themeOption === current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  sync();

  const el = h(
    'div',
    { class: 'screen setup' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': 'Back' }, onclick: () => mount(homeScreen()) }),
      h('h1', { text: 'Setup' }),
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: 'Theme' }), h('p', { text: 'Dark is the default.' })),
      h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': 'Theme' } }, ...buttons),
    ),
  );
  return { el };
}
