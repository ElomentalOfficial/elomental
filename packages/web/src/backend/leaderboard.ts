import type { Element } from '../profile.ts';
import { refreshAccount } from './account.ts';
import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The leaderboard (migration leaderboard; docs/LEADERBOARD_DESIGN.md). Rankings come from a
 * server snapshot refreshed every 5 minutes, built only from settled, unflagged results;
 * your own place is worked out live. Every call is signed-in only.
 */

export type LbView = 'friends' | 'global' | 'faction' | 'season' | 'country';

export interface LbRow {
  place: number;
  id: string;
  name: string;
  title: string | null;
  elo: number;
  /** What the view ranks by: Elo, or Elo gained this season. */
  value: number;
  plate: number;
  avatar: string | null;
  frame: string | null;
  alive: boolean;
  affinity: Element | null;
  country: string | null;
  me: boolean;
}

export interface LbPage {
  view: LbView;
  scope: string | null;
  page: number;
  rows: LbRow[];
  total: number;
  updated: string | null;
}

export interface LbAround {
  scope: string | null;
  place: number | null;
  rows: LbRow[];
  listed: boolean;
  updated: string | null;
}

export interface LbMe {
  place: number | null;
  total: number | null;
  scope: string | null;
  elo: number;
  rated: boolean;
  hidden: boolean;
  restricted: boolean;
  listed: boolean;
  value: number | null;
}

export interface LbTiers {
  total: number;
  tiers: { floor: number; players: number }[];
}

export interface SearchHit {
  id: string;
  name: string;
  elo: number;
  title: string | null;
  plate: number;
  avatar: string | null;
  frame: string | null;
  place: number | null;
}

export interface PlayerCard {
  missing?: boolean;
  hidden?: boolean;
  id: string;
  name: string;
  title: string | null;
  elo: number;
  plate: number;
  avatar: string | null;
  frame: string | null;
  alive: boolean;
  peak: number;
  place: number | null;
  notRanked: boolean;
  affinity: Element | null;
  country: string | null;
  stats: { solved: number; ranked: number } | null;
  badges: string[];
  showcase: string[];
  following: boolean;
  me: boolean;
}

export interface FactionBoard {
  month: string;
  endsAt: string;
  standings: { affinity: Element; members: number; influence: number; standing: number }[];
  mine: Element | null;
  myInfluence: number;
  myPlace: number | null;
  top: { id: string; name: string; influence: number }[] | null;
  lastWinner: { month: string; winner: Element | null } | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return null;
  return data as T;
}

export const lbPage = (view: LbView, page = 0, scope?: string) => rpc<LbPage>('lb_page', { p_view: view, p_page: page, p_scope: scope ?? null });
export const lbAroundMe = (view: LbView, scope?: string) => rpc<LbAround>('lb_around_me', { p_view: view, p_scope: scope ?? null });
export const lbMe = (view: LbView, scope?: string) => rpc<LbMe>('lb_me', { p_view: view, p_scope: scope ?? null });
export const lbTiers = () => rpc<LbTiers>('lb_tiers');
export const factionBoard = () => rpc<FactionBoard>('faction_board');
export const playerCard = (id: string) => rpc<PlayerCard>('player_card', { p_player: id });

/** Up to 20 players by name; a string when refused (too many searches, offline). */
export async function searchPlayers(query: string): Promise<SearchHit[] | string> {
  const { data, error } = await supabase.rpc('lb_search', { p_query: query });
  if (error) return knownError(error, copy.leaderboard.errors) ?? copy.leaderboard.offline;
  return data as SearchHit[];
}

/** Null when it worked, otherwise the reason to show. */
async function act(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase.rpc(fn, args);
  if (error) return knownError(error, copy.leaderboard.errors) ?? copy.leaderboard.offline;
  return null;
}

export const follow = (id: string) => act('follow', { p_player: id });
export const unfollow = (id: string) => act('unfollow', { p_player: id });
export async function setCardPrivacy(hidden: boolean | null, stats: boolean | null): Promise<string | null> {
  const err = await act('set_card_privacy', { p_hidden: hidden, p_stats: stats });
  if (!err) await refreshAccount();
  return err;
}
export async function setCountry(code: string | null): Promise<string | null> {
  const err = await act('set_country', { p_code: code });
  if (!err) await refreshAccount();
  return err;
}
export const setShowcase = (parts: string[]) => act('set_showcase', { p_parts: parts });
