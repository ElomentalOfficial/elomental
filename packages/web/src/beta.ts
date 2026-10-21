import { IS_BETA } from './backend/client.ts';
import { registered } from './backend.ts';
import { signUpForm } from './accountForm.ts';
import { h, type Screen } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * Beta is for invited testers only: the beta project lets no one sign up and has no guest
 * accounts, so only emails the owner added (Authentication > Users > Add user) can sign in.
 * Until one has, the app shows only this sign-in (main.ts). Live builds never lock.
 */
export const betaLocked = (): boolean => IS_BETA && !registered();

export function betaGateScreen(): Screen {
  const el = h('main', { class: 'screen beta-gate scrollable' },
    h('div', { class: 'setting beta-gate-card' },
      h('div', { class: 'beta-gate-head' },
        h('h1', { text: copy.common.betaGateTitle }),
        h('p', { text: copy.common.betaGateText })),
      signUpForm({ title: copy.common.betaSignInTitle, text: copy.common.betaSignInText }),
      h('a', { class: 'link-btn', text: copy.common.betaLiveLink, attrs: { href: 'https://elomental.online/' } })));
  return { el };
}

/**
 * The beta site (beta.elomental.online, its own Supabase project) says so: a small tag in the
 * corner and "Beta" at the start of the tab's title (ui.ts mount reads data-env), so it is never
 * taken for the live game. Live builds draw nothing.
 */
export function installBetaMark(): void {
  if (!IS_BETA) return;
  document.documentElement.dataset.env = 'beta';
  document.title = copy.common.betaTitle(document.title);
  document.body.append(h('div', { class: 'beta-tag', text: copy.common.betaTag }));
}
