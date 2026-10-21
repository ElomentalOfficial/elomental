import { cachedAccount, refreshAccount } from './account.ts';
import { founderUnlocked } from './founder.ts';
import { rpcCall, rpcData } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Dev mode (migration dev_mode): founders only. The server checks the caller is a founder,
 * and that dev mode is on, for every tool; this only asks. Null when it worked, otherwise
 * the reason to show.
 */

export type DevAction = 'fill' | 'empty' | 'unlock_all' | 'clear_parts' | 'level' | 'elo' | 'next_drop' | 'next_spirit' | 'forget_affinity';

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

/**
 * Whether players see the founders' (test) accounts on the leaderboard, in search and on cards
 * (migration show_founders): one switch for all founders. They still earn no influence or prizes.
 */
export const foundersShown = () => rpcData<boolean>('founders_shown');

/**
 * Beta testers (migration beta_testers): the emails that may sign in on beta. Founders on
 * beta only; the server checks both. Removing one also deletes their beta account.
 */
export interface Tester { email: string; addedAt: string; name: string | null; lastSeen: string | null }
export const loadTesters = () => rpcData<Tester[]>('beta_testers');
export const addTester = (email: string) => rpcCall('beta_tester_add', { p_email: email }, copy.refusals.dev, copy.refusals.devOffline);
export const removeTester = (email: string) => rpcCall('beta_tester_remove', { p_email: email }, copy.refusals.dev, copy.refusals.devOffline);
export const setFoundersShown = (on: boolean) => rpcCall('dev_show_founders', { p_on: on }, copy.refusals.dev, copy.refusals.devOffline);
