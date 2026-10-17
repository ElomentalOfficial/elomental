import { PEERS, TECHNIQUE_BY_ID, UNITS, type Hint, type Step } from '@elomental/engine';

/**
 * Turns a hint into a short walkthrough, like sudoku.com's explained hints:
 * each stage has a sentence and the squares to highlight.
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
const list = (digits: number[]) =>
  digits.length <= 1 ? String(digits[0] ?? '') : `${digits.slice(0, -1).join(', ')} and ${digits[digits.length - 1]}`;
const uniq = (cells: number[]) => [...new Set(cells)];

function priorStage(step: Step): Stage {
  const name = TECHNIQUE_BY_ID[step.technique].name;
  const d = step.digits ?? [];
  const pattern = step.pattern ?? [];
  const ruled = uniq(step.eliminations.map(([c]) => c));
  const kind = step.unit !== undefined ? unitKind(step.unit) : 'line';
  const focus = step.unit !== undefined ? UNITS[step.unit] : uniq([...pattern, ...ruled]);
  let text: string;
  switch (step.technique) {
    case 'pointing':
      text = `In this box, ${d[0]} can only go in one line, so ${d[0]} can't go anywhere else along that line.`;
      break;
    case 'claiming':
      text = `In this ${kind}, ${d[0]} can only go inside one box, so ${d[0]} is ruled out of the rest of that box.`;
      break;
    case 'nakedPair':
    case 'nakedTriple':
    case 'nakedQuad':
      text = `These ${pattern.length} squares can only hold ${list(d)} between them, so no other square in this ${kind} can.`;
      break;
    case 'hiddenPair':
    case 'hiddenTriple':
    case 'hiddenQuad':
      text = `${list(d)} fit only in these ${pattern.length} squares of this ${kind}, so those squares can't hold anything else.`;
      break;
    case 'xWing':
    case 'swordfish':
    case 'jellyfish':
      text = `${d[0]} sits in matching spots across these lines, so ${d[0]} is ruled out of the rest of the lines they cross.`;
      break;
    case 'finnedXWing':
    case 'finnedSwordfish':
    case 'finnedJellyfish':
      text =
        `${d[0]} sits in matching spots across these lines, plus a fin: an extra spot or two inside one box. ` +
        `Either the fin is ${d[0]}, or the lines lock ${d[0]} in and clear the lines they cross. ` +
        `Squares in the fin's box on those crossing lines lose ${d[0]} either way.`;
      break;
    case 'emptyRectangle':
      text =
        `In this box, ${d[0]} can only sit on one row or one column. This line outside it has just two spots for ${d[0]}: ` +
        `if the one in line with the box is ${d[0]}, the box's ${d[0]} is pushed onto its other line; if not, the far spot is ${d[0]}. ` +
        `Either way this square can't be ${d[0]}.`;
      break;
    case 'xyzWing':
      text = `Whatever the middle square turns out to be, one of these three squares must be ${d[0]}, so any square that sees all three can't be ${d[0]}.`;
      break;
    case 'skyscraper':
    case 'twoStringKite':
      text =
        `Two lines each have only two spots for ${d[0]}, and one end of each sees the other. ` +
        `They can't both be ${d[0]}, so one of the two far ends is — any square that sees both far ends can't be ${d[0]}.`;
      break;
    case 'wWing':
      text =
        `These two squares can only be ${d[0]} or ${d[1]}. They can't both be ${d[1]}, because the ${d[1]} they each see has to go somewhere. ` +
        `So one of them is ${d[0]}, and any square that sees both can't be ${d[0]}.`;
      break;
    case 'remotePairs':
      text =
        `Each of these squares can only be ${list(d)}, and each sees the next, so along the chain they take turns. ` +
        `A square that sees one of each kind can be neither ${d[0]} nor ${d[1]}.`;
      break;
    case 'simpleColouring':
      text = ruled.every((c) => pattern.includes(c))
        ? `Follow the pairs of spots for ${d[0]}: they take turns being ${d[0]}. Two squares on the same turn see each other, so that turn is wrong and none of them is ${d[0]}.`
        : `Follow the pairs of spots for ${d[0]}: they take turns being ${d[0]}, so one turn holds every ${d[0]}. Any square that sees both turns can't be ${d[0]}.`;
      break;
    case 'xChain':
      text =
        `Follow this chain of ${d[0]}s: if the first square isn't ${d[0]}, each link forces the next, and the last square is ${d[0]}. ` +
        `So one end of the chain is ${d[0]}, and any square that sees both ends can't be.`;
      break;
    case 'xyChain':
      text =
        `Each square in this chain has only two choices. If the first isn't ${d[0]}, the choices fall like dominoes until the last one is ${d[0]}. ` +
        `So one end is ${d[0]}, and any square that sees both ends can't be.`;
      break;
    case 'alsXz':
      text =
        `These two groups each have one more digit than squares. ${d[1]} can only go in one of the groups, and that pins the other group down. ` +
        `Either way one of the groups holds ${d[0]}, so any square that sees every ${d[0]} in both can't be ${d[0]}.`;
      break;
    default:
      text = `These three squares force ${d[0]} into one of the outer two, so any square that sees both can't be ${d[0]}.`;
  }
  return { title: `First: ${name}`, text, marks: { focus, ring: pattern, ruled } };
}

/**
 * @param values the board as the hint saw it: correct digits only, 0 elsewhere.
 */
