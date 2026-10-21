import { IS_BETA } from './backend/client.ts';
import { h } from './ui.ts';
import * as copy from './copy/en.ts';

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
