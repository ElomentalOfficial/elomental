import type { Element } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { cachedAccount, refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Affinities (docs/PROGRESSION_DESIGN.md §13): choosing one, and this month's war.
 * The server (choose_affinity, affinity_standings) checks every rule; this only asks.
 */

export interface Standing {
  affinity: Element;
  members: number;
  influence: number;
  /** Average influence per active member: what wins the month. */
  standing: number;
}

/** This month's standings, best first; null offline. */
export async function loadStandings(): Promise<Standing[] | null> {
  const { data, error } = await supabase.rpc('affinity_standings');
  if (error || !data) return null;
  return (data as Standing[])
    .map((s) => ({ ...s, standing: Number(s.standing), influence: Number(s.influence) }))
    .sort((a, b) => b.standing - a.standing);
}

/** Null when chosen, otherwise the reason to show. */
export async function chooseAffinity(affinity: Element): Promise<string | null> {
  const { error } = await supabase.rpc('choose_affinity', { p_affinity: affinity });
  if (error) return knownError(error, copy.refusals.affinity) ?? copy.refusals.forgeOffline;
  await refreshAccount();
  return null;
}

/**
 * May the player switch sides now? Once a month, within their first 5 days in their faction
 * that month (faction_switch; choose_affinity decides). False offline.
 */
export async function canSwitchAffinity(): Promise<boolean> {
  if (!cachedAccount()?.affinity) return false;
  const { data, error } = await supabase.rpc('affinity_switch_open');
  return !error && !!data;
}

const PROMPTED_KEY = 'elomental:affinity-prompted';

/** Solves "Decide later" waits before Home asks again. */
const PUT_OFF_SOLVES = 5;

/**
 * Time to ask (Home's line)? Signed in, no affinity yet, 3+ squares solved, and not put off
 * within the last 5 solves.
 */
export function affinityDue(): boolean {
  const a = cachedAccount();
  if (!a || a.affinity || (a.solved ?? 0) < 3) return false;
  const putOffAt = readJson<number>(PROMPTED_KEY);
  return putOffAt == null || a.solved >= putOffAt + PUT_OFF_SOLVES;
}

/** "Decide later": Home stops asking for the next 5 solves. */
export function putOffAffinity(): void {
  const a = cachedAccount();
  if (a) writeJson(PROMPTED_KEY, a.solved);
}
