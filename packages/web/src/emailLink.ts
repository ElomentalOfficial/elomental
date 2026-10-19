import { signInFromEmailLink } from './backend.ts';
import { h, openModal, toast } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * The page the button in a sign-in email opened: signs this browser in with
 * the link's token, or says the link has expired.
 */
export async function handleEmailLink(): Promise<void> {
  const link = await signInFromEmailLink();
  if (!link.used) return;
  if (!link.error) return toast(link.kind === 'email' ? copy.account.signedIn : copy.account.signedUp);
  const close = openModal(
    h(
      'div',
      { class: 'sheet' },
      h('h2', { text: copy.emailLink.expiredTitle }),
      h('p', { text: copy.emailLink.expiredText }),
      h('button', { class: 'btn btn-primary', text: copy.common.ok, onclick: () => close() }),
    ),
  );
}
