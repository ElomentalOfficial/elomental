import type { Element } from '../profile.ts';
import { refreshAccount } from './account.ts';
import { knownError, rpcCall, rpcData as rpc, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * The leaderboard (migration leaderboard; docs/LEADERBOARD_DESIGN.md). Rankings come from a
 * server snapshot refreshed every 5 minutes, built only from settled, unflagged results;
 * your own place is worked out live. Every call is signed-in only.
 */

export type LbView = 'friends' | 'global' | 'faction' | 'season';

export interface LbRow {
  place: number;
  id: string;
  name: string;
  title: string | null;
  elo: number;
  /** The rank shown (0 Novice … 4 Elomental, its grace included); missing from a server before ranked_ladder. */
  tier?: number | null;
  /** What the view ranks by: Elo, or the best Elo this season (Season). */
  value: number;
  plate: number;
  avatar: string | null;
  frame: string | null;
  alive: boolean;
  affinity: Element | null;
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
  /** Ranked games this season (the Season list needs 20). */
  seasonGames?: number | null;
}

export interface LbTiers {
  total: number;
  tiers: { floor: number; players: number }[];
}

export interface SearchHit {
  id: string;
  name: string;
  elo: number;
  /** The rank shown (0 Novice … 4 Elomental, its grace included); missing from a server before ranked_ladder. */
  tier?: number | null;
  title: string | null;
  plate: number;
  avatar: string | null;
  frame: string | null;
  place: number | null;
}

export interface PlayerCard {
  /** The account level (account_level; missing before it). */
  level?: number;
  missing?: boolean;
  hidden?: boolean;
  id: string;
  name: string;
  title: string | null;
  elo: number;
  /** The rank shown (0 Novice … 4 Elomental, its grace included); missing from a server before ranked_ladder. */
  tier?: number | null;
  plate: number;
  avatar: string | null;
  frame: string | null;
  alive: boolean;
  peak: number;
  place: number | null;
  /** Position on the Everyone list (ties broken), for opening the right page. */
  position?: number | null;
  notRanked: boolean;
  affinity: Element | null;
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
  /** Your solves for your side this month: you count from 5. */
  mySolves?: number;
  top: { id: string; name: string; influence: number }[] | null;
  /** winners: every side with the top standing (a tie has more than one). */
  lastWinner: { month: string; winner: Element | null; winners?: Element[] | null } | null;
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
const act = (fn: string, args: Record<string, unknown>) => rpcCall(fn, args, copy.leaderboard.errors, copy.leaderboard.offline);

/** How many players you follow; 0 offline. */
export async function followingCount(): Promise<number> {
  const { count } = await supabase.from('follows').select('followee', { count: 'exact', head: true });
  return count ?? 0;
}

export const follow = (id: string) => act('follow', { p_player: id });
export const unfollow = (id: string) => act('unfollow', { p_player: id });
export async function setCardPrivacy(hidden: boolean | null, stats: boolean | null): Promise<string | null> {
  const err = await act('set_card_privacy', { p_hidden: hidden, p_stats: stats });
  if (!err) await refreshAccount();
  return err;
}
/** Up to three of your badges for your card. */
export const setShowcase = (badges: string[]) => act('set_showcase', { p_badges: badges });
/** Which of these players wear a gilded frame (gilt_players, gilding); empty offline. */
export async function giltPlayers(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.rpc('gilt_players', { p_ids: ids.slice(0, 100) });
  return new Set(error || !data ? [] : (data as string[]));
}

/** Your "your side won the month" badges from the last 3 weeks, newest first; none offline. */
export async function recentWins(): Promise<string[]> {
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data, error } = await supabase.from('player_badges').select('badge').like('badge', 'win-%').gte('earned_at', since).order('earned_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map((r) => r.badge as string).filter((b) => b.startsWith('win-'));
}

/** Your badges, newest first; null offline. */
export async function myBadges(): Promise<string[] | null> {
  const { data, error } = await supabase.from('player_badges').select('badge, earned_at').order('earned_at', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => r.badge as string);
}
