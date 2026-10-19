import { readJson, removeKey, writeJson } from '../storage.ts';
import { cachedAccount, refreshAccount, registered, startGuestAccount } from './account.ts';
import { SUPABASE_KEY, SUPABASE_URL, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

// --- Sign-in email -----------------------------------------------------------------

/**
 * Emails a sign-in link. A guest account is upgraded in place (the email is
 * attached to it and it keeps all of its progress); an email that already has
 * an account signs into that account instead (`switched`, and the guest's
 * progress stays behind).
 */
export async function sendSignInEmail(
  email: string,
): Promise<{ error: string | null; switched?: boolean; handoffCode?: string; kind: CodeKind }> {
  const redirect = `${location.origin}${location.pathname}`;
  if (cachedAccount()?.anonymous) {
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
    if (!error) return { error: null, kind: 'email_change' };
    if (!/already|registered|exists/i.test(error.message)) return { error: friendlyAuthError(error.message), kind: 'email_change' };
  }
  // Signing in to an account: the link may open in another browser (on iPhone,
  // Safari instead of the installed app), so it carries a hand-off request.
  const handoff = await startHandoff(email);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: handoff ? `${redirect}?handoff=${handoff.id}` : redirect },
  });
  return {
    error: error ? friendlyAuthError(error.message) : null,
    switched: !!cachedAccount()?.anonymous,
    handoffCode: handoff ? matchCode(handoff.id) : undefined,
    kind: 'email',
  };
}

/** Which email a typed code came in: a guest attaching an email, or a sign-in. */
export type CodeKind = 'email_change' | 'email';

/**
 * The button in the email opens elomental.online itself (not the auth
 * server), with a one-time token in the query: the sender's and the link's
 * domain match, and mail scanners that pre-open links don't use it up,
 * because only this page's script spends it. `r` is the redirect the app
 * asked for, which carries a hand-off id (supabase/templates/build.mjs).
 * Read once, then cleared from the address bar (a hand-off id stays for
 * takeHandoffFromUrl). `used` when the page came from such a link; `error` says why it failed.
 */
export async function signInFromEmailLink(): Promise<{ used: boolean; error: string | null; kind: CodeKind }> {
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const kind: CodeKind = params.get('type') === 'email_change' ? 'email_change' : 'email';
  if (!tokenHash) return { used: false, error: null, kind };
  const redirect = params.get('r');
  // Escaped by the template, the id is inside `r`; unescaped, it arrives as its own parameter.
  const handoff = params.get('handoff') ?? (redirect ? new URL(redirect, location.href).searchParams.get('handoff') : null);
  for (const key of ['token_hash', 'type', 'r']) params.delete(key);
  if (handoff) params.set('handoff', handoff);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: kind });
  if (error) {
    // This browser has no account now: start the guest one it skipped at launch.
    if (!(await supabase.auth.getSession()).data.session) await startGuestAccount();
    return { used: true, error: copy.handoff.expiredText, kind };
  }
  await refreshAccount();
  return { used: true, error: null, kind };
}

/**
 * The code printed in the same email as the link, typed into the app: works
 * on any device, for when the link won't open or opens somewhere else.
 * Null when signed in, otherwise why not.
 */
export async function verifyEmailCode(email: string, code: string, kind: CodeKind): Promise<string | null> {
  const token = code.replace(/\D/g, '');
  if (token.length < 6) return copy.account.errors.badCode;
  const { error } = await supabase.auth.verifyOtp({ email, token, type: kind });
  if (error) return friendlyAuthError(error.message);
  removeKey(HANDOFF_KEY);
  await refreshAccount();
  return null;
}

function friendlyAuthError(message: string): string {
  if (/rate limit|too many|security purposes/i.test(message)) return copy.account.errors.tooManyEmails;
  if (/expired|invalid/i.test(message)) return copy.account.errors.badCode;
  if (/email/i.test(message)) return copy.account.errors.badEmail;
  return message;
}

