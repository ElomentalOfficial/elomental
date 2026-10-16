import { ICONS } from '../icons.ts';
import { getTheme, setTheme, type Theme } from '../theme.ts';
import { resetTutorial } from '../tutorial.ts';
import { deviceInfo } from '../viewport.ts';
import { goBack, h, mount, toast, type Screen } from '../ui.ts';
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

  // Hidden diagnostics: five taps on the title show what the phone reports about its screen.
  const title = h('h1', { text: 'Setup' });
  const info = h('pre', { class: 'device-info' });
  let taps = 0;
  title.addEventListener('click', () => {
    if (++taps < 5) return;
    taps = 0;
    info.textContent = info.textContent ? '' : deviceInfo().join('\n');
  });

  const el = h(
    'div',
    { class: 'screen setup' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': 'Back' }, onclick: () => void goBack(homeScreen) }),
      title,
      h('span', { class: 'icon-btn-spacer' }),
    ),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: 'Theme' }), h('p', { text: 'Dark is the default.' })),
      h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': 'Theme' } }, ...buttons),
    ),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: 'Tutorial' }), h('p', { text: 'How to fill squares, take notes, erase and undo.' })),
      h('button', {
        class: 'btn',
        text: 'Show again next game',
        onclick: () => {
          resetTutorial();
          toast('The tutorial will play at the start of your next game');
        },
      }),
    ),
    info,
  );
  return { el };
}
