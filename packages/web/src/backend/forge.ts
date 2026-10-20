import type { Element, Rarity } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge's server side (supabase/migrations/…_simple_economy.sql): the season's parts,
 * the ones the player owns and wears, and the two calls that change them. Read-only to
 * the browser; forge_part and equip_part check every cost on the server.
 */

export type Slot = 'backdrop' | 'sigil' | 'frame' | 'crest' | 'aura';
export const SLOTS: Slot[] = ['sigil', 'backdrop', 'frame', 'aura', 'crest'];

export interface Part {
  id: string;
  slot: Slot;
  element: Element;
  rarity: Rarity;
  source: 'craft' | 'starter' | 'rank' | 'achievement' | 'event' | 'daily';
}

/** Stardust to forge a part (private.forge_cost); Mythic also takes a Rusted Crown. */
export const FORGE_COST: Record<Rarity, number> = { common: 100, rare: 250, epic: 600, mythic: 1200 };
export const needsCrown = (rarity: Rarity): boolean => rarity === 'mythic';

export type Loadout = Partial<Record<Slot, string | null>>;

export interface Forge {
  parts: Part[];
  /** Owned part ids, with a first-edition number where there is one. */
  owned: Map<string, { edition: number | null }>;
  loadout: Loadout;
  stardust: number;
  crowns: number;
  affinity: Element | null;
}

/** Everything the Forge page shows, in one go; null when offline or signed out. */
export async function loadForge(): Promise<Forge | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const [parts, owned, loadout, profile] = await Promise.all([
    supabase.from('parts').select('id, slot, element, rarity, source'),
    supabase.from('player_parts').select('part_id, edition'),
    supabase.from('avatar_loadouts').select('backdrop, sigil, frame, crest, aura').maybeSingle(),
    supabase.from('profiles').select('stardust, crowns, affinity').eq('id', uid).single(),
  ]);
  if (parts.error || owned.error || profile.error) return null;
  writeJson(LOADOUT_KEY, loadout.data ?? {});
  return {
    parts: (parts.data ?? []) as Part[],
    owned: new Map((owned.data ?? []).map((o) => [o.part_id as string, { edition: o.edition ?? null }])),
    loadout: (loadout.data ?? {}) as Loadout,
    stardust: profile.data.stardust,
    crowns: profile.data.crowns,
    affinity: (profile.data.affinity ?? null) as Element | null,
  };
}

/** Null when it worked, otherwise the reason to show. */
async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  if (error) return knownError(error, copy.refusals.forge) ?? copy.refusals.forgeOffline;
  void refreshAccount();
  return null;
}

export const forgePart = (part: string) => call('forge_part', { p_part: part });
export const equipPart = (slot: Slot, part: string | null) => call('equip_part', { p_slot: slot, p_part: part });

const LOADOUT_KEY = 'elomental:loadout';
/** The last known loadout, for Home's avatar to paint at once. */
export const cachedLoadout = (): Loadout | null => readJson<Loadout>(LOADOUT_KEY);

/** The loadout alone (Home's avatar), refreshed into the cache. */
export async function loadLoadout(): Promise<Loadout | null> {
  const { data, error } = await supabase.from('avatar_loadouts').select('backdrop, sigil, frame, crest, aura').maybeSingle();
  if (error) return null;
  writeJson(LOADOUT_KEY, data ?? {});
  return (data ?? {}) as Loadout;
}
