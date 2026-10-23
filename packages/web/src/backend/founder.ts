import { cachedAccount, isFounder, refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Founder access (migration founder_mfa): Review and Dev mode need, on top of the founder
 * email, a code from an authenticator app (Supabase Auth MFA, TOTP). This sets the app up
 * and asks for codes; the server checks the session's level (aal2) on every founder call.
 */

/** A founder whose session has passed the code: founder tools can show. */
export const founderUnlocked = (): boolean => isFounder() && !cachedAccount()?.anonymous && !!cachedAccount()?.aal2;

/** Has this account a verified authenticator already? Null offline. */
export async function hasAuthenticator(): Promise<boolean | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  return data.totp.some((f) => f.status === 'verified');
}

interface Enrolment {
  factorId: string;
  /** The QR code as an image URL (an SVG data URL). */
  qr: string;
  /** The same key, to type in by hand. */
  secret: string;
}

/**
 * Supabase gives the QR code as "data:image/svg+xml;utf-8,<svg…>": raw SVG with a non-standard
 * charset part, which some browsers won't show. Re-encode it as a proper data URL.
 */
function svgDataUrl(qr: string): string {
  const comma = qr.indexOf(',');
  const body = comma < 0 ? qr : qr.slice(comma + 1);
  if (!body.trimStart().startsWith('<')) return qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
}

/** Starts setting up an authenticator (clearing any half-finished one first). */
export async function startEnrolment(): Promise<Enrolment | string> {
  const listed = await supabase.auth.mfa.listFactors();
  for (const f of listed.data?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Elomental founder' });
  if (error || !data) return copy.founder.offline;
  return { factorId: data.id, qr: svgDataUrl(data.totp.qr_code), secret: data.totp.secret };
}

/** Checks a 6-digit code against the authenticator; null when it worked. */
export async function verifyCode(code: string, factorId?: string): Promise<string | null> {
  let id = factorId;
  if (!id) {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return copy.founder.offline;
    id = data.totp.find((f) => f.status === 'verified')?.id;
    if (!id) return copy.founder.offline;
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
  if (error) return knownError(error, copy.founder.errors) ?? copy.founder.wrongCode;
  await refreshAccount();
  return null;
}

interface FounderAction {
  at: string;
  founder: string | null;
  action: string;
  detail: string | null;
}

/** The newest founder actions (Dev mode and Review); null offline or without the code. */
export async function loadFounderActivity(limit = 30): Promise<FounderAction[] | null> {
  const { data, error } = await supabase.rpc('founder_activity', { p_limit: limit });
  if (error) return null;
  return data as FounderAction[];
}
