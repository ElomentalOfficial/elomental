import type { GenerateOptions, GeneratedPuzzle } from '@elomental/engine';

/**
 * Puzzles are generated (and shared squares checked) on the device, in a
 * worker. Signed in, the server picks the seed; Ranked wins are then checked
 * by the audit-solve Edge Function. That the solution can be worked out on
 * the device is a known gap (supabase/README.md, "Not covered yet").
 */

type Reply = { id: number; puzzle: GeneratedPuzzle } | { id: number; error: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (p: GeneratedPuzzle) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./puzzle-worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const reply = event.data;
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    if ('error' in reply) request.reject(new Error(reply.error));
    else request.resolve(reply.puzzle);
  };
  return worker;
}

export function requestPuzzle(options: GenerateOptions): Promise<GeneratedPuzzle> {
  return ask({ ...options });
}

/**
 * A shared square (81 digits, 0 = empty), checked, solved and graded in the
 * worker. Rejects with 'too_few', 'no_solution' or 'not_unique'.
 */
export function importPuzzle(givens: string): Promise<GeneratedPuzzle> {
  return ask({ givens });
}

function ask(message: object): Promise<GeneratedPuzzle> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...message, id });
  });
}
