import { knownError, supabase } from './client.ts';
import * as copy from '../copy/en.ts';

/**
 * Review dashboard calls (founders only). The server checks the caller is a
 * founder (migration admin_review); for anyone else they fail with not_admin.
 */

export interface ReviewGame {
  flagId: number;
  at: string;
  /** 'copied': typed in before it could be worked out; 'unchecked': no moves reached the server;
      'too_quick': under a fifth of par on the server's clock. */
  reason: 'copied' | 'unchecked' | 'too_quick';
  /** Which audit check flagged it: the replay ('solve'), the wrong puzzle, or the moves' timing. */
  check?: 'solve' | 'puzzle' | 'timing' | null;
  leaps: number | null;
  placements: number | null;
  evidence: number | null;
  potential: number | null;
  validPuzzle: boolean;
  rating: number | null;
  seconds: number | null;
  reviewed: boolean;
  note: string | null;
}

export type ModerationAction = 'clear' | 'restrict' | 'lift';

export interface ReviewPlayer {
  userId: string;
  name: string;
  /** Null for guests. */
  email: string | null;
  elo: number;
  restricted: boolean;
  /** Null while restricted means until lifted. */
  restrictedUntil: string | null;
  restrictionReason: string | null;
  toReview: number;
  /** Every flag the player has had, reviewed or not. */
  flagged: number;
  /** Earlier decisions about this player, and the latest one. */
  decisions: number;
  lastDecision: { action: ModerationAction; days: number | null; note: string | null; at: string } | null;
  /** In the queue just the flags to review; otherwise the latest ones. Newest first. */
  games: ReviewGame[];
  /** Search results only: every decision about the player, newest first. */
  log?: ReviewDecision[];
}

export interface ReviewDecision {
  id: number;
  at: string;
  userId: string;
  name: string;
  action: ModerationAction;
  days: number | null;
  note: string | null;
  /** How many flags it settled. */
  flags: number;
  /** The founder's name; null from the SQL Editor. */
  by: string | null;
}

/** 'open': flags to review, worst first; 'banned': banned from Ranked now; 'history': decisions, newest first. */
export type ReviewView = 'open' | 'banned' | 'history';
export interface ReviewPage<T> {
  counts: Record<ReviewView, number>;
  items: T[];
}
export const REVIEW_PAGE = 25;

const NOT_ADMIN = { not_admin: copy.review.errors.notAdmin };

/** Throws with the reason to show. */
export async function fetchReviewPage(view: ReviewView, offset = 0, limit = REVIEW_PAGE): Promise<ReviewPage<ReviewPlayer | ReviewDecision>> {
  const { data, error } = await supabase.rpc('admin_review_page', { p_view: view, p_limit: limit, p_offset: offset });
  if (error) throw new Error(knownError(error, NOT_ADMIN) ?? copy.review.errors.loadFailed);
  return data as ReviewPage<ReviewPlayer | ReviewDecision>;
}

/** Players with a case whose name or email contains `query`, or whose account id it is; best matches first. Throws with the reason to show. */
export async function searchReview(query: string): Promise<ReviewPlayer[]> {
  const { data, error } = await supabase.rpc('admin_search', { p_query: query });
  if (error) throw new Error(knownError(error, NOT_ADMIN) ?? copy.review.errors.searchFailed);
  return (data ?? []) as ReviewPlayer[];
}

/**
 * Clear a player's flags (a mistake), ban them from Ranked (for `days`, or
 * until lifted), or lift the ban. Null when done, otherwise why not.
 */
export async function moderate(userId: string, action: ModerationAction, days: number | null, note: string): Promise<string | null> {
  const { error } = await supabase.rpc('admin_moderate', { p_user: userId, p_action: action, p_days: days, p_note: note });
  if (!error) return null;
  return knownError(error, { not_admin: copy.review.errors.notAdminAction }) ?? copy.review.errors.actionFailed;
}
