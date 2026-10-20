import { cachedAccount, isFounder, refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Dev mode (migration dev_mode): founders only. The server checks the caller is a founder,
 * and that dev mode is on, for every tool; this only asks. Null when it worked, otherwise
 * the reason to show.
 */

export type DevAction = 'fill' | 'empty' | 'unlock_all' | 'clear_parts' | 'plate' | 'elo' | 'next_drop' | 'next_spirit' | 'forget_affinity';

/** Show the dev tools: a founder (not a guest) with dev mode on. */
export const devOn = (): boolean => isFounder() && !cachedAccount()?.anonymous && !!cachedAccount()?.devMode;

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  if (error) return knownError(error, copy.refusals.dev) ?? copy.refusals.devOffline;
  await refreshAccount();
  return null;
}

export const setDevMode = (on: boolean) => call('dev_set_mode', { p_on: on });
export const devAction = (action: DevAction, value?: string | number) =>
  call('dev_action', { p_action: action, p_value: value === undefined ? null : String(value) });
