// Ranked solve check (see packages/engine/src/audit.ts and migration solve_audit).
//
//   POST { gameId, givens, moves } + user JWT -> { copied }
//
// Replays the moves of a won Ranked game and records on the game whether the
// squares were worked out or typed in from a solved grid, together with the
// puzzle's rating graded here (so the client can't inflate it) and its
// solution (finish_game checks the submitted grid against it).
// finish_game rates the win only with a clean audit on the game.
import { createClient } from 'npm:@supabase/supabase-js@2';
// Only the modules it needs (not the generator or the puzzle bank), to keep the function small.
import { auditSolve, type Move } from '../_shared/engine/audit.ts';
import { grade } from '../_shared/engine/grader.ts';
import { gridToString, parseGrid } from '../_shared/engine/grid.ts';
import { countSolutions, solve } from '../_shared/engine/solver.ts';
import type { TechniqueLevel } from '../_shared/engine/techniques.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_MOVES = 600;

function cleanMoves(raw: unknown): Move[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_MOVES) return null;
  const moves: Move[] = [];
  for (const m of raw) {
    const { cell, digit, at } = (m ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(cell) || !Number.isInteger(digit) || typeof at !== 'number') return null;
    if ((cell as number) < 0 || (cell as number) > 80 || (digit as number) < 0 || (digit as number) > 9) return null;
    moves.push({ cell: cell as number, digit: digit as number, at });
  }
  return moves;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth?.user) return reply({ error: 'not_signed_in' }, 401);

  let body: { gameId?: unknown; givens?: unknown; moves?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'bad_request' }, 400);
  }
  const moves = cleanMoves(body.moves);
  if (typeof body.gameId !== 'string' || !UUID.test(body.gameId) || typeof body.givens !== 'string' || !/^[0-9]{81}$/.test(body.givens) || !moves) {
    return reply({ error: 'bad_request' }, 400);
  }

  const { data: game } = await admin.from('games').select('id, user_id, mode, finished_at').eq('id', body.gameId).maybeSingle();
  if (!game || game.user_id !== auth.user.id) return reply({ error: 'no_game' }, 404);
  if (game.mode !== 'ranked' || game.finished_at) return reply({ error: 'not_open' }, 409);

  const givens = parseGrid(body.givens);
  let audit: Record<string, unknown>;
  if (countSolutions(givens) !== 1) {
    audit = { copied: true, reason: 'givens without a unique solution' };
  } else {
    const graded = grade(givens);
    const level = Math.max(1, graded.level) as TechniqueLevel;
    const result = auditSolve(givens, moves, level);
    audit = {
      copied: result.copied,
      reason: result.reason,
      rating: graded.rating,
      level,
      solution: gridToString(solve(givens)!),
      placements: result.placements,
      leaps: result.leaps,
      evidence: Math.round(result.evidence * 10) / 10,
      potential: Math.round(result.potential * 10) / 10,
      worstStretch: Math.round(result.worstStretch * 100) / 100,
      leapBurst: result.leapBurst,
      readingOrder: Math.round(result.readingOrder * 100) / 100,
      moves: moves.length,
      // The moves themselves (cell, digit, seconds), so a flagged game can be
      // looked into and the check retuned on real solves.
      log: moves.map((m) => [m.cell, m.digit, Math.round(m.at / 100) / 10]),
    };
  }
  const { error } = await admin.from('games').update({ audit }).eq('id', game.id).is('finished_at', null);
  if (error) return reply({ error: 'save_failed' }, 500);
  return reply({ copied: audit.copied });
});
