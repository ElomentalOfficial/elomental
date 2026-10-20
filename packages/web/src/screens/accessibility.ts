import { DEFAULTS, TEXT_SIZES, a11yPrefs, finePointer, onA11yChange, type A11yPrefs } from '../a11y.ts';
import { saveSettings } from '../backend.ts';
import { choice as titled, segmented, settingGroup } from '../controls.ts';
import { openShortcuts } from '../shortcuts.ts';
import { goBack, h, mount, openModal, subPage, toast, type Screen } from '../ui.ts';
import { setupScreen } from './setup.ts';
import { statementScreen } from './statement.ts';
import * as copy from '../copy/en.ts';

/**
 * One choice: a title, an optional help line and a row of options (a radio
 * group). Reads and writes a11y.ts preferences, saved to the account too.
 */
function choice<K extends keyof A11yPrefs>(key: K, label: string, help: string | null, options: [A11yPrefs[K], string][]): HTMLElement {
  const id = `a11y-${key}`;
  const control = segmented({
    options: options.map(([value, text]) => ({ value, label: text })),
    current: () => a11yPrefs()[key],
    // On this device at once, and on the account so other devices follow.
    pick: (value) => saveSettings({ a11y: { [key]: value } as Partial<A11yPrefs> }),
    labelledBy: id,
    cols: true,
  });
  // Choices saved on another device arrive with the account refresh.
  const stop = onA11yChange(() => {
    if (!control.el.isConnected) return void stop();
    control.paint();
  });
  return titled(id, label, help, control.el);
}

/**
 * Asks first, then puts every accessibility choice back to its default, on this device
 * and on the account. The choices on the page update themselves (they listen for changes).
 */
function confirmReset(): void {
  const t = copy.setup.a11y;
  const close = openModal(
    h(
      'div',
      { class: 'confirm' },
      h('p', { text: t.resetConfirm }),
      h(
        'div',
        { class: 'actions' },
        h('button', {
          class: 'btn btn-primary',
          text: t.resetYes,
          onclick: () => {
            close();
            saveSettings({ a11y: { ...DEFAULTS } });
            toast(t.resetDone);
          },
        }),
        h('button', { class: 'btn', text: copy.common.cancel, onclick: () => close() }),
      ),
    ),
  );
}

const group = (title: string, ...items: (HTMLElement | null)[]) => settingGroup(title, items);

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
      // only where there's a pointer to draw: a mouse or a trackpad
      finePointer()
        ? choice('cursor', t.cursor, t.cursorHelp, [
            ['gem', t.gem],
            ['system', t.system],
          ])
        : null,
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
    group(
      t.groups.help,
      h('button', { class: 'btn', text: t.shortcuts, onclick: () => openShortcuts() }),
      h('button', { class: 'btn', text: t.statement, onclick: () => mount(statementScreen()) }),
    ),
    // Last, after everything it would undo: back to the defaults, after a check.
    group(
      t.resetGroup,
      h('p', { class: 'field-hint', text: t.resetHelp }),
      h('button', { class: 'btn', text: t.reset, onclick: () => confirmReset() }),
    ),
  );
  return { el, title: t.title };
}
