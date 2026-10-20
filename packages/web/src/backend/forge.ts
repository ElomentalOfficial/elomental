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
/** Polish levels I–V for an owned part (polish_part), each a look only. */
export const POLISH_COST = [200, 400, 800, 1600, 3200];
export const MAX_POLISH = 5;
/** Name plates Bronze, Silver, Gold, Starlit (buy_plate), bought in order. */
export const PLATE_COST = [1000, 2500, 6000, 12000];
export const MAX_PLATE = 4;
/** Polish level per owned part id. */
export type Polish = Record<string, number>;

export type Loadout = Partial<Record<Slot, string | null>>;

export interface Forge {
  parts: Part[];
  /** Owned part ids, with a first-edition number and polish level. */
  owned: Map<string, { edition: number | null; polish: number }>;
  polish: Polish;
  /** Name plate: 0 none, 1 Bronze … 4 Starlit. */
  plate: number;
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
    supabase.from('player_parts').select('part_id, edition, polish'),
    supabase.from('avatar_loadouts').select('backdrop, sigil, frame, crest, aura').maybeSingle(),
    supabase.from('profiles').select('stardust, crowns, affinity, plate').eq('id', uid).single(),
  ]);
  if (parts.error || owned.error || profile.error) return null;
  const polish: Polish = Object.fromEntries((owned.data ?? []).filter((o) => o.polish).map((o) => [o.part_id as string, o.polish as number]));
  writeJson(LOADOUT_KEY, loadout.data ?? {});
  writeJson(POLISH_KEY, polish);
  return {
    parts: (parts.data ?? []) as Part[],
    owned: new Map((owned.data ?? []).map((o) => [o.part_id as string, { edition: o.edition ?? null, polish: o.polish ?? 0 }])),
    polish,
    plate: profile.data.plate ?? 0,
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
export const polishPart = (part: string) => call('polish_part', { p_part: part });
export const buyPlate = () => call('buy_plate', {});
/** Fills in a missed Daily Square this month (YYYY-MM-DD) for MEND_COST Stardust. */
export const mendDaily = (date: string) => call('mend_daily', { p_date: date });
export const MEND_COST = 300;
export const MENDS_A_MONTH = 3;

const LOADOUT_KEY = 'elomental:loadout';
const POLISH_KEY = 'elomental:polish';
/** The last known polish levels, for Home's avatar. */
export const cachedPolish = (): Polish => readJson<Polish>(POLISH_KEY) ?? {};
/** The last known loadout, for Home's avatar to paint at once. */
export const cachedLoadout = (): Loadout | null => readJson<Loadout>(LOADOUT_KEY);

/** The loadout alone (Home's avatar), refreshed into the cache. */
export async function loadLoadout(): Promise<Loadout | null> {
  const [{ data, error }, owned] = await Promise.all([
    supabase.from('avatar_loadouts').select('backdrop, sigil, frame, crest, aura').maybeSingle(),
    supabase.from('player_parts').select('part_id, polish').gt('polish', 0),
  ]);
  if (error) return null;
  writeJson(LOADOUT_KEY, data ?? {});
  if (!owned.error) writeJson(POLISH_KEY, Object.fromEntries((owned.data ?? []).map((o) => [o.part_id, o.polish])));
  return (data ?? {}) as Loadout;
}
