import { TEXT_SIZES, a11yPrefs, onA11yChange, type A11yPrefs } from '../a11y.ts';
import { saveSettings } from '../backend.ts';
import { openShortcuts } from '../shortcuts.ts';
import { goBack, h, mount, subPage, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';
import { statementScreen } from './statement.ts';
import * as copy from '../copy/en.ts';

/**
 * One choice: a title, an optional help line and a row of options (a radio
 * group). Reads and writes a11y.ts preferences, saved to the account too.
 */
function choice<K extends keyof A11yPrefs>(key: K, label: string, help: string | null, options: [A11yPrefs[K], string][]): HTMLElement {
  const buttons = options.map(([value, text]) =>
    h('button', {
      class: 'segment',
      text,
      attrs: { role: 'radio' },
      onclick: () => {
        // On this device at once, and on the account so other devices follow.
        saveSettings({ a11y: { [key]: value } as Partial<A11yPrefs> });
        sync();
      },
    }),
  );
  const sync = () => {
    const current = a11yPrefs()[key];
    buttons.forEach((b, i) => {
      const on = options[i][0] === current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  };
  sync();
  // Choices saved on another device arrive with the account refresh.
  const stop = onA11yChange(() => {
    if (!buttons[0].isConnected) return void stop();
    sync();
  });
  const id = `a11y-${key}`;
  return h(
    'div',
    { class: 'choice' },
    h('h3', { text: label, attrs: { id } }),
    help ? h('p', { text: help }) : null,
    h('div', { class: `segmented cols-${options.length}`, attrs: { role: 'radiogroup', 'aria-labelledby': id } }, ...buttons),
  );
}

/** A titled group: the title over one card holding its choices. */
const group = (title: string, ...items: HTMLElement[]) =>
  h('section', { class: 'setting-group' }, h('h2', { text: title }), h('div', { class: 'setting choice-list' }, ...items));

/** Setup > Accessibility: every accessibility preference, grouped (a11y.ts; docs/ACCESSIBILITY_AUDIT.md section 4). */
export function accessibilityScreen(): Screen {
  const t = copy.setup.a11y;
  const onOff: [boolean, string][] = [
    [true, copy.common.on],
    [false, copy.common.off],
  ];
  const el = subPage(
    { className: 'setup accessibility', title: t.title, onBack: () => void goBack(setupScreen) },
    h('p', { class: 'page-intro', text: t.intro }),
    group(
      t.groups.see,
      choice('textSize', t.textSize, t.textSizeHelp, TEXT_SIZES.map((n) => [n, t.percent(n)])),
      choice('contrast', t.contrast, t.contrastHelp, [
        ['system', t.system],
        ['standard', t.standard],
        ['high', t.high],
      ]),
      choice('colourBlind', t.colourBlind, t.colourBlindHelp, onOff),
    ),
    group(
      t.groups.calm,
      choice('motion', t.motion, t.motionHelp, [
        ['system', t.system],
        ['reduce', t.reduce],
      ]),
      choice('showTimer', t.timer, t.timerHelp, [
        [true, t.show],
        [false, t.hide],
      ]),
    ),
    group(
      t.groups.board,
      choice('highlightLines', t.lines, t.linesHelp, onOff),
      choice('highlightBox', t.box, null, onOff),
      choice('highlightSame', t.same, null, onOff),
      choice('keepWrong', t.wrong, t.wrongHelp, [
        [false, t.briefly],
        [true, t.untilNextMove],
      ]),
      choice('casualMistakeLimit', t.mistakeLimit, t.mistakeLimitHelp, onOff),
    ),
    group(t.groups.feedback, choice('haptics', t.haptics, null, onOff), choice('sounds', t.sounds, t.soundsHelp, onOff)),
    h(
      'section',
      { class: 'setting-group' },
      h('h2', { text: t.groups.help }),
      h(
        'div',
        { class: 'setting choice-list' },
        h('button', { class: 'btn', text: t.shortcuts, onclick: () => openShortcuts() }),
        h('button', { class: 'btn', text: t.statement, onclick: () => mount(statementScreen()) }),
      ),
    ),
  );
  return { el, title: t.title };
}
