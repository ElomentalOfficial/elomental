import { cachedAccount, onAccountChange, refreshAccount, sendSignInEmail, setDisplayName, signOut, verifyCode } from '../backend.ts';
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

/**
 * Passwordless account: enter an email, then the code from the email (or tap
 * its link). The code matters on iPhone: a link opens Safari, not the
 * home-screen app, so only the code signs the app itself in.
 */
function accountSection(): HTMLElement {
  const section = h('section', { class: 'setting account' });
  let email = '';
  let step: 'email' | 'code' = 'email';
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
    if (account) {
      const name = field({ type: 'text', maxlength: '20', 'aria-label': 'Player name', value: account.name });
      const save = h('button', { class: 'btn', text: 'Save name' });
      save.addEventListener('click', () =>
        run(save, async () => {
          if (name.value.trim() === account.name) return;
          if (fail(await setDisplayName(name.value))) toast('Name saved');
        }),
      );
      const out = h('button', { class: 'btn', text: 'Sign out' });
      out.addEventListener('click', () => run(out, () => signOut()));
      section.replaceChildren(
        h('div', {}, h('h2', { text: 'Account' }), h('p', { text: `Signed in as ${account.email}` })),
        h('label', { class: 'field-label', text: 'Player name' }),
        name,
        save,
        error,
        out,
      );
      return;
    }

    if (step === 'email') {
      const input = field({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email' });
      input.value = email;
      const send = h('button', { class: 'btn btn-primary', text: 'Email me a sign-in code' });
      send.addEventListener('click', () =>
        run(send, async () => {
          email = input.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(email)) return void fail('Enter your email address');
          if (!fail(await sendSignInEmail(email))) return;
          step = 'code';
          paint();
        }),
      );
      section.replaceChildren(
        h(
          'div',
          {},
          h('h2', { text: 'Account' }),
          h('p', { text: 'Sign in with just your email, no password. Your Elo, Stardust and Clash results are saved and checked on the server.' }),
        ),
        input,
        send,
        error,
      );
      return;
    }

    const code = field({ type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '123456', 'aria-label': 'Sign-in code' });
    const verify = h('button', { class: 'btn btn-primary', text: 'Sign in' });
    verify.addEventListener('click', () =>
      run(verify, async () => {
        const token = code.value.replace(/\D/g, '');
        if (token.length < 6) return void fail('Enter the code from the email');
        if (!fail(await verifyCode(email, token))) return;
        await refreshAccount();
        toast('Signed in');
      }),
    );
    const back = h('button', { class: 'link-btn', text: 'Use a different email' });
    back.addEventListener('click', () => {
      step = 'email';
      paint();
    });
    section.replaceChildren(
      h('div', {}, h('h2', { text: 'Check your email' }), h('p', { text: `We sent a code to ${email}. Type it here, or tap the link in the email.` })),
      code,
      verify,
      error,
      back,
    );
    setTimeout(() => code.focus(), 50);
  }

  paint();
  const stop = onAccountChange(() => {
    if (!section.isConnected) return stop();
    step = 'email';
    paint();
  });
  return section;
}
