import { rpcData, supabase } from './client.ts';
import type { Element } from '../profile.ts';

/**
 * The faction month and the Ranked season (migration cycles, docs/WIPE_SYSTEM.md). The server
 * settles and opens them on its own; the app only reads where they stand and what happened
 * while the player was away. All times are UTC from the server; the app shows them locally.
 */

interface CycleNews {
  seasons: { id: number; name: string | null; games: number; bestTier: number | null; badge: string | null; place: number | null; elo: number; eloAfter: number }[];
  months: { month: string; side: Element; won: boolean; badge: boolean }[];
}
/** Seasons closed and faction months settled since the player last looked; null offline. */
export const cycleNews = () => rpcData<CycleNews>('cycle_news');
/** "While you were away" was seen: it won't show these again. */
export async function cycleNewsSeen(): Promise<void> {
  await supabase.rpc('cycle_news_seen');
}