/**
 * After a guest asks to attach an email: resolves once the link in the email
 * has been tapped, wherever it opened (Safari included). The confirmation
 * lands on the server, so this account just re-reads itself until the email
 * is on it, then refreshes its session to become a registered account.
 */
export async function waitForEmailConfirmation(email: string, isCancelled: () => boolean): Promise<boolean> {
  const wanted = email.trim().toLowerCase();
  while (!isCancelled()) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (document.hidden) continue;
    // Signed in elsewhere in this browser (the link opened in another tab).
    if (registered()) return true;
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user && user.email?.toLowerCase() === wanted && !user.is_anonymous) {
      await supabase.auth.refreshSession();
      await refreshAccount();
      return true;
    }
  }
  return false;
}

// --- Sign-in hand-off (link opened in another browser) -----------------------------
// See supabase/functions/handoff. This device keeps a secret; the browser the
// link opened in approves the request after the player confirms a matching
// code; this device then claims a one-time sign-in token with its secret.

const HANDOFF_URL = `${SUPABASE_URL}/functions/v1/handoff`;
const HANDOFF_KEY = 'elomental:handoff';
interface Handoff {
  id: string;
  secret: string;
}

async function callHandoff(body: Record<string, string>, accessToken?: string): Promise<{ status: number; data: any }> {
  const response = await fetch(HANDOFF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

/** Two digits both screens show, so the player can tell it's their own request. */
export const matchCode = (id: string): string => String(10 + (parseInt(id.replace(/-/g, '').slice(0, 6), 16) % 90));

async function startHandoff(email: string): Promise<Handoff | null> {
  try {
    const { status, data } = await callHandoff({ action: 'start', email });
    if (status !== 200 || !data.id || !data.secret) return null;
    writeJson(HANDOFF_KEY, { id: data.id, secret: data.secret });
    return data;
  } catch {
    return null;
  }
}

/**
 * Waits until the link's browser approves this device's request, then signs
 * this device in with the one-time token. Also done if the link signed in
 * this same browser directly (it shares storage with this page).
 */
export async function waitForHandoff(isCancelled: () => boolean): Promise<boolean> {
  const handoff = readJson<Handoff>(HANDOFF_KEY);
  while (!isCancelled()) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (document.hidden) continue;
    if (registered()) {
      removeKey(HANDOFF_KEY);
      return true;
    }
    if (!handoff) continue;
    try {
      const { data } = await callHandoff({ action: 'claim', id: handoff.id, secret: handoff.secret });
      if (data.status === 'expired' || data.error) {
        removeKey(HANDOFF_KEY);
        return false;
      }
      if (data.status === 'approved' && data.token_hash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
        removeKey(HANDOFF_KEY);
        if (error) return false;
        await refreshAccount();
        return true;
      }
    } catch {
      // Offline for a moment: keep waiting.
    }
  }
  return false;
}

/**
 * The page a sign-in link opened: its hand-off request id, if it came from
 * another browser (one this page doesn't share storage with). Read once.
 */
export function takeHandoffFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  const id = params.get('handoff');
  if (!id) return null;
  params.delete('handoff');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  // Same browser as the request: the link already signed this page in; nothing to hand over.
  if (readJson<Handoff>(HANDOFF_KEY)?.id === id) return null;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Approves a hand-off for the account this browser just signed in as. Null when approved, otherwise why not. */
export async function approveHandoff(id: string): Promise<string | null> {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session || session.user.is_anonymous) return copy.handoff.errors.expiredLink;
  try {
    const { status, data } = await callHandoff({ action: 'approve', id }, session.access_token);
    if (status === 200 && data.ok) return null;
    if (data.error === 'wrong_account') return copy.handoff.errors.wrongAccount;
    return copy.handoff.errors.expiredRequest;
  } catch {
    return copy.handoff.errors.offline;
  }
}
