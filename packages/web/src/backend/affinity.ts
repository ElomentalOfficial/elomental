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
 * May the player switch sides now? Only once a side is chosen, in the first 7 days of the
 * season, and once per season (choose_affinity has the same rule). False offline.
 */
export async function canSwitchAffinity(): Promise<boolean> {
  const a = cachedAccount();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!a?.affinity || !uid) return false;
  const now = new Date().toISOString();
  const [season, profile] = await Promise.all([
    supabase.from('seasons').select('id, starts_at').lte('starts_at', now).gt('ends_at', now).maybeSingle(),
    supabase.from('profiles').select('affinity_season').eq('id', uid).single(),
  ]);
  if (season.error || !season.data || profile.error) return false;
  const open = Date.now() < new Date(season.data.starts_at).getTime() + 7 * 86_400_000;
  return open && profile.data.affinity_season !== season.data.id;
}

const PROMPTED_KEY = 'elomental:affinity-prompted';

/**
 * Time to ask? Signed in, no affinity yet, 3+ squares solved, and not already asked at
 * this solve count ("Decide later" waits for the next solve).
 */
export function affinityDue(): boolean {
  const a = cachedAccount();
  if (!a || a.affinity || (a.solved ?? 0) < 3) return false;
  return (readJson<number>(PROMPTED_KEY) ?? -1) < a.solved;
}

export function markAffinityPrompted(): void {
  const a = cachedAccount();
  if (a) writeJson(PROMPTED_KEY, a.solved);
}
