import { approveHandoff, cachedAccount, matchCode, registered, takeHandoffFromUrl } from './backend.ts';
import { h, openModal } from './ui.ts';

/**
 * The page a sign-in link opened in another browser (on iPhone: Safari, not
 * the installed app). This browser is now signed in; it asks the player to
 * confirm before signing the app in too, showing the code the app shows.
 */
export async function handleHandoffLink(): Promise<void> {
  const id = takeHandoffFromUrl();
  if (!id) return;
  // The link's session lands from the URL a moment after load.
  for (let i = 0; i < 40 && !registered(); i++) await new Promise((resolve) => setTimeout(resolve, 250));

  if (!registered()) {
    const close = openModal(
      h(
        'div',
        { class: 'sheet handoff' },
        h('h2', { text: 'Link expired' }),
        h('p', { text: 'This sign-in link has expired or was already used. Ask for a new one in the app.' }),
        h('button', { class: 'btn btn-primary', text: 'OK', onclick: () => close() }),
      ),
    );
    return;
  }

  const code = matchCode(id);
  const email = cachedAccount()?.email || 'your account';
  const status = h('p', { class: 'note', attrs: { role: 'status' } });
  const confirm = h('button', { class: 'btn btn-primary', text: 'Yes, sign in the app' });
  const body = h(
    'div',
    { class: 'sheet handoff' },
    h('h2', { text: 'Sign in the app?' }),
    h('p', { text: `The Elomental app asked to sign in as ${email}. Only confirm if you just did that and it shows this code:` }),
    h('div', { class: 'match-code' }, h('small', { text: 'Code' }), h('strong', { text: code })),
    status,
    confirm,
    h('button', { class: 'btn', text: 'No, that wasn’t me', onclick: () => close() }),
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
      h('h2', { text: 'Done' }),
      h('p', { text: 'Go back to the Elomental app. It signs in by itself in a few seconds.' }),
      h('button', { class: 'btn btn-primary', text: 'OK', onclick: () => close() }),
    );
  });
}
