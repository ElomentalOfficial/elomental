import type { Element, Rarity } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The Forge's server side (supabase/migrations/…_whole_avatars.sql): the season's parts,
 * the ones the player owns and wears, and the two calls that change them. Read-only to
 * the browser; forge_part and equip_part check every cost on the server.
 */

/** An avatar is one whole picture; a frame goes round it. */
export type Slot = 'avatar' | 'frame';
export const SLOTS: Slot[] = ['avatar', 'frame'];
/** Everyone's avatar from the start, worn when no other is (a free starter). */
export const DEFAULT_AVATAR = 's0-avatar-happy';

export interface Part {
  id: string;
  slot: Slot;
  /** Frames belong to an element; avatars to none. */
  element: Element | null;
  rarity: Rarity;
  source: 'craft' | 'starter' | 'rank' | 'achievement' | 'event' | 'daily';
}

/** Stardust to forge a part (private.forge_cost). */
export const FORGE_COST: Record<Rarity, number> = { common: 100, rare: 250, epic: 600, mythic: 1200 };
/** Polish brings an avatar to life, once (polish_part): Stardust and a Spirit. */
export const ALIVE_COST = 6000;
/** Name plates Bronze, Silver, Gold, Elomentalist (buy_plate), bought in order. */
export const PLATE_COST = [1000, 2500, 6000, 12000];
export const MAX_PLATE = 4;
/** Polish per owned part id: 1 when brought to life. */
export type Polish = Record<string, number>;

export type Loadout = Partial<Record<Slot, string | null>>;

export interface Forge {
  parts: Part[];
  /** Owned part ids (Happy always), with a first-edition number and polish (1: alive). */
  owned: Map<string, { edition: number | null; polish: number }>;
  polish: Polish;
  /** Name plate: 0 none, 1 Bronze … 4 Elomentalist. */
  plate: number;
  loadout: Loadout;
  stardust: number;
  spirits: number;
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
    supabase.from('avatar_loadouts').select('avatar, frame').maybeSingle(),
    supabase.from('profiles').select('stardust, spirits, affinity, plate').eq('id', uid).single(),
  ]);
  if (parts.error || owned.error || profile.error) return null;
  const polish: Polish = Object.fromEntries((owned.data ?? []).filter((o) => o.polish).map((o) => [o.part_id as string, o.polish as number]));
  writeJson(LOADOUT_KEY, loadout.data ?? {});
  writeJson(POLISH_KEY, polish);
  return {
    parts: (parts.data ?? []) as Part[],
    owned: new Map([[DEFAULT_AVATAR, { edition: null, polish: 0 }], ...(owned.data ?? []).map((o) => [o.part_id as string, { edition: o.edition ?? null, polish: o.polish ?? 0 }] as const)]),
    polish,
    plate: profile.data.plate ?? 0,
    loadout: (loadout.data ?? {}) as Loadout,
    stardust: profile.data.stardust,
    spirits: profile.data.spirits,
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
/** Buys plate n, the next one (a repeated tap can't buy two). */
export const buyPlate = (n: number) => call('buy_plate', { p_plate: n });
/** Fills in a missed Daily Square this month (YYYY-MM-DD) for MEND_COST Stardust. */
export const mendDaily = (date: string) => call('mend_daily', { p_date: date });
export const MEND_COST = 300;
export const MENDS_A_MONTH = 3;

const LOADOUT_KEY = 'elomental:loadout';
const POLISH_KEY = 'elomental:polish';
/** The last known polish (which avatars are alive), for Home's avatar. */
export const cachedPolish = (): Polish => readJson<Polish>(POLISH_KEY) ?? {};
/** The last known loadout, for Home's avatar to paint at once. */
export const cachedLoadout = (): Loadout | null => readJson<Loadout>(LOADOUT_KEY);

/** The loadout alone (Home's avatar), refreshed into the cache. */
export async function loadLoadout(): Promise<Loadout | null> {
  const [{ data, error }, owned] = await Promise.all([
    supabase.from('avatar_loadouts').select('avatar, frame').maybeSingle(),
    supabase.from('player_parts').select('part_id, polish').gt('polish', 0),
  ]);
  if (error) return null;
  writeJson(LOADOUT_KEY, data ?? {});
  if (!owned.error) writeJson(POLISH_KEY, Object.fromEntries((owned.data ?? []).map((o) => [o.part_id, o.polish])));
  return (data ?? {}) as Loadout;
}
