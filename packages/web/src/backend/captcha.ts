import { TURNSTILE_SITE_KEY } from './client.ts';

/**
 * Captcha for the auth calls that create or open accounts (a guest account at
 * launch, a sign-in email), so bots can't fill the database with accounts.
 * Cloudflare Turnstile, invisible for almost everyone: it shows a checkbox
 * only when it can't tell, at the bottom of the screen.
 *
 * With no site key, or if Turnstile can't load (offline, blocked), there is no
 * token and the call goes out without one: fine while the captcha is off in
 * Supabase; once it's on, the server refuses that call.
 */

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let widget: Promise<string> | null = null;
let answer: ((token: string | undefined) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(): Promise<Turnstile> {
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
  return turnstile.render(box, {
    sitekey: TURNSTILE_SITE_KEY,
    appearance: 'interaction-only',
    execution: 'execute',
    theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    callback: (token: string) => answer?.(token),
    'error-callback': () => answer?.(undefined),
    'expired-callback': () => answer?.(undefined),
  });
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
        // Long enough for a player to tick the box when one shows.
        const timer = setTimeout(() => done(undefined), 60_000);
        function done(token: string | undefined) {
          clearTimeout(timer);
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
