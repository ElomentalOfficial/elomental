import { sendSignInEmail, verifyEmailCode, waitForEmailConfirmation, type CodeKind } from './backend.ts';
import { h, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Passwordless sign-up / sign-in: an email, then the link or the code from the email.
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
    h('div', { class: 'signup-head' }, h('h2', { text: title }), h('p', { text }));

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
          kind = result.kind;
          step = 'code';
          paint();
        }),
      );
      box.replaceChildren(heading(options.title, options.text), input, send, error);
      if (options.collapsed) setTimeout(() => input.focus(), 50);
      return;
    }

    // The app waits here and continues by itself once the link is tapped, or the code typed.
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
    const finish = () => {
      attempt++; // stops the other way of waiting
      toast(kind === 'email' ? copy.account.signedIn : copy.account.signedUp);
      options.onDone?.();
    };

    // The code from the same email: for when the link won't open, or opens on another device.
    const codeId = `signup-code-${waitingFor}`;
    const codeInput = field({ id: codeId, type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', pattern: '[0-9]*' });
    const useCode = h('button', { class: 'btn btn-primary', text: copy.account.useCode });
    const submitCode = () =>
      run(useCode, async () => {
        const reason = await verifyEmailCode(email, codeInput.value, kind);
        if (attempt !== waitingFor) return;
        if (fail(reason)) finish();
      });
    useCode.addEventListener('click', submitCode);
    codeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitCode();
    });
    box.replaceChildren(
      heading(copy.account.checkEmail, kind === 'email' ? copy.account.signInSent(email) : copy.account.linkSent(email)),
      h('p', { class: 'waiting', text: copy.account.waitingLink }),
      h('label', { class: 'field-label', text: copy.account.codeLabel, attrs: { for: codeId } }),
      codeInput,
      useCode,
      ...(switched ? [h('p', { class: 'note', text: copy.account.switchWarning })] : []),
      error,
      back,
    );
    void waitForEmailConfirmation(email, cancelled).then((done) => {
      if (done && attempt === waitingFor) finish();
    });
  }
  let attempt = 0;
  let kind: CodeKind = 'email';

  paint();
  return box;
}
