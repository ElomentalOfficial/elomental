import { closeButton, h } from './ui.ts';
import * as copy from './copy/en.ts';

/**
 * A new deploy while the app is open (a tab left open, an app on the home screen): the page
 * still runs the old build, so a player could stay on it for days. When the app comes back into
 * view, every 10 minutes and when the connection returns, the page is fetched fresh and the
 * build it names is compared with the one running; a newer one brings a quiet bar with Refresh.
 * Never over a game or a pop-up (it waits for the next screen), and once closed it stays closed
 * for that build. Production only: the dev server has no hashed build to compare.
 */

const EVERY_MS = 10 * 60_000;
/** The build this page runs: main.ts is the entry, so this module sits in its bundle. */
const running = new URL(import.meta.url).pathname.split('/').pop() ?? '';
let ready: string | null = null;
let dismissed: string | null = null;

/** The entry bundle a fresh copy of the page names (assets/index-<hash>.js), or null. */
async function latest(): Promise<string | null> {
  try {
    const res = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return /assets\/(index-[\w-]+\.js)/.exec(await res.text())?.[1] ?? null;
  } catch {
    return null;
  }
}

function show(): void {
  if (!ready || ready === dismissed || document.querySelector('.update-bar')) return;
  // a game or a pop-up keeps the screen: try again on the next check
  if (document.querySelector('.screen.game, .modal')) return;
  const build = ready;
  const bar = h(
    'div',
    { class: 'update-bar', attrs: { role: 'status' } },
    h('span', { class: 'update-text', text: copy.common.updateReady }),
    h('button', { class: 'btn btn-primary', text: copy.common.updateRefresh, attrs: { type: 'button' }, onclick: () => location.reload() }),
    closeButton(() => {
      dismissed = build;
      bar.remove();
    }),
  );
  document.body.append(bar);
}

async function check(): Promise<void> {
  if (!ready) {
    const now = await latest();
    if (now && now !== running) ready = now;
  }
  show();
}

export function installUpdateCheck(): void {
  if (!import.meta.env.PROD || !running.startsWith('index-')) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('online', () => void check());
  setInterval(() => void check(), EVERY_MS);
}
