import { createClient } from '@supabase/supabase-js';

/**
 * The Supabase project. Public by design: the publishable key only reaches
 * what RLS and the function grants allow.
 */
export const SUPABASE_URL = 'https://xekeiwaxxsmvalezgtyj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_n7EsqEfzlcUCn6GI7YFdxw_Y74WqUwT';

/**
 * Cloudflare Turnstile site key (public; its secret lives only in Supabase,
 * Authentication → Attack Protection). Widget "Elomental" in Cloudflare → Turnstile,
 * for elomental.online. Empty: no captcha is asked for (captcha.ts).
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFbT-did4rZdUb9s';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A magic link opened on this device signs it in from the URL.
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

/**
 * Errors from the server functions carry a code in their message ("name_taken",
 * "not_admin", ...). The player-facing text for the first code in `messages`
 * that the error mentions, or undefined for an error that isn't one of them.
 */
export function knownError(error: { message: string }, messages: Record<string, string>): string | undefined {
  const code = Object.keys(messages).find((key) => error.message.includes(key));
  return code === undefined ? undefined : messages[code];
}

/** A server function's result, or null on any error (offline, refused). */
export async function rpcData<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return null;
  return data as T;
}

/**
 * A server function that only acts. Null when it worked, otherwise the reason to show: the
 * text for a known error code in `messages`, or `fallback` (usually "no connection").
 */
export async function rpcCall(fn: string, args: Record<string, unknown>, messages: Record<string, string>, fallback: string): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  return error ? (knownError(error, messages) ?? fallback) : null;
}
