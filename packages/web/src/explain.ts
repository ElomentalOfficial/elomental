import { PEERS, TECHNIQUE_BY_ID, UNITS, type Hint, type Step } from '@elomental/engine';
import * as copy from './copy/en.ts';

/**
 * Turns a hint into a short walkthrough, like sudoku.com's explained hints:
 * each stage has a sentence and the squares to highlight. The sentences are
 * in copy/en.ts (hints); this file picks them and the highlights.
 */

export interface Marks {
  /** The row / column / box being discussed (others are dimmed). */
  focus?: number[];
  /** Squares that matter: blocking digits or the pattern of a technique. */
  ring?: number[];
  /** Empty squares ruled out. */
  ruled?: number[];
  /** The square the hint fills. */
  target?: number;
}

export interface Stage {
  title: string;
  text: string;
  marks: Marks;
}

const unitKind = (u: number) => (u < 9 ? 'row' : u < 18 ? 'column' : 'box');
const uniq = (cells: number[]) => [...new Set(cells)];

function priorStage(step: Step): Stage {
  const name = copy.techniqueName(TECHNIQUE_BY_ID[step.technique].name);
  const d = step.digits ?? [];
  const pattern = step.pattern ?? [];
  const ruled = uniq(step.eliminations.map(([c]) => c));
  const kind = step.unit !== undefined ? unitKind(step.unit) : 'line';
  const focus = step.unit !== undefined ? UNITS[step.unit] : uniq([...pattern, ...ruled]);
  const say = copy.hints.prior;
  let text: string;
  switch (step.technique) {
    case 'pointing':
      text = say.pointing(d);
      break;
    case 'claiming':
      text = say.claiming(d, kind);
      break;
    case 'nakedPair':
    case 'nakedTriple':
    case 'nakedQuad':
      text = say.nakedSubset(d, pattern.length, kind);
      break;
    case 'hiddenPair':
    case 'hiddenTriple':
    case 'hiddenQuad':
      text = say.hiddenSubset(d, pattern.length, kind);
      break;
    case 'xWing':
    case 'swordfish':
    case 'jellyfish':
      text = say.fish(d);
      break;
    case 'finnedXWing':
    case 'finnedSwordfish':
    case 'finnedJellyfish':
      text = say.finnedFish(d);
      break;
    case 'emptyRectangle':
      text = say.emptyRectangle(d);
      break;
    case 'xyzWing':
      text = say.xyzWing(d);
      break;
    case 'skyscraper':
    case 'twoStringKite':
      text = say.turbot(d);
      break;
    case 'wWing':
      text = say.wWing(d);
      break;
    case 'remotePairs':
      text = say.remotePairs(d);
      break;
    case 'simpleColouring':
      text = ruled.every((c) => pattern.includes(c)) ? say.colourWrap(d) : say.colourTrap(d);
      break;
    case 'xChain':
      text = say.xChain(d);
      break;
    case 'xyChain':
      text = say.xyChain(d);
      break;
    case 'alsXz':
      text = say.alsXz(d);
      break;
    default:
      text = say.xyWing(d);
  }
  return { title: copy.hints.first(name), text, marks: { focus, ring: pattern, ruled } };
}

/**
 * @param values the board as the hint saw it: correct digits only, 0 elsewhere.
 */
export function explainHint(hint: Hint, values: ArrayLike<number>): Stage[] {
  const { cell: target, digit: D } = hint;
  const name = copy.techniqueName(TECHNIQUE_BY_ID[hint.technique].name);
  // The engine reports every elimination it made on the way; only explain the
  // ones that actually matter here: they rule out D inside the hint's unit, or
  // they rule out candidates of the target square itself.
  const unitCells = hint.unit !== undefined ? new Set(UNITS[hint.unit]) : null;
  const relevant = hint.prior.filter((step) =>
    step.eliminations.some(([c, d]) => (unitCells ? unitCells.has(c) && d === D : c === target)),
  );
  const stages = relevant
    .map(priorStage)
    .map((stage, i) => (i === 0 ? stage : { ...stage, title: copy.hints.then(copy.techniqueName(TECHNIQUE_BY_ID[relevant[i].technique].name)) }));
  const eliminatedByPrior = new Set(
    relevant.flatMap((s) => s.eliminations.filter(([, d]) => d === D).map(([c]) => c)),
  );
  const stepsAbove = copy.hints.stepsAbove(relevant.length > 1);

  if (hint.technique === 'fullHouse' && hint.unit !== undefined) {
    const unit = UNITS[hint.unit];
    const kind = unitKind(hint.unit);
    stages.push(
      { title: name, text: copy.hints.fullHouse.one(kind), marks: { focus: unit, target } },
      {
        title: name,
        text: copy.hints.fullHouse.missing(D),
        marks: { focus: unit, ring: unit.filter((c) => values[c]), target },
      },
    );
  } else if (hint.technique === 'hiddenSingle' && hint.unit !== undefined) {
    const unit = UNITS[hint.unit];
    const kind = unitKind(hint.unit);
    const others = unit.filter((c) => c !== target && !values[c]);
    // For each other empty square, one placed D that sees it (preferring one outside the unit).
    const blockers = uniq(
      others
        .map((c) => PEERS[c].find((p) => values[p] === D && !unit.includes(p)) ?? PEERS[c].find((p) => values[p] === D))
        .filter((p): p is number => p !== undefined),
    );
    const viaPrior = others.some((c) => eliminatedByPrior.has(c) && !PEERS[c].some((p) => values[p] === D));
    stages.push(
      { title: name, text: copy.hints.hiddenSingle.where(D, kind), marks: { focus: unit } },
      {
        title: name,
        text: copy.hints.hiddenSingle.ruledOut(D, viaPrior ? stepsAbove : undefined),
        marks: { focus: unit, ring: blockers, ruled: others },
      },
      { title: name, text: copy.hints.hiddenSingle.one(D), marks: { focus: unit, target } },
    );
  } else {
    // Naked single: the square's row, column and box between them leave one digit.
    const seen = PEERS[target];
    const present = [...new Set(seen.map((c) => values[c]).filter(Boolean))].sort((a, b) => a - b);
    const area = [target, ...seen];
    stages.push(
      { title: name, text: copy.hints.nakedSingle.look, marks: { focus: area, target } },
      {
        title: name,
        text: copy.hints.nakedSingle.left(present, present.length < 8 && relevant.length ? stepsAbove : undefined, D),
        marks: { focus: area, ring: seen.filter((c) => values[c]), target },
      },
    );
  }
  return stages;
}
