import { sendSignInEmail, waitForEmailConfirmation } from './backend.ts';
import { h, toast } from './ui.ts';

/**
 * Passwordless sign-up / sign-in: an email, then the link from the email.
 * A guest account gets the email attached on the server when the link is
 * tapped (even if it opens in Safari, not the home-screen app), and this form
 * notices and continues by itself.
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
      const send = h('button', { class: 'btn btn-primary', text: 'Email me a link' });
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

    // Link only: the app waits here and continues by itself once the link is tapped.
    const waitingFor = ++attempt;
    const back = h('button', {
      class: 'link-btn',
      text: 'Use a different email',
      onclick: () => {
        attempt++; // stops waiting for the old link
        step = 'email';
        paint();
      },
    });
    box.replaceChildren(
      heading('Check your email', `We sent a link to ${email}. Tap it to confirm. This screen continues by itself.`),
      h('p', { class: 'waiting', text: 'Waiting for the link…' }),
      ...(switched ? [h('p', { class: 'note', text: "That email already has an account. Signing in switches to it; this guest's progress won't move over." })] : []),
      back,
    );
    void waitForEmailConfirmation(email, () => attempt !== waitingFor || !box.isConnected).then((done) => {
      if (!done || attempt !== waitingFor) return;
      toast('Signed up. Your progress is saved.');
      options.onDone?.();
    });
  }
  let attempt = 0;

  paint();
  return box;
}
