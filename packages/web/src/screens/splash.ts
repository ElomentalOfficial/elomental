import { ICONS } from '../icons.ts';
import { loadProfile, saveProfile } from '../profile.ts';
import { h, mount, toast, type Screen } from '../ui.ts';
import { homeScreen } from './home.ts';

const LOGO = ['E', 'L', 'O', 'M', 'E', 'N', 'T', 'A', 'L'];
const GOLD_LETTERS = new Set([2, 4, 6]);

/** First screen of the Figma login flow. Accounts come with Supabase; guests can play now. */
export function splashScreen(): Screen {
  const continueAsGuest = () => {
    const profile = loadProfile();
    profile.guest = true;
    saveProfile(profile);
    mount(homeScreen());
  };

  const el = h(
    'div',
    { class: 'screen splash' },
    h(
      'div',
      { class: 'banner' },
      h('div', { class: 'logo' }, ...LOGO.map((ch, i) => h('span', { class: GOLD_LETTERS.has(i) ? 'gold' : '', text: ch }))),
    ),
    h(
      'div',
      { class: 'splash-actions' },
      h('button', { class: 'btn btn-dark rough-wide sc', text: 'Login', onclick: () => toast('Accounts arrive with Supabase') }),
      h('button', { class: 'btn btn-light rough-wide sc', text: 'Sign up', onclick: () => toast('Accounts arrive with Supabase') }),
      h('button', { class: 'link-btn', html: 'Continue as <span class="gold">GUEST</span>', onclick: continueAsGuest }),
    ),
    h(
      'p',
      { class: 'terms' },
      h('span', { class: 'terms-icon', html: ICONS.info }),
      h('span', { html: 'by proceeding forward with any of the above actions you agree with our <span class="gold">Terms &amp; Conditions</span>' }),
    ),
  );
  return { el };
}
