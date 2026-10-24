import { TURNSTILE_SITE_KEY } from './client.ts';

/**
 * Captcha for the auth calls that create or open accounts (a guest's account on
 * first need, a sign-in email), so bots can't fill the database with accounts.
 * Cloudflare Turnstile, invisible for almost everyone: it shows a checkbox
 * only when it can't tell, at the bottom of the screen, and then waits for the
 * tick however long it takes (a guest account starts once it's ticked).
 *
 * With no site key, or if Turnstile can't load (offline, blocked), there is no
 * token and the call goes out without one: fine while the captcha is off in
 * Supabase; once it's on, the server refuses that call.
 */

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let widget: Promise<string> | null = null;
let answer: ((token: string | undefined) => void) | null = null;
/** Gives up on a silent check that never answers; cleared once the box asks the player. */
let giveUp: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => reject(new Error('turnstile blocked'));
    setTimeout(() => reject(new Error('turnstile timeout')), 10_000);
    document.head.append(script);
  });
}

async function mountWidget(): Promise<string> {
  const turnstile = await loadScript();
  const box = document.createElement('div');
  box.className = 'captcha';
  document.body.append(box);
  const id = turnstile.render(box, {
    sitekey: TURNSTILE_SITE_KEY,
    appearance: 'interaction-only',
    execution: 'execute',
    theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    callback: (token: string) => {
      // Done with it: after a tick Turnstile keeps showing "Success!" over the
      // page, so take it away. The next request renders a fresh one.
      widget = null;
      setTimeout(() => {
        turnstile.remove(id);
        box.remove();
      }, 0);
      answer?.(token);
    },
    // The box is showing: wait for the player however long they take.
    'before-interactive-callback': () => clearTimeout(giveUp),
    // Turnstile retries by itself after most errors; the give-up timer covers the rest.
    'error-callback': () => true,
    'expired-callback': () => answer?.(undefined),
  });
  return id;
}

/** A fresh one-time captcha token, or undefined when there's none to be had. */
export function captchaToken(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return Promise.resolve(undefined);
  // One at a time: the widget answers one request, and each token works once.
  const next = queue.then(async () => {
    try {
      widget ??= mountWidget();
      const id = await widget;
      return await new Promise<string | undefined>((resolve) => {
        giveUp = setTimeout(() => done(undefined), 30_000);
        function done(token: string | undefined) {
          clearTimeout(giveUp);
          answer = null;
          resolve(token);
        }
        answer = done;
        window.turnstile!.reset(id);
        window.turnstile!.execute(id);
      });
    } catch {
      widget = null; // try loading again next time
      return undefined;
    }
  });
  queue = next;
  return next;
}
