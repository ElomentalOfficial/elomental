import type { Difficulty } from '@elomental/engine';
import { signedIn } from './account.ts';
import { supabase } from './client.ts';

/** Square codes (squareCode.ts, migration square_codes). */

export interface SharedSquare {
  code: string;
  givens: string;
  difficulty: Difficulty;
  rating: number | null;
}

/** The puzzle's square code (made on first use; the same puzzle always gets the same one). Null offline. */
export async function squareCodeFor(givens: string, difficulty: Difficulty, rating: number): Promise<string | null> {
  if (!signedIn()) return null;
  const { data, error } = await supabase.rpc('square_code', { p_givens: givens, p_difficulty: difficulty, p_rating: rating });
  return error ? null : (data as string);
}

/** The puzzle behind a square code; null when no puzzle has it. Throws when the server can't be reached. */
export async function fetchSquare(code: string): Promise<SharedSquare | null> {
  if (!signedIn()) throw new Error('offline');
  const { data, error } = await supabase.rpc('get_square', { p_code: code });
  if (error) throw new Error(error.message);
  return (data as SharedSquare | null) ?? null;
}
