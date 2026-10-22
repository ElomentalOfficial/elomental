import type { Element, Rarity } from '../profile.ts';
import { readJson, writeJson } from '../storage.ts';
import { refreshAccount } from './account.ts';
import { knownError, rpcCall, supabase } from './client.ts';
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

/** Stardust to forge a part without its blueprint (private.forge_cost). */
export const FORGE_COST: Record<Rarity, number> = { common: 150, rare: 375, epic: 900, mythic: 1800 };
/** Stardust to forge a part from its blueprint (private.blueprint_cost): a Common is one tap. */
export const BLUEPRINT_COST: Record<Rarity, number> = { common: 0, rare: 50, epic: 200, mythic: 500 };
/** Stardust to gild a frame with 3 marks (private.gild_cost). */
export const GILD_COST: Record<Rarity, number> = { common: 1000, rare: 1500, epic: 2500, mythic: 4000 };
/** Rated wins a worn frame needs for each mark, and the most marks it earns (marks). */
export const MARK_WINS = 40;
export const MAX_MARKS = 3;
/** A frame's marks and its wins toward the next, from its rated wins. */
export const marksOf = (wins: number) => ({ marks: Math.min(MAX_MARKS, Math.floor(wins / MARK_WINS)), toNext: wins >= MARK_WINS * MAX_MARKS ? MARK_WINS : wins % MARK_WINS });
/** Polish brings an avatar to life, once (polish_part): Stardust and a Spirit. */
export const ALIVE_COST = 6000;
/** A Spirit is guaranteed within this many counted solves (private.spirit_roll). */
export const SPIRIT_GUARANTEE = 500;
/** Call a Spirit (call_spirit): this, then CALL_STEP more for each one called this season. */
export const CALL_COST = 15000;
export const CALL_STEP = 5000;
/** Polish per owned part id: 1 when brought to life. */
export type Polish = Record<string, number>;

/** What's worn; gilt when the worn frame is gilded (gilding). */
export type Loadout = Partial<Record<Slot, string | null>> & { gilt?: boolean };

export interface Forge {
  parts: Part[];
  /** Owned part ids (Happy always), with a first-edition number, polish (1: alive) and, for a
      frame, the rated wins it earned while worn (marks: one per 40, up to 3). */
  owned: Map<string, { edition: number | null; polish: number; wins: number; gilded: boolean }>;
  polish: Polish;
  /** Part ids you hold a blueprint for (blueprints): forged cheaply, then gone. */
  blueprints: Set<string>;
  loadout: Loadout;
  stardust: number;
  spirits: number;
  affinity: Element | null;
  /** Counted solves until a Spirit is guaranteed. */
  spiritIn: number;
  /** What the next Spirit called costs this season. */
  callCost: number;
  /** When the season ends (ISO), or null. */
  seasonEnds: string | null;
  /** "Season Alpha" (copy.seasonName); null between seasons. */
  seasonName: string | null;
}

/** Avatars you own (Happy too) that have no Spirit to wake them yet, counting the Spirits you hold. */
export function avatarsToWake(f: Forge, parts = f.parts): number {
  const avatars = parts.filter((p) => p.slot === 'avatar' && f.owned.has(p.id));
  const alive = avatars.filter((p) => f.owned.get(p.id)?.polish === 1).length;
  return avatars.length - alive - f.spirits;
}

