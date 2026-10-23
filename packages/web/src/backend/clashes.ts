import type { Difficulty } from '@elomental/engine';
import type { ClashResult } from '../clash.ts';
import { supabase } from './client.ts';

/** Clash results as the server settled them (get_clash, my_clashes). Null when the server can't be reached. */

interface ServerClashEntry {
  name: string;
  isMe: boolean;
  result: ClashResult;
}

const toEntry = (row: {
  display_name: string;
  is_me: boolean;
  solved: boolean;
  seconds: number;
  mistakes: number;
  hints: number;
}): ServerClashEntry => ({
  name: row.display_name,
  isMe: row.is_me,
  result: { solved: row.solved, seconds: row.seconds, mistakes: row.mistakes, hints: row.hints },
});

/** Everyone's finished result for a code, oldest first. */
export async function fetchClash(code: string): Promise<ServerClashEntry[] | null> {
  const { data, error } = await supabase.rpc('get_clash', { p_code: code });
  return error ? null : (data ?? []).map(toEntry);
}

/** All clashes this account played, with every player's result, grouped by code. */
export async function fetchMyClashes(): Promise<
  Map<string, { difficulty: Difficulty; updated: number; entries: ServerClashEntry[] }> | null
> {
  const { data, error } = await supabase.rpc('my_clashes');
  if (error) return null;
  const byCode = new Map<string, { difficulty: Difficulty; updated: number; entries: ServerClashEntry[] }>();
  for (const row of data ?? []) {
    const group = byCode.get(row.code) ?? { difficulty: row.difficulty as Difficulty, updated: 0, entries: [] };
    group.entries.push(toEntry(row));
    group.updated = Math.max(group.updated, Date.parse(row.finished_at));
    byCode.set(row.code, group);
  }
  return byCode;
}
