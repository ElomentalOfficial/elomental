// Ranked solve check (see packages/engine/src/audit.ts and migrations solve_audit, ranked_integrity).
//
//   POST { gameId, givens, moves } + user JWT -> { ok: true }
//
// Once per open Ranked game, it:
// - regenerates the puzzle the game dealt (same seed and target, the same engine code as the app)
//   and checks the solved puzzle is it (full review C2: a client can't pick its own square);
// - checks the moves' timing against the server's clock and human pace (C3);
// - replays the moves: were the squares worked out, or typed in from a solved grid?
// and saves the verdict, the puzzle's graded rating and its solution in private.game_audits,
// where the player can't read them (no oracle for tuning a bot). finish_game rates the win
// only with a clean audit, and checks the submitted grid against the solution.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { auditSolve, type Move } from '../_shared/engine/audit.ts';
import { generatePuzzle, type Difficulty } from '../_shared/engine/generator.ts';
import { grade } from '../_shared/engine/grader.ts';
import { gridToString, parseGrid } from '../_shared/engine/grid.ts';
import { solve } from '../_shared/engine/solver.ts';
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
/** The moves may end at most this long after the server's own clock for the game. */
const CLOCK_SLACK_MS = 5000;
/** Half the moves come quicker than this: faster than a person places numbers. */
const MIN_MEDIAN_GAP_MS = 700;
/** Too few moves to judge pace from (an old save, or a nearly full square). */
const PACE_MIN_MOVES = 12;

function cleanMoves(raw: unknown): Move[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_MOVES) return null;
  const moves: Move[] = [];
  for (const m of raw) {
    const { cell, digit, at } = (m ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(cell) || !Number.isInteger(digit) || typeof at !== 'number' || !Number.isFinite(at)) return null;
    if ((cell as number) < 0 || (cell as number) > 80 || (digit as number) < 0 || (digit as number) > 9) return null;
    moves.push({ cell: cell as number, digit: digit as number, at });
  }
  return moves;
}

/** Why the timing doesn't fit a person playing this game, or null when it does. */
function timingProblem(moves: Move[], game: { started_at: string; paused_seconds: number }): string | null {
  // closed pauses only: a resume lost on the way would otherwise put the app ahead of this clock
  const serverMs = Date.now() - Date.parse(game.started_at) - game.paused_seconds * 1000;
  const last = moves.reduce((m, x) => Math.max(m, x.at), 0);
  if (last > serverMs + CLOCK_SLACK_MS) return 'moves after the game\'s own clock';
  if (moves.length >= PACE_MIN_MOVES) {
    const gaps = moves.slice(1).map((m, i) => m.at - moves[i].at).sort((a, b) => a - b);
    if (gaps[Math.floor(gaps.length / 2)] < MIN_MEDIAN_GAP_MS) return 'moves faster than a person places numbers';
  }
  return null;
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

  const { data: game } = await admin
    .from('games')
    .select('id, user_id, mode, finished_at, seed, difficulty, rating, target_rating, started_at, paused_seconds')
    .eq('id', body.gameId)
    .maybeSingle();
  if (!game || game.user_id !== auth.user.id) return reply({ error: 'no_game' }, 404);
  if (game.mode !== 'ranked' || game.finished_at) return reply({ error: 'not_open' }, 409);
  // Before any work: not audited yet, and at most 10 asks a minute (so this can't burn CPU).
  const { data: slot, error: slotError } = await admin.rpc('audit_slot', { p_game: game.id, p_user: auth.user.id });
  if (slotError) return reply({ error: slotError.message.includes('slow_down') ? 'slow_down' : 'save_failed' }, slotError.message.includes('slow_down') ? 429 : 500);
  if (!slot) return reply({ error: 'already_audited' }, 409);

  // The puzzle this game dealt: same seed, same target, same puzzle (the engine is deterministic).
  // If it can't be made here, nothing is saved: the win lands as not checked, not as scripted.
  let dealt: string;
  try {
    dealt = generatePuzzle({ difficulty: game.difficulty as Difficulty, targetRating: game.target_rating ?? game.rating, seed: game.seed }).puzzle;
  } catch {
    return reply({ error: 'generate_failed' }, 500);
  }

  let audit: Record<string, unknown>;
  const timing = timingProblem(moves, game);
  if (body.givens !== dealt) {
    audit = { copied: true, check: 'puzzle', reason: 'not the puzzle this game dealt', givens: body.givens, dealt };
  } else {
    const givens = parseGrid(body.givens);
    const graded = grade(givens);
    const level = Math.max(1, graded.level) as TechniqueLevel;
    const result = auditSolve(givens, moves, level);
    audit = {
      copied: result.copied || timing !== null,
      check: timing ? 'timing' : 'solve',
      reason: timing ?? result.reason,
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
  const { error } = await admin.rpc('save_audit', { p_game: game.id, p_audit: audit });
  if (error) return reply({ error: error.message.includes('already_audited') ? 'already_audited' : 'save_failed' }, error.message.includes('already_audited') ? 409 : 500);
  // Never the verdict: it stays on the server.
  return reply({ ok: true });
});
