import type { Element, Rarity } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge's server side (supabase/migrations/…_economy_affinity.sql): the catalogue,
 * the player's components, parts and loadout, and the calls that spend them. All of it
 * is read-only to the browser; forging, refining, swapping and equipping run in
 * security-definer functions that check every cost.
 */

export type Slot = 'backdrop' | 'sigil' | 'frame' | 'crest' | 'aura';
export const SLOTS: Slot[] = ['sigil', 'backdrop', 'frame', 'aura', 'crest'];
export type PartRarity = Exclude<Rarity, 'scrap'>;

export interface Part {
  id: string;
  slot: Slot;
  element: Element;
  rarity: PartRarity;
  source: 'craft' | 'starter' | 'rank' | 'achievement' | 'event' | 'daily';
  recipe: { components: Partial<Record<Rarity, number>>; stardust: number; crowns: number } | null;
}

export type Loadout = Partial<Record<Slot, string | null>>;

export interface Forge {
  parts: Part[];
  /** Owned part ids, with a first-edition number where there is one. */
  owned: Map<string, { edition: number | null }>;
  /** components[element][rarity] = how many. */
  components: Record<Element, Record<Rarity, number>>;
  loadout: Loadout;
  stardust: number;
  crowns: number;
  affinity: Element | null;
}

const empty = (): Record<Rarity, number> => ({ scrap: 0, forged: 0, tempered: 0, runed: 0, starforged: 0 });

/** Everything the Forge page shows, in one go; null when offline or signed out. */
export async function loadForge(): Promise<Forge | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const [parts, recipes, owned, comps, loadout, profile] = await Promise.all([
    supabase.from('parts').select('id, slot, element, rarity, source'),
    supabase.from('recipes').select('part_id, components, stardust, crowns'),
    supabase.from('player_parts').select('part_id, edition'),
    supabase.from('player_components').select('element, rarity, qty'),
    supabase.from('avatar_loadouts').select('backdrop, sigil, frame, crest, aura').maybeSingle(),
    supabase.from('profiles').select('stardust, crowns, affinity').eq('id', uid).single(),
  ]);
  if (parts.error || recipes.error || owned.error || comps.error || profile.error) return null;
  writeJson(LOADOUT_KEY, loadout.data ?? {});
  const recipeOf = new Map((recipes.data ?? []).map((r) => [r.part_id as string, r]));
  const components = { fire: empty(), water: empty(), earth: empty(), air: empty() } as Forge['components'];
  for (const c of comps.data ?? []) components[c.element as Element][c.rarity as Rarity] = c.qty;
  return {
    parts: (parts.data ?? []).map((p) => {
      const r = recipeOf.get(p.id);
      return { ...p, recipe: r ? { components: r.components, stardust: r.stardust, crowns: r.crowns } : null } as Part;
    }),
    owned: new Map((owned.data ?? []).map((o) => [o.part_id as string, { edition: o.edition ?? null }])),
    components,
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
export const refineComponents = (element: Element, rarity: Rarity, times = 1) =>
  call('refine_components', { p_element: element, p_rarity: rarity, p_times: times });
export const swapComponents = (from: Element, to: Element, rarity: Rarity, times = 1) =>
  call('swap_components', { p_from: from, p_to: to, p_rarity: rarity, p_times: times });

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
