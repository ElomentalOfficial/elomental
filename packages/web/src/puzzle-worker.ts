import {
  countClues,
  countSolutions,
  difficultyForRating,
  generatePuzzle,
  grade,
  gridToString,
  parseGrid,
  solve,
  type GenerateOptions,
  type GeneratedPuzzle,
} from '@elomental/engine';

type Request = (GenerateOptions & { id: number; givens?: undefined }) | { id: number; givens: string };

// Hard puzzles can take a few hundred ms on a phone; keep that off the UI thread.
self.onmessage = (event: MessageEvent<Request>) => {
  const { id } = event.data;
  try {
    if (event.data.givens !== undefined) {
      self.postMessage({ id, puzzle: importGivens(event.data.givens) });
      return;
    }
    const { id: _, givens: __, ...options } = event.data;
    self.postMessage({ id, puzzle: generatePuzzle(options) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

/** A shared square: checked (one solution, nothing contradicts), solved and graded. */
function importGivens(givens: string): GeneratedPuzzle {
  const grid = parseGrid(givens);
  if (countClues(grid) < 17) throw new Error('too_few');
  const solutions = countSolutions(grid);
  if (solutions === 0) throw new Error('no_solution');
  if (solutions > 1) throw new Error('not_unique');
  const graded = grade(grid);
  return {
    puzzle: gridToString(grid),
    solution: gridToString(solve(grid)!),
    difficulty: difficultyForRating(graded.rating),
    clues: countClues(grid),
    level: graded.level,
    hardest: graded.hardest,
    score: graded.score,
    rating: graded.rating,
    counts: graded.counts,
    seed: `square:${givens}`,
    attempts: 0,
  };
}
