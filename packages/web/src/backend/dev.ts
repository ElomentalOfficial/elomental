import { cachedAccount, refreshAccount } from './account.ts';
import { founderUnlocked } from './founder.ts';
import { rpcCall } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Dev mode (migration dev_mode): founders only. The server checks the caller is a founder,
 * and that dev mode is on, for every tool; this only asks. Null when it worked, otherwise
 * the reason to show.
 */

export type DevAction = 'fill' | 'empty' | 'unlock_all' | 'clear_parts' | 'plate' | 'elo' | 'next_drop' | 'next_spirit' | 'forget_affinity';

/** Show the dev tools: a founder with their code given this session, and dev mode on. */
export const devOn = (): boolean => founderUnlocked() && !!cachedAccount()?.devMode;

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const refused = await rpcCall(fn, args, copy.refusals.dev, copy.refusals.devOffline);
  if (!refused) await refreshAccount();
  return refused;
}

export const setDevMode = (on: boolean) => call('dev_set_mode', { p_on: on });
export const devAction = (action: DevAction, value?: string | number) =>
  call('dev_action', { p_action: action, p_value: value === undefined ? null : String(value) });
