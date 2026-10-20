import { signUpForm } from '../accountForm.ts';
import {
  NAME_COOLDOWN_DAYS,
  cachedAccount,
  formatDay,
  isFounder,
  onAccountChange,
  registered,
  saveSettings,
  setDisplayName,
  signOut,
} from '../backend.ts';
import { ICONS } from '../icons.ts';
import { addToHome, canAddToHome } from '../install.ts';
import { notesWheelOn } from '../settings.ts';
import { getTheme, type Theme } from '../theme.ts';
import { deviceInfo } from '../viewport.ts';
import { closeButton, goBack, h, mount, openModal, subPage, toast, type Screen } from '../ui.ts';
import { accessibilityScreen } from './accessibility.ts';
import { homeScreen } from './home.ts';
import { devScreen } from './dev.ts';
import { founderUnlocked, hasAuthenticator, startEnrolment, verifyCode } from '../backend/founder.ts';
import * as copy from '../copy/en.ts';

export function setupScreen(): Screen {
  const options: { theme: Theme; label: string; icon: string }[] = [
    { theme: 'dark', label: copy.setup.dark, icon: ICONS.moon },
    { theme: 'light', label: copy.setup.light, icon: ICONS.sun },
  ];

  const buttons = options.map((o) =>
    h(
      'button',
      {
        class: 'segment',
        attrs: { role: 'radio', 'data-theme-option': o.theme },
        onclick: () => {
          saveSettings({ theme: o.theme });
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

  const wheelButtons = [true, false].map((on) =>
    h(
      'button',
      {
        class: 'segment',
        attrs: { role: 'radio' },
        onclick: () => {
          saveSettings({ notesWheel: on });
          syncWheel();
        },
      },
      h('span', { text: on ? copy.common.on : copy.common.off }),
    ),
  );
  const syncWheel = () => {
    const current = notesWheelOn();
    wheelButtons.forEach((b, i) => {
      const on = (i === 0) === current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
  };
  syncWheel();
  // Settings saved on another device arrive with the account refresh.
  const stopSync = onAccountChange(() => {
    if (!wheelButtons[0].isConnected) return stopSync();
    sync();
    syncWheel();
  });

  // Hidden diagnostics: five taps on the title show what the phone reports about its screen.
  const title = h('h1', { text: copy.setup.title });
  const info = h('pre', { class: 'device-info' });
  let taps = 0;
  title.addEventListener('click', () => {
    if (++taps < 5) return;
    taps = 0;
    info.textContent = info.textContent ? '' : deviceInfo().join('\n');
  });

  const el = subPage(
    { className: 'setup', title, onBack: () => void goBack(homeScreen) },
    accountSection(),
    founderGate(),
    devSection(),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: copy.setup.theme }), h('p', { text: copy.setup.themeHelp })),
      h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': copy.setup.theme } }, ...buttons),
    ),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: copy.setup.notesWheel }), h('p', { text: copy.setup.notesWheelHelp })),
      h('div', { class: 'segmented', attrs: { role: 'radiogroup', 'aria-label': copy.setup.notesWheel } }, ...wheelButtons),
    ),
    accessibilityLink(),
    addToHomeRow(),
    h(
      'section',
      { class: 'setting' },
      h('div', {}, h('h2', { text: copy.setup.tutorial }), h('p', { text: copy.setup.tutorialHelp })),
      h('button', {
        class: 'btn',
        text: copy.setup.tutorialReplay,
        onclick: () => {
          saveSettings({ tutorialDone: false });
          toast(copy.setup.tutorialQueued);
        },
      }),
    ),
    info,
  );
  return { el, title: copy.setup.title };
}

/** Setup's way into the Accessibility page (screens/accessibility.ts). */
function accessibilityLink(): HTMLElement {
  const t = copy.setup.a11y;
  return h(
    'section',
    { class: 'setting' },
    h('div', {}, h('h2', { text: t.title }), h('p', { text: t.summary })),
    h('button', { class: 'btn', text: t.open, onclick: () => mount(accessibilityScreen()) }),
  );
}

/** Phones and tablets in the browser: how to put Elomental on the Home Screen (install.ts). */
function addToHomeRow(): HTMLElement | null {
  if (!canAddToHome()) return null;
  const t = copy.install;
  return h(
    'section',
    { class: 'setting' },
    h('div', {}, h('h2', { text: t.title }), h('p', { text: t.help })),
    h('button', { class: 'btn', text: t.open, onclick: () => void addToHome() }),
  );
}

/**
 * Founders whose session hasn't given an authenticator code yet: the one way to unlock
 * Review and Dev mode. Set up the authenticator the first time, then enter a code.
 */
function founderGate(): HTMLElement {
  const t = copy.founder;
  const button = h('button', { class: 'btn', text: t.unlock, attrs: { type: 'button' } });
  const section = h('section', { class: 'setting' }, h('div', {}, h('h2', { text: t.title }), h('p', { text: t.lockedHelp })), button);
  let enrolled: boolean | null = null;
  button.addEventListener('click', () => (enrolled === false ? openSetUp() : openCode()));
  const paint = () => {
    section.hidden = !isFounder() || !!cachedAccount()?.anonymous || founderUnlocked();
    if (section.hidden) return;
    void hasAuthenticator().then((has) => {
      enrolled = has;
      button.textContent = has === false ? t.setUp : t.unlock;
    });
  };
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    paint();
  });
  return section;
}