export function explainHint(hint: Hint, values: ArrayLike<number>): Stage[] {
  const { cell: target, digit: D } = hint;
  const name = TECHNIQUE_BY_ID[hint.technique].name;
  // The engine reports every elimination it made on the way; only explain the
  // ones that actually matter here: they rule out D inside the hint's unit, or
  // they rule out candidates of the target square itself.
  const unitCells = hint.unit !== undefined ? new Set(UNITS[hint.unit]) : null;
  const relevant = hint.prior.filter((step) =>
    step.eliminations.some(([c, d]) => (unitCells ? unitCells.has(c) && d === D : c === target)),
  );
  const stages = relevant.map(priorStage).map((stage, i) => (i === 0 ? stage : { ...stage, title: stage.title.replace('First:', 'Then:') }));
  const eliminatedByPrior = new Set(
    relevant.flatMap((s) => s.eliminations.filter(([, d]) => d === D).map(([c]) => c)),
  );
  const stepsAbove = relevant.length > 1 ? 'the steps above rule' : 'the step before rules';

  if (hint.technique === 'fullHouse' && hint.unit !== undefined) {
    const unit = UNITS[hint.unit];
    const kind = unitKind(hint.unit);
    stages.push(
      { title: name, text: `Only one square is still empty in this ${kind}.`, marks: { focus: unit, target } },
      {
        title: name,
        text: `Every other digit is already here — the one missing is ${D}.`,
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
      { title: name, text: `Where can ${D} go in this ${kind}?`, marks: { focus: unit } },
      {
        title: name,
        text:
          `The ${D}s already on the board rule out every other empty square here` +
          (viaPrior ? ` (${stepsAbove} out the rest).` : '.'),
        marks: { focus: unit, ring: blockers, ruled: others },
      },
      { title: name, text: `That leaves just one place for ${D}.`, marks: { focus: unit, target } },
    );
  } else {
    // Naked single: the square's row, column and box between them leave one digit.
    const seen = PEERS[target];
    const present = [...new Set(seen.map((c) => values[c]).filter(Boolean))].sort((a, b) => a - b);
    const area = [target, ...seen];
    stages.push(
      { title: name, text: `Look at everything this square can see: its row, column and box.`, marks: { focus: area, target } },
      {
        title: name,
        text:
          `Between them they already hold ${list(present)}` +
          (present.length < 8 && relevant.length ? `, and ${stepsAbove} out the rest` : '') +
          `. The only digit left for this square is ${D}.`,
        marks: { focus: area, ring: seen.filter((c) => values[c]), target },
      },
    );
  }
  return stages;
}
