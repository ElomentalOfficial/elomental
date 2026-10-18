import { sendSignInEmail, waitForEmailConfirmation, waitForHandoff } from './backend.ts';
import { h, toast } from './ui.ts';
import * as copy from './copy/en.ts';

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
          text: copy.account.signUp,
          onclick: () => {
            step = 'email';
            paint();
          },
        }),
      );
      return;
    }

    if (step === 'email') {
      const input = field({ type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: copy.account.emailPlaceholder, 'aria-label': copy.account.emailLabel });
      input.value = email;
      const send = h('button', { class: 'btn btn-primary', text: copy.account.sendLink });
      send.addEventListener('click', () =>
        run(send, async () => {
          email = input.value.trim();
          if (!/^\S+@\S+\.\S+$/.test(email)) return void fail(copy.account.enterEmail);
          const result = await sendSignInEmail(email);
          if (!fail(result.error)) return;
          switched = !!result.switched;
          handoffCode = result.handoffCode ?? null;
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
      text: copy.account.useDifferentEmail,
      onclick: () => {
        attempt++; // stops waiting for the old link
        step = 'email';
        paint();
      },
    });
    const cancelled = () => attempt !== waitingFor || !box.isConnected;
    if (handoffCode) {
      // Signing in to an existing account: the link's page asks to confirm this code.
      box.replaceChildren(
        heading(copy.account.checkEmail, copy.account.linkSentConfirm(email)),
        h('div', { class: 'match-code', attrs: { 'aria-label': copy.account.a11yMatchCode(handoffCode) } }, h('small', { text: copy.account.yourCode }), h('strong', { text: handoffCode })),
        h('p', { class: 'waiting', text: copy.account.waitingConfirm }),
        ...(switched ? [h('p', { class: 'note', text: copy.account.switchWarning })] : []),
        error,
        back,
      );
    } else {
      box.replaceChildren(
        heading(copy.account.checkEmail, copy.account.linkSent(email)),
        h('p', { class: 'waiting', text: copy.account.waitingLink }),
        error,
        back,
      );
    }
    const wait = handoffCode ? waitForHandoff(cancelled) : waitForEmailConfirmation(email, cancelled);
    void wait.then((done) => {
      if (attempt !== waitingFor) return;
      if (!done) {
        if (box.isConnected) fail(copy.account.linkExpired);
        return;
      }
      toast(handoffCode ? copy.account.signedIn : copy.account.signedUp);
      options.onDone?.();
    });
  }
  let attempt = 0;
  let handoffCode: string | null = null;

  paint();
  return box;
}
