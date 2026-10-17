import { cachedAccount, sendSignInEmail, verifyCode } from './backend.ts';
import { h, toast } from './ui.ts';

/**
 * Passwordless sign-up / sign-in: an email, then the code from the email (or
 * its link). The code matters on iPhone: a link opens Safari, not the
 * home-screen app, so only the code signs the app itself in.
 *
 * Used in Setup and at the bottom of every result pop-up for guests.
 */
export function signUpForm(options: {
  title: string;
  text: string;
  /** Result pop-ups start collapsed behind one button. */
  collapsed?: boolean;
  onDone?: () => void;
}): HTMLElement {
  const box = h('div', { class: `signup ${options.collapsed ? 'collapsed' : ''}` });
  let email = '';
  let step: 'intro' | 'email' | 'code' = options.collapsed ? 'intro' : 'email';
  let busy = false;
  let switched = false;

  const field = (attrs: Record<string, string>) =>
    h('input', { class: 'text-field', attrs: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...attrs } });
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
  const heading = (title: string, text: string) =>
    h('div', { class: 'signup-head' }, h('h3', { text: title }), h('p', { text }));

  function paint() {
    error.textContent = '';
    if (step === 'intro') {
      box.replaceChildren(
        heading(options.title, options.text),
        h('button', {
          class: 'btn btn-outline',
          text: 'Sign up with email',
          onclick: () => {
            step = 'email';
            paint();
          },
        }),
      );
      return;
    }

    if (step === 'email') {
      const input = field({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com', 'aria-label': 'Email' });
      input.value = email;
      const send = h('button', { class: 'btn btn-primary', text: 'Email me a code' });
      send.addEventListener('click', () =>
        run(send, async () => {
          email = input.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(email)) return void fail('Enter your email address');
          const result = await sendSignInEmail(email);
          if (!fail(result.error)) return;
          switched = !!result.switched;
          step = 'code';
          paint();
        }),
      );
      box.replaceChildren(heading(options.title, options.text), input, send, error);
      if (options.collapsed) setTimeout(() => input.focus(), 50);
      return;
    }

    const code = field({ type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '123456', 'aria-label': 'Code from the email' });
    const verify = h('button', { class: 'btn btn-primary', text: 'Confirm' });
    verify.addEventListener('click', () =>
      run(verify, async () => {
        const token = code.value.replace(/\D/g, '');
        if (token.length < 6) return void fail('Enter the code from the email');
        if (!fail(await verifyCode(email, token))) return;
        toast(cachedAccount()?.anonymous === false ? 'Signed in. Your progress is saved.' : 'Signed in');
        options.onDone?.();
      }),
    );
    const back = h('button', {
      class: 'link-btn',
      text: 'Use a different email',
      onclick: () => {
        step = 'email';
        paint();
      },
    });
    box.replaceChildren(
      heading('Check your email', `We sent a code to ${email}. Type it here, or tap the link in the email.`),
      ...(switched ? [h('p', { class: 'note', text: "That email already has an account. Signing in switches to it; this guest's progress won't move over." })] : []),
      code,
      verify,
      error,
      back,
    );
    setTimeout(() => code.focus(), 50);
  }

  paint();
  return box;
}
