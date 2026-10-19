import { approveHandoff, cachedAccount, matchCode, registered, signInFromEmailLink, takeHandoffFromUrl } from './backend.ts';
import { h, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';

function showExpired(): void {
  const close = openModal(
    h(
      'div',
      { class: 'sheet handoff' },
      h('h2', { text: copy.handoff.expiredTitle }),
      h('p', { text: copy.handoff.expiredText }),
      h('button', { class: 'btn btn-primary', text: copy.common.ok, onclick: () => close() }),
    ),
  );
}

/**
 * The page a sign-in link opened in another browser (on iPhone: Safari, not
 * the installed app). This browser is now signed in; it asks the player to
 * confirm before signing the app in too, showing the code the app shows.
 */
export async function handleHandoffLink(): Promise<void> {
  // The email's button: its token signs this browser in first.
  const link = await signInFromEmailLink();
  const id = takeHandoffFromUrl();
  if (link.error) return showExpired();
  if (!id) {
    if (link.used) toast(link.kind === 'email' ? copy.account.signedIn : copy.account.signedUp);
    return;
  }
  // An older email's link: its session lands from the URL a moment after load.
  for (let i = 0; i < 40 && !registered(); i++) await new Promise((resolve) => setTimeout(resolve, 250));

  if (!registered()) return showExpired();

  const code = matchCode(id);
  const email = cachedAccount()?.email || copy.handoff.yourAccount;
  const status = h('p', { class: 'note', attrs: { role: 'status' } });
  const confirm = h('button', { class: 'btn btn-primary', text: copy.handoff.confirm });
  const body = h(
    'div',
    { class: 'sheet handoff' },
    h('h2', { text: copy.handoff.title }),
    h('p', { text: copy.handoff.text(email) }),
    h('div', { class: 'match-code' }, h('small', { text: copy.handoff.code }), h('strong', { text: code })),
    status,
    confirm,
    h('button', { class: 'btn', text: copy.handoff.deny, onclick: () => close() }),
  );
  const close = openModal(body, { dismissible: false });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    const error = await approveHandoff(id);
    if (error) {
      status.textContent = error;
      confirm.disabled = false;
      return;
    }
    body.replaceChildren(
      h('h2', { text: copy.handoff.doneTitle }),
      h('p', { text: copy.handoff.doneText }),
      h('button', { class: 'btn btn-primary', text: copy.common.ok, onclick: () => close() }),
    );
  });
}