/** A 6-digit code field, a Verify button and an error line, for the founder sheets. */
function codeForm(check: (code: string) => Promise<string | null>, done: () => void): HTMLElement {
  const t = copy.founder;
  const field = h('input', {
    class: 'text-field mfa-code',
    attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', 'aria-label': t.codeLabel, placeholder: '000000' },
  });
  const error = h('p', { class: 'field-error', attrs: { role: 'alert' } });
  const verify = h('button', { class: 'btn btn-primary', text: t.verify, attrs: { type: 'submit' } });
  const form = h('form', { class: 'code-form' }, field, error, verify);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = field.value.replace(/\D/g, '');
    if (code.length !== 6) return void (error.textContent = t.wrongCode);
    verify.disabled = true;
    void check(code).then((err) => {
      verify.disabled = false;
      if (err) {
        error.textContent = err;
        field.select();
        return;
      }
      toast(t.unlocked);
      done();
    });
  });
  return form;
}

/** Enter a code from the authenticator that's already set up. */
function openCode(): void {
  const t = copy.founder;
  const close = openModal(
    h('div', { class: 'sheet founder-sheet' }, closeButton(() => close()), h('h2', { text: t.unlockTitle }), h('p', { text: t.unlockText }),
      codeForm((code) => verifyCode(code), () => close())),
  );
}

/** The first time: a QR code (and its key) for the authenticator app, then its code. */
function openSetUp(): void {
  const t = copy.founder;
  void startEnrolment().then((e) => {
    if (typeof e === 'string') return toast(e);
    const close = openModal(
      h('div', { class: 'sheet founder-sheet' }, closeButton(() => close()), h('h2', { text: t.setUpTitle }), h('p', { text: t.setUpSteps }),
        h('img', { class: 'founder-qr', attrs: { src: e.qr, alt: t.a11yQr, width: '180', height: '180' } }),
        h('p', { class: 'founder-key' }, h('span', { text: `${t.keyLabel} ` }), h('code', { text: e.secret.replace(/(.{4})(?=.)/g, '$1 ') })),
        codeForm((code) => verifyCode(code, e.factorId), () => close())),
    );
  });
}

/** Founders only: the way into Dev mode (screens/dev.ts; the server checks every tool). */
function devSection(): HTMLElement {
  const help = h('p');
  const section = h(
    'section',
    { class: 'setting' },
    h('div', {}, h('h2', { text: copy.setup.dev }), help),
    h('button', { class: 'btn', text: copy.setup.openDev, onclick: () => mount(devScreen()) }),
  );
  const paint = () => {
    section.hidden = !founderUnlocked();
    help.textContent = copy.setup.devHelp(!!cachedAccount()?.devMode);
  };
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    paint();
  });
  return section;
}

/** Registered: name and sign-out. Guest: the passwordless sign-up form. */
function accountSection(): HTMLElement {
  const section = h('section', { class: 'setting account' });
  let busy = false;

  const field = (attrs: Record<string, string>) => h('input', { class: 'text-field', attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...attrs } });
  const error = h('p', { class: 'field-error', attrs: { role: 'alert' } });
  const fail = (message: string | null) => {
    error.textContent = message ?? '';
    return !message;
  };
  const run = async (button: HTMLButtonElement, task: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      await task();
    } finally {
      busy = false;
      button.disabled = false;
    }
  };

  function paint() {
    const account = cachedAccount();
    error.textContent = '';
    if (account && !account.anonymous) {
      // A name can change once every 15 days; while locked, the field just shows it.
      const locked = account.nextNameChange;
      const name = field({ type: 'text', maxlength: '20', 'aria-label': copy.account.playerName, value: account.name });
      name.disabled = !!locked;
      const save = h('button', { class: 'btn', text: copy.account.saveName });
      save.addEventListener('click', () =>
        run(save, async () => {
          if (name.value.trim() === account.name) return;
          if (!fail(await setDisplayName(name.value))) return;
          toast(copy.account.nameSaved);
          paint();
        }),
      );
      const out = h('button', { class: 'btn', text: copy.account.signOut });
      out.addEventListener('click', () => run(out, () => signOut()));
      section.replaceChildren(
        h('div', {}, h('h2', { text: copy.account.title }), h('p', { text: copy.account.signedInAs(account.email) })),
        h('label', { class: 'field-label', text: copy.account.playerName }),
        name,
        h('p', {
          class: 'field-hint',
          text: locked
            ? copy.account.nameAgainOnHint(formatDay(locked))
            : copy.account.nameCooldown(NAME_COOLDOWN_DAYS),
        }),
        ...(locked ? [] : [save]),
        error,
        out,
      );
      return;
    }

    section.replaceChildren(
      signUpForm({
        title: copy.account.title,
        text: account?.anonymous ? copy.account.guestIntro : copy.account.signInIntro,
      }),
    );
  }

  // Repaint only when the account kind changes, so a background refresh
  // never throws away a half-typed email or code.
  let shown = registered();
  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    if (registered() === shown) return;
    shown = registered();
    paint();
  });
  return section;
}
