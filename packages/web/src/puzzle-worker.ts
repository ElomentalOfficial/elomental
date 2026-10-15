import { generatePuzzle, type GenerateOptions } from '@elomental/engine';

// Hard puzzles can take a few hundred ms on a phone; keep that off the UI thread.
self.onmessage = (event: MessageEvent<GenerateOptions & { id: number }>) => {
  const { id, ...options } = event.data;
  try {
    self.postMessage({ id, puzzle: generatePuzzle(options) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
