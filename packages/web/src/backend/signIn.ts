import { cachedAccount, refreshAccount, registered, startGuestAccount } from './account.ts';
import { captchaToken } from './captcha.ts';
import { supabase } from './client.ts';
import * as copy from '../copy/en.ts';

// --- Sign-in email -----------------------------------------------------------------

/**
 * Emails a sign-in link and code. A guest account is upgraded in place (the
 * email is attached to it and it keeps all of its progress); an email that
 * already has an account signs into that account instead (`switched`, and the
 * guest's progress stays behind).
 */
/**
 * A guest's email is attached to the guest account. If it already belongs to another
 * account, nothing is sent and `needsSwitch` says so, until the guest agrees (`allowSwitch`):
 * then it's a sign-in that switches this phone to that account.
 */
export async function sendSignInEmail(
  email: string,
  options: { allowSwitch?: boolean } = {},
): Promise<{ error: string | null; switched?: boolean; needsSwitch?: boolean; kind: CodeKind }> {
  const redirect = `${location.origin}${location.pathname}`;
  if (cachedAccount()?.anonymous && !options.allowSwitch) {
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirect });
    if (!error) return { error: null, kind: 'email_change' };
    if (!/already|registered|exists/i.test(error.message)) return { error: friendlyAuthError(error.message), kind: 'email_change' };
    return { error: null, needsSwitch: true, kind: 'email' };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, captchaToken: await captchaToken(), emailRedirectTo: redirect },
  });
  return { error: error ? friendlyAuthError(error.message) : null, switched: !!cachedAccount()?.anonymous, kind: 'email' };
}

/** Which email a typed code came in: a guest attaching an email, or a sign-in. */
export type CodeKind = 'email_change' | 'email';

/**
 * Only for emails sent before the templates went code-only (Brevo wrapped their
 * button in a click tracker that blockers stop). The button in those emails opens elomental.online itself (not the auth
 * server), with a one-time token in the query: the sender's and the link's
 * domain match, and mail scanners that pre-open links don't use it up,
 * because only this page's script spends it (supabase/templates/build.mjs).
 * It signs in the browser it opens in; the home-screen app types the code
 * instead. Read once, then cleared from the address bar (with the `r`
 * redirect, and an old email's `handoff` id). `used` when the page came from
 * such a link; `error` says why it failed.
 */
export async function signInFromEmailLink(): Promise<{ used: boolean; error: string | null; kind: CodeKind }> {
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get('token_hash');
  const kind: CodeKind = params.get('type') === 'email_change' ? 'email_change' : 'email';
  const keys = ['token_hash', 'type', 'r', 'handoff'];
  if (!keys.some((key) => params.has(key))) return { used: false, error: null, kind };
  for (const key of keys) params.delete(key);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  if (!tokenHash) return { used: false, error: null, kind };
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: kind });
  if (error) {
    // This browser has no account now: start the guest one it skipped at launch.
    if (!(await supabase.auth.getSession()).data.session) await startGuestAccount();
    return { used: true, error: copy.emailLink.expiredText, kind };
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
 * Resolves once the link in the email has signed this account in. A guest
 * attaching an email: the confirmation lands on the server wherever the link
 * opened (Safari included), so this account re-reads itself until the email
 * is on it, then refreshes its session. A sign-in: the link opened in this
 * browser (another tab shares its storage).
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
