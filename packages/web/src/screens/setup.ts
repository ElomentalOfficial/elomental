import { signUpForm } from '../accountForm.ts';
import { NAME_COOLDOWN_DAYS, cachedAccount, formatDay, onAccountChange, registered, setDisplayName, signOut } from '../backend.ts';
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
    { class: 'screen setup scrollable' },
    h(
      'div',
      { class: 'subbar' },
      h('button', { class: 'icon-btn', html: ICONS.back, attrs: { 'aria-label': 'Back' }, onclick: () => void goBack(homeScreen) }),
      title,
      h('span', { class: 'icon-btn-spacer' }),
    ),
    accountSection(),
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
      const name = field({ type: 'text', maxlength: '20', 'aria-label': 'Player name', value: account.name });
      name.disabled = !!locked;
      const save = h('button', { class: 'btn', text: 'Save name' });
      save.addEventListener('click', () =>
        run(save, async () => {
          if (name.value.trim() === account.name) return;
          if (!fail(await setDisplayName(name.value))) return;
          toast('Name saved');
          paint();
        }),
      );
      const out = h('button', { class: 'btn', text: 'Sign out' });
      out.addEventListener('click', () => run(out, () => signOut()));
      section.replaceChildren(
        h('div', {}, h('h2', { text: 'Account' }), h('p', { text: `Signed in as ${account.email}` })),
        h('label', { class: 'field-label', text: 'Player name' }),
        name,
        h('p', {
          class: 'field-hint',
          text: locked
            ? `You can change your name again on ${formatDay(locked)}.`
            : `You can change your name once every ${NAME_COOLDOWN_DAYS} days.`,
        }),
        ...(locked ? [] : [save]),
        error,
        out,
      );
      return;
    }

    section.replaceChildren(
      signUpForm({
        title: 'Account',
        text: account?.anonymous
          ? 'Playing as a guest. Sign up with just your email (no password) to keep your Elo, Stardust and Daily streak on any device.'
          : 'Sign in with just your email, no password. Your Elo, Stardust and Clash results are saved and checked on the server.',
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