/** Everything the Forge page shows, in one go; null when offline or signed out. */
export async function loadForge(): Promise<Forge | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const now = new Date().toISOString();
  const [parts, owned, blueprints, loadout, profile, season] = await Promise.all([
    supabase.from('parts').select('id, slot, element, rarity, source'),
    supabase.from('player_parts').select('part_id, edition, polish, wins, gilded'),
    supabase.from('player_blueprints').select('part_id'),
    supabase.from('avatar_loadouts').select('avatar, frame').maybeSingle(),
    supabase.from('profiles').select('stardust, spirits, affinity, spirit_pity, spirits_called, spirits_called_season').eq('id', uid).single(),
    supabase.from('seasons').select('id, name, ends_at').lte('starts_at', now).gt('ends_at', now).maybeSingle(),
  ]);
  if (parts.error || owned.error || blueprints.error || profile.error) return null;
  const seasonId = season.data?.id ?? 0;
  const calledThisSeason = profile.data.spirits_called_season === seasonId ? (profile.data.spirits_called ?? 0) : 0;
  const polish: Polish = Object.fromEntries((owned.data ?? []).filter((o) => o.polish).map((o) => [o.part_id as string, o.polish as number]));
  const worn: Loadout = { ...(loadout.data ?? {}), gilt: !!(owned.data ?? []).find((o) => o.part_id === loadout.data?.frame)?.gilded };
  writeJson(LOADOUT_KEY, worn);
  writeJson(POLISH_KEY, polish);
  return {
    parts: (parts.data ?? []) as Part[],
    owned: new Map([[DEFAULT_AVATAR, { edition: null, polish: 0, wins: 0, gilded: false }], ...(owned.data ?? []).map((o) => [o.part_id as string, { edition: o.edition ?? null, polish: o.polish ?? 0, wins: o.wins ?? 0, gilded: !!o.gilded }] as const)]),
    polish,
    blueprints: new Set((blueprints.data ?? []).map((b) => b.part_id as string)),
    loadout: worn,
    stardust: profile.data.stardust,
    spirits: profile.data.spirits,
    affinity: (profile.data.affinity ?? null) as Element | null,
    spiritIn: Math.max(1, SPIRIT_GUARANTEE - (profile.data.spirit_pity ?? 0)),
    callCost: CALL_COST + CALL_STEP * calledThisSeason,
    seasonEnds: season.data?.ends_at ?? null,
    seasonName: season.data ? copy.seasonName(season.data.id, season.data.name) : null,
  };
}

/** Null when it worked, otherwise the reason to show. */
async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const refused = await rpcCall(fn, args, copy.refusals.forge, copy.refusals.forgeOffline);
  if (!refused) void refreshAccount();
  return refused;
}

export const forgePart = (part: string) => call('forge_part', { p_part: part });
export const equipPart = (slot: Slot, part: string | null) => call('equip_part', { p_slot: slot, p_part: part });
export const polishPart = (part: string) => call('polish_part', { p_part: part });
/** Gilds a frame with 3 marks (gild_part): the price is checked on the server. */
export const gildPart = (part: string) => call('gild_part', { p_part: part });
/** Calls a Spirit for Stardust (call_spirit): the price is checked on the server. */
export const callSpirit = () => call('call_spirit', {});
/** Equips name plate n (0: none), any the level has unlocked (level_plates). */
export const wearPlate = (n: number) => call('wear_plate', { p_plate: n });
/**
 * Fills in a missed Daily Square this month (YYYY-MM-DD) for MEND_COST Stardust. `badge` is
 * the month's badge when this fill-in just earned it (daily_month).
 */
export async function mendDaily(date: string): Promise<{ error: string | null; badge: string | null }> {
  const { data, error } = await supabase.rpc('mend_daily', { p_date: date });
  if (error) return { error: knownError(error, copy.refusals.forge) ?? copy.refusals.forgeOffline, badge: null };
  void refreshAccount();
  const daily = (data as { daily?: { badgeNew?: boolean; badge?: string } } | null)?.daily;
  return { error: null, badge: daily?.badgeNew && daily.badge ? daily.badge : null };
}
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
    supabase.from('player_parts').select('part_id, polish, gilded').or('polish.gt.0,gilded.eq.true'),
  ]);
  if (error) return null;
  const worn: Loadout = { ...(data ?? {}), gilt: !!(owned.data ?? []).find((o) => o.part_id === data?.frame)?.gilded };
  writeJson(LOADOUT_KEY, worn);
  if (!owned.error) writeJson(POLISH_KEY, Object.fromEntries((owned.data ?? []).filter((o) => o.polish).map((o) => [o.part_id, o.polish])));
  return worn;
}
