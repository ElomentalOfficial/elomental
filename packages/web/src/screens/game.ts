import { a11yPrefs, haptic, onA11yChange } from '../a11y.ts';
import { openShortcuts } from '../shortcuts.ts';
import { playSound } from '../sound.ts';
import {
  BOXES,
  BOX_OF,
  COLS,
  COL_OF,
  PEERS,
  ROWS,
  ROW_OF,
  difficultyForRating,
  nextPlacement,
  type Difficulty,
  type GeneratedPuzzle,
  type Move,
  type TechniqueId,
} from '@elomental/engine';
import { ICONS } from '../icons.ts';
import {
  HINT_ELO_PENALTY,
  loadProfile,
  parMs,
  puzzleProfile,
  rankedStageFor,
  rankedTarget,
  recordResult,
  stageRating,
  type Mode,
  type Outcome,
} from '../profile.ts';
import { importPuzzle, requestPuzzle } from '../puzzles.ts';
import { formatSquareCode } from '../squareCode.ts';
import { copyText } from '../clipboard.ts';
import { RIBBON_BOX, RIBBON_PATH } from '../ribbon.ts';
import { notesWheelOn } from '../settings.ts';
import { readJson, removeKey, writeJson } from '../storage.ts';
import { explainHint, type Marks } from '../explain.ts';
import { getClash, saveClash, type ClashResult } from '../clash.ts';
import {
  GameRefused,
  auditServerGame,
  fetchClash,
  finishServerGame,
  pauseServerGame,
  resumeServerGame,
  ensureAccount,
  saveSettings,
  squareCodeFor,
  startServerGame,
  type ServerStart,
} from '../backend.ts';
import { devOn } from '../backend/dev.ts';
import { dropPending, flushPending, keepPending, markSending, pendingResults } from '../backend/pending.ts';
import { runHintCoach } from '../hintCoach.ts';
import { runTutorial, tutorialDone, type TutorialStep } from '../tutorial.ts';
import { holdToConfirm } from '../hold.ts';
import { formatSeconds, formatTime, goBack, h, hiddenHeading, mount, openModal, toast, type Screen } from '../ui.ts';
import { dailyScreen } from './daily.ts';
import { showClashResult, showResult, type FinishReason } from './result.ts';
import { boardGestures } from './wheel.ts';
import { devBar } from './devBar.ts';
import { homeScreen } from './home.ts';
import * as copy from '../copy/en.ts';

export interface GameConfig {
  mode: Mode;
  difficulty: Difficulty;
  puzzle: string;
  solution: string;
  rating: number;
  /** Ranked: the rating the square aimed for; par goes by it (missing in older saved games). */
  target?: number;
  /** Ranked: the stage it was dealt at, and the hardest technique it needs (missing in older saved games). */
  stage?: number;
  hardest?: TechniqueId | null;
  seed: string;
  dateKey?: string;
  /** Signed-in games: the server's game id; the server settles the result. */
  serverId?: string;
  /** Clash: the shared code, and the friend's result when it came in a link. */
  clash?: { code: string; theirs?: ClashResult | null };
  /** The puzzle's square code (squareCode.ts), once the server has given it one. */
  squareCode?: string;
}

interface Change {
  cell: number;
  value: number;
  notes: number;
}

export interface SavedGame {
  config: GameConfig;
  values: number[];
  notes: number[];
  mistakes: number;
  hints: number;
  elapsedMs: number;
  /** Wall-clock start; the ranked clock keeps running while the tab is hidden. */
  startedAt: number;
  history: Change[][];
  /**
   * Every change to a square's value, in order, with the game clock: the server
   * replays it to tell a solve worked out square by square from one typed in
   * from a solved grid (engine audit.ts). Older saves don't have it.
   */
  moves?: Move[];
  /** Left paused (e.g. went Home mid-pause); reopens paused. */
  paused?: boolean;
  /** Ranked/Clash pauses used (3 per game). */
  pauses?: number;
  /** Ranked/Clash: when the current pause began (wall clock), to count time past its 5 minutes. */
  pausedSince?: number;
}

/** Ranked and Clash allow this many pauses per game (the server enforces it too). */
const MAX_PAUSES = 3;
/** How long the clock waits per Ranked/Clash pause (the server's rule, ranked_pause.sql). */
const PAUSE_WAIT_MS = 5 * 60_000;

/**
 * One saved game per mode (full review H4), so starting a Casual game never replaces a paused
 * Ranked one. `elomental:game` was the single slot before; loadSavedGame moves it over.
 */
const SAVE_PREFIX = 'elomental:game';
/** Set once a player has been told what a hint costs outside Ranked. */
const HINT_TOLD_KEY = 'elomental:hint-told';
const saveKey = (mode: Mode) => `${SAVE_PREFIX}:${mode}`;
const MAX_MISTAKES = 3;
/** Hints per game, in every mode. Each one trims Stardust; in Ranked it also costs Elo (profile.ts). */
const MAX_HINTS = 3;

/** The game of this mode in progress on this phone, if any. */
export function loadSavedGame(mode: Mode): SavedGame | null {
  const single = readJson<SavedGame>(SAVE_PREFIX);
  if (single) {
    writeJson(saveKey(single.config.mode), single);
    removeKey(SAVE_PREFIX);
  }
  const saved = readJson<SavedGame>(saveKey(mode));
  if (saved) saved.hints ??= 0;
  return saved;
}

/** Forging faster than this skips the loading screen (most puzzles take well under it). */
const LOADING_DELAY_MS = 250;
/** Once shown, the loading screen finishes turning in (page-in, 0.42s) before the game replaces it. */
const LOADING_MIN_MS = 420;

export async function startGame(options: {
  mode: Mode;
  difficulty: Difficulty;
  seed?: string;
  dateKey?: string;
  clash?: GameConfig['clash'];
  /** A shared square (played as Casual): its 81 givens, and its code when it came as one. */
  square?: { givens: string; code?: string };
}) {
  // The loading screen only when forging takes a moment: shown and then replaced
  // within a few frames, it would flash half turned-in under the game.
  let loadingShownAt = 0;
  const loading = setTimeout(() => {
    loadingShownAt = performance.now();
    mount(loadingScreen());
  }, LOADING_DELAY_MS);
  /** Builds the next screen only when it goes up, so a game's clock doesn't start early. */
  const show = (next: () => Screen) => {
    clearTimeout(loading);
    const wait = loadingShownAt ? LOADING_MIN_MS - (performance.now() - loadingShownAt) : 0;
    if (wait > 0) setTimeout(() => mount(next()), wait);
    else mount(next());
  };
  // A shared square is checked before anything starts on the server.
  let shared: GeneratedPuzzle | undefined;
  if (options.square) {
    try {
      shared = await importPuzzle(options.square.givens);
    } catch (error) {
      toast(copy.game.squareErrors[(error as Error).message] ?? copy.game.squareUnplayable);
      return show(homeScreen);
    }
  }
  // A sudoku string has no stored difficulty: its grade sets it. A code keeps the original's.
  if (shared && !options.square?.code) options = { ...options, difficulty: shared.difficulty };
  let server: ServerStart | undefined;
  // A new guest's first game makes their account (backend/account.ts ensureAccount); the loading
  // screen covers the wait. Offline, it stays a local game.
  if (await ensureAccount()) {
    // A result still waiting on this phone goes first: starting Ranked would otherwise
    // forfeit a solved game as a loss, and a new Casual or Clash game would close it.
    if (pendingResults().length) {
      const { left } = await flushPending();
      if (left) {
        toast(copy.game.pendingStillWaiting);
        return show(options.mode === 'daily' ? dailyScreen : homeScreen);
      }
    }
    // Signed in: the server picks the seed (and Ranked's difficulty) and starts the clock.
    try {
      server = await startServerGame({
        mode: options.mode,
        difficulty: options.difficulty,
        dateKey: options.dateKey,
        clashCode: options.clash?.code,
      });
    } catch (error) {
      console.error(error);
      toast(error instanceof GameRefused ? error.message : copy.game.offlineSignedIn);
      return show(options.mode === 'daily' ? dailyScreen : homeScreen);
    }
  }
  try {
    // Ranked deals a stage of the ladder: the server's, or (a local guest) the Elo's own. A server
    // from before the ladder gives no stage: then the square aims at its target rating.
    const local = loadProfile();
    const rankedStage =
      options.mode !== 'ranked' ? undefined : server ? server.stage : rankedStageFor(local.elo, local.lossRun);
    const targetRating =
      options.mode !== 'ranked' ? undefined
      : (server?.targetRating ?? (rankedStage !== undefined ? stageRating(rankedStage) : rankedTarget(local.elo)));
    const difficulty =
      server?.difficulty ?? (targetRating !== undefined ? difficultyForRating(targetRating) : options.difficulty);
    const p =
      shared ??
      (await requestPuzzle({
        difficulty,
        profile: puzzleProfile(options.mode, difficulty, options.dateKey),
        targetRating,
        rankedStage,
        seed: server?.seed ?? options.seed,
      }));
    const game: SavedGame = {
      config: {
        mode: options.mode,
        difficulty,
        serverId: server?.gameId,
        puzzle: p.puzzle,
        solution: p.solution,
        rating: p.rating,
        target: targetRating,
        stage: p.stage ?? rankedStage,
        hardest: p.hardest,
        seed: p.seed,
        dateKey: options.dateKey,
        clash: options.clash,
        squareCode: options.square?.code,
      },
      values: [...p.puzzle].map(Number),
      notes: new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      elapsedMs: 0,
      startedAt: Date.now(),
      history: [],
    };
    writeJson(saveKey(game.config.mode), game);
    show(() => gameScreen(game));
  } catch (error) {
    console.error(error);
    toast(copy.game.forgeFailed);
    show(homeScreen);
  }
}

export function resumeGame(game: SavedGame): void {
  mount(gameScreen(game));
}

function loadingScreen(): Screen {
  return {
    el: h('div', { class: 'screen loading' }, h('div', { class: 'loader', html: ICONS.loader }), h('p', { text: copy.pick(copy.game.loading, String(Date.now())) })),
  };
}

const MODE_LABEL: Record<Mode, string> = copy.common.modes;

function gameScreen(game: SavedGame): Screen {
  const { config } = game;
  const ranked = config.mode === 'ranked';
  const clash = config.mode === 'clash' ? config.clash : undefined;
  /** Ranked and Clash are races: wall-clock timing, limited pauses (server-tracked). */
  const competitive = ranked || !!clash;
  const given = [...config.puzzle].map((ch) => ch !== '0');
  const solution = [...config.solution].map(Number);

  /** Nothing is selected until the player taps a square. */
  let selected = -1;
  /** Digit whose cells lose their background so they stand out. */
  let focusDigit = 0;
  let notesMode = false;
  let paused = false;
  /** True while the first-game tutorial is on screen. */
  let coaching = false;
  let finished = false;

  // --- Top bar -------------------------------------------------------------
  const leftButton = h('button', { class: 'bar-btn', text: ranked ? copy.game.concede : copy.common.home });
  const timer = h('div', { class: 'timer' });
  const pauseButton = h('button', { class: 'bar-btn bar-icon', html: ICONS.pause, attrs: { 'aria-label': copy.game.a11y.pause } });

  const skulls = Array.from({ length: MAX_MISTAKES }, () => h('span', { class: 'skull', html: ICONS.mistake }));
  // The square code: tap to copy and send it to a friend (squareCode.ts).
  const squareChip = h('button', {
    class: 'square-code',
    onclick: () => {
      const code = config.squareCode;
      if (!code) return;
      void copyText(formatSquareCode(code)).then((copied) => {
        if (copied === null) return;
        toast(copied ? copy.game.squareCodeCopied : copy.game.squareCodeBlocked(formatSquareCode(code)));
      });
    },
  });
  const paintSquareCode = () => {
    const code = config.squareCode;
    squareChip.hidden = !code;
    if (!code) return;
    squareChip.replaceChildren(h('span', { text: copy.game.squareCode(formatSquareCode(code)) }), h('span', { class: 'square-code-icon', html: ICONS.copy }));
    squareChip.setAttribute('aria-label', copy.game.a11y.squareCode(code));
  };
  paintSquareCode();
  if (!config.squareCode) {
    void squareCodeFor(config.puzzle, config.difficulty, config.rating).then((code) => {
      if (!code) return;
      config.squareCode = code;
      save();
      paintSquareCode();
    });
  }
  // Only Casual shows its difficulty; Daily and Ranked keep it hidden. Clash shows,
  // when the friend's result came in a link, the time to beat. Its code stays off
  // the label: the Square code chip beside it is the one code to copy.
  const typeLabel = clash
    ? copy.game.label.clash(clash.theirs?.solved ? formatSeconds(clash.theirs.seconds) : undefined)
    : config.mode === 'casual'
      ? copy.game.label.casual(config.difficulty)
      : MODE_LABEL[config.mode];
  // The mistake count as one image with a literal label ("1 of 3 mistakes"); render() keeps it current.
  const mistakesEl = h('div', { class: 'mistakes', attrs: { role: 'img' } }, ...skulls);
  const status = h(
    'div',
    { class: 'status' },
    mistakesEl,
    h('div', { class: 'puzzle-info' }, squareChip, h('span', { class: 'puzzle-type', text: typeLabel })),
  );

  // --- Board ---------------------------------------------------------------
  // An ARIA grid of 9 rows of 9 cells, in reading order. The 3x3 boxes are drawn by
  // CSS: the board grid has a zero-width spacer track after every third row and
  // column (styles.css .board), and nine frames outline the boxes.
  const cells: HTMLElement[] = [];
  const board = h('div', { class: 'board', attrs: { role: 'grid', 'aria-label': copy.game.a11y.board } });
  const line = (i: number) => String(i + Math.floor(i / 3) + 1);
  for (let r = 0; r < 9; r++) {
    const row = h('div', { class: 'board-row', attrs: { role: 'row' } });
    row.style.gridRow = line(r);
    for (let col = 0; col < 9; col++) {
      const c = r * 9 + col;
      const cell = h('div', { class: 'cell', attrs: { 'data-cell': String(c), role: 'gridcell', tabindex: '-1' } });
      cell.style.gridColumn = line(col);
      cells[c] = cell;
      row.append(cell);
    }
    board.append(row);
  }
  for (let b = 0; b < 9; b++) {
    const frame = h('div', { class: 'box-frame', attrs: { 'aria-hidden': 'true' } });
    frame.style.gridArea = `${4 * Math.floor(b / 3) + 1} / ${4 * (b % 3) + 1} / span 3 / span 3`;
    board.append(frame);
  }
  // Game events for screen readers: polite, one at a time, never the clock.
  const live = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
  const announce = (text: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  };
  const pauseCover = h(
    'button',
    { class: 'pause-cover', onclick: () => setPaused(false) },
    h('span', { class: 'play-badge', html: ICONS.play }),
    h('span', { class: 'heading-group' }, copy.game.paused, competitive ? h('small', { class: 'pause-note' }) : null),
  );
  const pauseNote = pauseCover.querySelector<HTMLElement>('.pause-note');
  const boardWrap = h('div', { class: 'board-wrap' }, board, pauseCover);

  // --- Pad -----------------------------------------------------------------
  const keys: HTMLElement[] = [];
  const pad = h('div', { class: 'pad' });
  for (let d = 1; d <= 9; d++) {
    // The digit sits in a span so notes mode can slide it to its pencil-mark spot.
    const key = h('button', { class: 'key', attrs: { 'data-digit': String(d) } }, h('span', { text: String(d) }));
    keys[d] = key;
    pad.append(key);
  }
  pad.append(h('button', { class: 'key key-erase', html: ICONS.eraser, attrs: { 'data-digit': '0', 'aria-label': copy.game.a11y.erase } }));

  const hintButton = h('button', {
    class: 'action',
    html: `${ICONS.hint}<span>${copy.game.hint}</span>`,
  });
  const undoButton = h('button', { class: 'action', html: `${ICONS.undo}<span>${copy.game.undo}</span>` });
  // The Notes toggle is always there. The notes wheel (long-press a cell) comes on top of it,
  // unless it's turned off in Setup.
  const useWheel = notesWheelOn();
  const notesButton = h('button', { class: 'action notes-toggle', html: `${ICONS.pencil}<span>${copy.game.notes}</span>`, attrs: { 'aria-pressed': 'false' } });

  // The splash ribbon hanging over the controls; only the wide layouts show it (styles.css).
  // The whole outline is stretched to the hanging length, so its tears and torn
  // tail keep their places, as in the Figma desktop frame.
  const brand = h(
    'div',
    { class: 'brand-banner', attrs: { 'aria-hidden': 'true' } },
    h('span', {
      class: 'brand-ribbon',
      html:
        `<svg viewBox="${RIBBON_BOX.x} 0 ${RIBBON_BOX.width} ${RIBBON_BOX.height}" preserveAspectRatio="none">` +
        `<path d="${RIBBON_PATH}"/></svg>`,
    }),
    h('span', { text: 'ELO' }),
    h('span', { text: 'MEN' }),
    h('span', { text: 'TAL' }),
  );

  // Keyboard: the first Tab stop jumps straight to the board (shown only while focused).
  const skipLink = h('button', {
    class: 'skip-link',
    text: copy.game.a11y.skipToBoard,
    onclick: () => cells[selected >= 0 ? selected : 40].focus(),
  });

  const el = h(
    'div',
    { class: `screen game mode-${config.mode}` },
    hiddenHeading(typeLabel),
    skipLink,
    live,
    brand,
    h('div', { class: 'topbar' }, leftButton, timer, pauseButton),
    h('div', { class: 'separator', html: ICONS.separator }),
    status,
    boardWrap,
    h(
      'div',
      { class: 'controls' },
      pad,
      h('div', { class: 'actions-row' }, hintButton, undoButton, notesButton),
    ),
  );

  // --- State changes -------------------------------------------------------
  const save = () => {
    if (!finished) writeJson(saveKey(config.mode), game);
  };

  function commit(changes: Change[]) {
    game.history.push(changes.map((c) => ({ cell: c.cell, value: game.values[c.cell], notes: game.notes[c.cell] })));
    for (const c of changes) {
      if (game.values[c.cell] !== c.value) recordMove(c.cell, c.value);
      game.values[c.cell] = c.value;
      game.notes[c.cell] = c.notes;
    }
  }

  function recordMove(cell: number, digit: number) {
    (game.moves ??= []).push({ cell, digit, at: Math.round(game.elapsedMs) });
  }

  const editable = (cell: number) => cell >= 0 && !given[cell] && !finished && !paused;

  function toggleNote(cell: number, digit: number) {
    if (!editable(cell) || game.values[cell]) return;
    commit([{ cell, value: 0, notes: game.notes[cell] ^ (1 << digit) }]);
    render();
    save();
  }

  /**
   * A wrong digit is never kept: it shows in the mistake colour, then fades
   * out by itself (the square's notes come back), so there's nothing to undo
   * or erase. Shown digits live here while they fade.
   */
  const fading = new Map<number, { digit: number; timer: number }>();
  const WRONG_FADE_MS = 1400;
  /**
   * Setup > Accessibility > Wrong numbers "Keep until next move": the wrong
   * digit stays (no fade) until the player's next move clears it.
   */
  const clearKeptWrong = () => {
    if (!fading.size) return;
    for (const [cell, f] of fading) {
      clearTimeout(f.timer);
      cells[cell].classList.remove('fading');
    }
    fading.clear();
  };
  /** Casual can turn the three-mistake limit off (Setup > Accessibility); other modes keep it. */
  const mistakeLimit = () => config.mode !== 'casual' || a11yPrefs().casualMistakeLimit;

  function place(cell: number, digit: number) {
    if (game.values[cell] === digit) return;
    const correct = digit === solution[cell];
    focusDigit = digit;
    if (!correct) {
      clearTimeout(fading.get(cell)?.timer);
      const keep = a11yPrefs().keepWrong;
      fading.set(cell, {
        digit,
        timer: keep
          ? 0
          : window.setTimeout(() => {
              fading.delete(cell);
              cells[cell].classList.remove('fading');
              render();
            }, WRONG_FADE_MS),
      });
      game.mistakes++;
      haptic(40);
      playSound('wrong');
      // The last mistake ends the game; the result dialog says so.
      const left = MAX_MISTAKES - game.mistakes;
      if (!mistakeLimit()) announce(copy.game.a11y.wrongNumberNoLimit);
      else if (left > 0) announce(copy.game.a11y.wrongNumber(left));
      render();
      if (!keep) replay(cells[cell], 'fading');
      replay(status, 'strike');
      save();
      if (mistakeLimit() && game.mistakes >= MAX_MISTAKES) finish(false, 'mistakes');
      return;
    }
    playSound('place');
    const changes: Change[] = [{ cell, value: digit, notes: 0 }];
    // Clear this digit from the notes of every peer, like pencil marks on paper.
    for (const p of PEERS[cell]) {
      if (game.notes[p] & (1 << digit)) changes.push({ cell: p, value: game.values[p], notes: game.notes[p] & ~(1 << digit) });
    }
    clearTimeout(fading.get(cell)?.timer);
    fading.delete(cell);
    cells[cell].classList.remove('fading');
    commit(changes);
    render();
    celebrateUnits(cell);
    save();
    if (game.values.every((v, c) => v === solution[c])) finish(true, 'solved');
  }

  /** Restart a one-shot CSS animation class on an element. */
  function replay(target: HTMLElement, cls: string) {
    target.classList.remove(cls);
    void target.offsetWidth;
    target.classList.add(cls);
  }

  /**
   * When a placement completes its row, column or box, a ripple runs through
   * those nine squares outward from the one just filled.
   */
  function celebrateUnits(cell: number) {
    const a11y = copy.game.a11y;
    const units: [number[], string][] = [
      [ROWS[ROW_OF[cell]], a11y.row(ROW_OF[cell] + 1)],
      [COLS[COL_OF[cell]], a11y.column(COL_OF[cell] + 1)],
      [BOXES[BOX_OF[cell]], a11y.box(BOX_OF[cell] + 1)],
    ];
    const swept = new Map<number, number>();
    const done: string[] = [];
    for (const [unit, name] of units) {
      if (!unit.every((c) => game.values[c] === solution[c])) continue;
      done.push(name);
      for (const c of unit) {
        const distance = Math.abs(ROW_OF[c] - ROW_OF[cell]) + Math.abs(COL_OF[c] - COL_OF[cell]);
        swept.set(c, Math.min(swept.get(c) ?? Infinity, distance));
      }
    }
    for (const [c, distance] of swept) {
      cells[c].style.animationDelay = `${distance * 35}ms`;
      replay(cells[c], 'sweep');
    }
    if (swept.size) haptic(12);
    if (done.length) {
      playSound('complete');
      announce(a11y.unitsComplete(done));
    }
  }

  function input(digit: number) {
    if (finished || paused || selected < 0) return;
    clearKeptWrong();
    if (digit === 0) return erase();
    if (!editable(selected) || (game.values[selected] && game.values[selected] === solution[selected])) {
      // Pressing a digit on a locked cell just highlights every cell with that digit.
      focusDigit = focusDigit === digit ? 0 : digit;
      return render();
    }
    if (notesMode) toggleNote(selected, digit);
    else place(selected, digit);
  }

  function erase() {
    if (!editable(selected) || (!game.values[selected] && !game.notes[selected])) return;
    commit([{ cell: selected, value: 0, notes: 0 }]);
    render();
    save();
  }

  function undo() {
    if (finished || paused) return;
    clearKeptWrong();
    const last = game.history.pop();
    if (!last) return;
    for (const c of last) {
      if (game.values[c.cell] !== c.value) recordMove(c.cell, c.value);
      game.values[c.cell] = c.value;
      game.notes[c.cell] = c.notes;
    }
    render();
    save();
  }

  /**
   * A hint opens an explained walkthrough (like sudoku.com): the relevant
   * squares light up and a card explains the logic step by step, ending with
   * "Place N". The hint counts as soon as it opens. The clock waits while it is
   * on screen in Casual and Daily; in Ranked and Clash the server's clock runs
   * on, so the shown one does too (the confirm says so).
   */
  async function hint() {
    if (finished || paused || coaching) return;
    if (game.hints >= MAX_HINTS) return toast(copy.game.noHintsLeft(MAX_HINTS));
    // Only correct digits count as known; a wrong entry must not mislead the hint.
    const known = Uint8Array.from(game.values, (v, c) => (v === solution[c] ? v : 0));
    const next = nextPlacement(known);
    if (!next) return toast(copy.game.noHintStep);
    // Ranked and Clash: say what a hint costs (Elo, a running clock) before the first one
    if (competitive && game.hints === 0 && !(await confirmHint())) return;
    if (finished || paused) return;
    game.hints++;
    coaching = true;
    selected = -1;
    focusDigit = 0;
    render();
    save();

    board.classList.add('explaining');
    const placed = await runHintCoach({
      stages: explainHint(next, known),
      placeLabel: copy.game.placeNumber(next.digit),
      show: markHint,
    });
    markHint({});
    board.classList.remove('explaining');
    coaching = false;
    last = performance.now();

    if (placed && game.values[next.cell] !== next.digit) {
      selected = next.cell;
      place(next.cell, next.digit);
      cells[next.cell].classList.add('hinted');
      setTimeout(() => cells[next.cell].classList.remove('hinted'), 900);
      announce(copy.game.a11y.hintPlaced(next.digit, ROW_OF[next.cell] + 1, COL_OF[next.cell] + 1));
    } else render();
    if (ranked) toast(copy.game.hintEloCut(Math.round(HINT_ELO_PENALTY * 100 * game.hints)));
    // what a hint costs elsewhere, said once, at the first one (owner, 2026-10-24: in context, not in the coach)
    else if (!readJson<boolean>(HINT_TOLD_KEY)) {
      writeJson(HINT_TOLD_KEY, true);
      toast(copy.game.hintStardust(MAX_HINTS));
    }
  }

  /** Ranked's first hint of a game: its cost, then Use hint or Keep playing (the default). */
  function confirmHint(): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const answer = (yes: boolean) => {
        if (answered) return;
        answered = true;
        close();
        resolve(yes);
      };
      const keep = h('button', { class: 'btn btn-primary', text: copy.game.keepPlaying, attrs: { type: 'button' }, onclick: () => answer(false) });
      const close = openModal(
        h('div', { class: 'confirm' },
          h('h2', { text: copy.game.hintConfirmTitle }),
          h('p', { text: ranked ? copy.game.hintConfirmText(Math.round(HINT_ELO_PENALTY * 100)) : copy.game.hintConfirmClash }),
          // it costs Elo: held to confirm (hold.ts)
          h('div', { class: 'actions' }, keep, holdToConfirm(h('button', { class: 'btn', text: copy.game.hintUse, attrs: { type: 'button' } }), () => answer(true)))),
      );
      // Esc or a tap outside is "Keep playing"
      const watch = new MutationObserver(() => {
        if (!keep.isConnected) {
          watch.disconnect();
          if (!answered) {
            answered = true;
            resolve(false);
          }
        }
      });
      watch.observe(document.body, { childList: true });
    });
  }

  /** Apply a stage's highlights to the board. */
  function markHint(marks: Marks) {
    const focus = new Set(marks.focus ?? []);
    const ring = new Set(marks.ring ?? []);
    const ruled = new Set(marks.ruled ?? []);
    for (let c = 0; c < 81; c++) {
      cells[c].classList.toggle('hx-focus', focus.has(c));
      cells[c].classList.toggle('hx-ring', ring.has(c));
      cells[c].classList.toggle('hx-ruled', ruled.has(c));
      cells[c].classList.toggle('hx-target', marks.target === c);
    }
  }

  function renderHintButton() {
    const left = MAX_HINTS - game.hints;
    hintButton.classList.toggle('locked', left <= 0);
    hintButton.setAttribute('aria-disabled', String(left <= 0));
    hintButton.setAttribute('aria-label', copy.game.a11y.hint(left));
    hintButton.innerHTML = `${left > 0 ? ICONS.hint : ICONS.lock}<span>${copy.game.hint}</span><span class="hint-count" aria-hidden="true">${left}</span>`;
  }

  function select(cell: number) {
    if (finished || paused) return;
    if (cell !== selected) clearKeptWrong();
    selected = cell;
    focusDigit = game.values[cell];
    render();
    // Keyboard focus follows the selection while it's on the board (roving tabindex).
    if (board.contains(document.activeElement) && document.activeElement !== cells[cell]) cells[cell].focus({ preventScroll: true });
  }

  /**
   * Pausing stops the clock in every mode. Ranked and Clash get 3 pauses per
   * game, and the server stops counting too (each pause free for 5 minutes).
   */
  async function setPaused(value: boolean, restoring = false) {
    if (finished || value === paused) return;
    if (value && competitive && !restoring) {
      const used = game.pauses ?? 0;
      if (used >= MAX_PAUSES) return toast(copy.game.noPausesLeft);
      let left = MAX_PAUSES - used - 1;
      if (config.serverId) {
        const serverLeft = await pauseServerGame(config.serverId);
        if (serverLeft === 'none') return toast(copy.game.noPausesLeft);
        // didn't reach the server: the clock runs on there, so it runs on here and no pause is used
        if (serverLeft === 'failed') return toast(copy.game.pauseFailed);
        if (serverLeft === 'closed') return toast(copy.game.pauseClosed);
        left = serverLeft;
      }
      game.pauses = MAX_PAUSES - left;
    }
    if (!value && competitive && config.serverId) void resumeServerGame(config.serverId);
    // The clock waits up to 5 minutes per pause (the server's rule): time past that counts.
    if (competitive && value && !restoring) game.pausedSince = Date.now();
    if (competitive && !value && game.pausedSince) {
      const over = Date.now() - game.pausedSince - PAUSE_WAIT_MS;
      if (over > 0) {
        game.elapsedMs += over;
        game.startedAt = Date.now() - game.elapsedMs;
      }
      delete game.pausedSince;
    }
    paused = value;
    game.paused = paused;
    if (pauseNote) {
      const left = MAX_PAUSES - (game.pauses ?? 0);
      pauseNote.textContent = copy.game.pausesLeft(left);
    }
    save();
    el.classList.toggle('paused', paused);
    // Paused Ranked: the way out is Home (the game waits), not Concede.
    if (ranked) leftButton.textContent = paused ? copy.common.home : copy.game.concede;
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseButton.setAttribute('aria-label', paused ? copy.game.a11y.resume : copy.game.a11y.pause);
    if (!restoring) announce(paused ? copy.game.a11y.pausedNow : copy.game.a11y.resumedNow);
    tick();
  }

  // --- Rendering -----------------------------------------------------------
  function render() {
    // Which highlights the player wants (Setup > Accessibility > Highlights).
    const prefs = a11yPrefs();
    for (let c = 0; c < 81; c++) {
      const flash = fading.get(c)?.digit ?? 0;
      // A fading wrong digit is shown but not part of the game state.
      const value = game.values[c] || flash;
      const cell = cells[c];
      const cross =
        selected >= 0 &&
        c !== selected &&
        ((prefs.highlightLines && (ROW_OF[c] === ROW_OF[selected] || COL_OF[c] === COL_OF[selected])) ||
          (prefs.highlightBox && BOX_OF[c] === BOX_OF[selected]));
      cell.classList.toggle('given', given[c]);
      cell.classList.toggle('filled', !given[c] && value > 0);
      cell.classList.toggle('wrong', !given[c] && value > 0 && value !== solution[c]);
      cell.classList.toggle('selected', c === selected);
      cell.classList.toggle('cross', cross);
      cell.classList.toggle('same', prefs.highlightSame && focusDigit > 0 && value === focusDigit && !flash);
      // One cell is in the Tab order: the selected one (or the centre), and arrows move it.
      cell.tabIndex = c === (selected >= 0 ? selected : 40) ? 0 : -1;
      cell.setAttribute('aria-selected', String(c === selected));

      const wrong = !given[c] && value > 0 && value !== solution[c];
      const key = value ? `v${value}${wrong ? 'w' : ''}` : game.notes[c] ? `n${game.notes[c]}` : '';
      if (cell.dataset.k === key) continue;
      const wasEmpty = !cell.dataset.k?.startsWith('v') && !flash;
      cell.dataset.k = key;
      const a11y = copy.game.a11y;
      cell.setAttribute(
        'aria-label',
        a11y.cell(
          ROW_OF[c] + 1,
          COL_OF[c] + 1,
          BOX_OF[c] + 1,
          !value
            ? game.notes[c]
              ? a11y.cellNotes(digitsIn(game.notes[c]))
              : a11y.cellEmpty
            : given[c]
              ? a11y.cellGiven(value)
              : wrong
                ? a11y.cellWrong(value)
                : a11y.cellYours(value),
        ),
      );
      if (given[c]) cell.setAttribute('aria-readonly', 'true');
      if (value) {
        cell.textContent = String(value);
        // A freshly placed digit pops in (not on first paint or a resumed game).
        if (rendered && wasEmpty && !given[c]) replay(cell, 'pop');
      } else if (game.notes[c]) {
        cell.replaceChildren(
          h(
            'div',
            { class: 'notes', attrs: { 'aria-hidden': 'true' } },
            ...Array.from({ length: 9 }, (_, i) => h('span', { text: game.notes[c] & (1 << (i + 1)) ? String(i + 1) : '' })),
          ),
        );
      } else cell.textContent = '';
    }

    skulls.forEach((s, i) => s.classList.toggle('used', i < game.mistakes));
    mistakesEl.setAttribute('aria-label', mistakeLimit() ? copy.game.a11y.mistakes(game.mistakes, MAX_MISTAKES) : copy.game.a11y.mistakesNoLimit(game.mistakes));
    for (let d = 1; d <= 9; d++) {
      let placed = 0;
      for (let c = 0; c < 81; c++) if (game.values[c] === d && solution[c] === d) placed++;
      keys[d].classList.toggle('done', placed === 9);
    }
    el.classList.toggle('notes-mode', notesMode);
    notesButton.classList.toggle('on', notesMode);
    notesButton.setAttribute('aria-pressed', String(notesMode));
    renderHintButton();
    rendered = true;
  }
  let rendered = false;
  const digitsIn = (mask: number) => Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => mask & (1 << d));

  // --- Clock (always counts up) ---------------------------------------------
  let last = performance.now();
  function tick() {
    const now = performance.now();
    if ((coaching && !competitive) || (competitive && paused)) {
      // The clock stands still during a hint or the first-game tutorial in Casual and Daily.
      // Ranked and Clash are timed by the server, which only pauses on Pause: the shown
      // clock never stops when the one that counts doesn't.
      game.startedAt = Date.now() - game.elapsedMs;
    } else if (competitive && !finished) {
      // (once finished, the time is the server's: settle() put it here, and it stays)
      game.elapsedMs = Date.now() - game.startedAt;
    } else if (!paused && !finished && !document.hidden) {
      // Cap the step so a sleeping phone doesn't add the whole nap to the clock.
      game.elapsedMs += Math.min(now - last, 1000);
    }
    last = now;
    timer.textContent = formatTime(game.elapsedMs);
    if (ranked) timer.classList.toggle('over-par', game.elapsedMs > parMs(config.target ?? config.rating));
  }
  const clock = setInterval(tick, 250);
  const autosave = setInterval(save, 2000);

  // --- Dev mode (founders only; devBar.ts) ------------------------------------
  if (devOn() && config.serverId) {
    const solveNow = () => {
      if (finished) return;
      const changes: Change[] = [];
      for (let c = 0; c < 81; c++) if (game.values[c] !== solution[c]) changes.push({ cell: c, value: solution[c], notes: 0 });
      commit(changes);
      render();
      save();
      finish(true, 'solved');
    };
    const loseNow = () => {
      if (finished) return;
      game.mistakes = MAX_MISTAKES;
      render();
      finish(false, 'mistakes');
    };
    status.after(devBar(solveNow, loseNow));
  }

  // --- Finish --------------------------------------------------------------
  function finish(won: boolean, reason: FinishReason) {
    if (finished) return;
    finished = true;
    tick();
    removeKey(saveKey(config.mode));
    selected = -1;
    focusDigit = 0;
    render();
    el.classList.add(won ? 'won' : 'lost');
    // The result appears after the win animation, and never before the server has answered.
    const shown = new Promise((resolve) => setTimeout(resolve, won ? 650 : 350));
    void settle(won).then(async ({ outcome, notice }) => {
      await shown;
      if (clash) await showClash(won, outcome, notice);
      else showResult(game, won, reason, outcome, { max: MAX_MISTAKES, on: mistakeLimit() }, notice);
    });
  }

  /** Signed in: the server settles the game (and its clock wins). Guest: the local profile does. */
  async function settle(won: boolean): Promise<{ outcome: Outcome; notice?: string }> {
    if (!config.serverId) {
      const outcome = recordResult({
        mode: config.mode,
        difficulty: config.difficulty,
        rating: config.rating,
        target: config.target,
        stage: config.stage,
        dateKey: config.dateKey,
        won,
        mistakes: game.mistakes,
        hints: game.hints,
        elapsedMs: game.elapsedMs,
      });
      return { outcome };
    }
    // Kept on this phone before it's sent, so a phone that closes mid-send still has it, and
    // dropped once the server answers; with no connection it stays to be sent later (pending.ts).
    const gameId = config.serverId;
    const seconds = Math.floor(game.elapsedMs / 1000);
    keepPending({
      gameId, ranked, won, mistakes: game.mistakes, hints: game.hints, seconds,
      rating: config.rating, grid: game.values.join(''), puzzle: config.puzzle, moves: game.moves ?? [],
    });
    markSending(gameId, true);
    try {
      // A Ranked win only counts once the server has replayed the solve (see auditServerGame).
      if (ranked && won) await auditServerGame(gameId, config.puzzle, game.moves ?? []);
      const result = await finishServerGame({
        gameId, won, mistakes: game.mistakes, hints: game.hints, seconds, rating: config.rating, grid: game.values.join(''),
      });
      if ('offline' in result) {
        return { outcome: { dust: 0, spirit: false }, notice: config.mode === 'ranked' || config.mode === 'clash' ? copy.game.pendingKeptTimed : copy.game.pendingKept };
      }
      dropPending(gameId);
      if ('refused' in result) return { outcome: { dust: 0, spirit: false }, notice: result.refused };
      game.elapsedMs = result.seconds * 1000;
      timer.textContent = formatTime(game.elapsedMs);
      return { outcome: result.outcome };
    } finally {
      markSending(gameId, false);
    }
  }

  async function showClash(won: boolean, outcome: Outcome, notice?: string) {
    const code = clash!.code;
    const mine: ClashResult = { solved: won, seconds: Math.floor(game.elapsedMs / 1000), mistakes: game.mistakes, hints: game.hints };
    // Signed in, the friend's result comes from the server; otherwise from a link or this phone.
    const entries = config.serverId ? await fetchClash(code) : null;
    const fromServer = entries?.find((e) => !e.isMe)?.result;
    const theirs = fromServer ?? clash!.theirs ?? getClash(code).theirs ?? null;
    saveClash(code, { mine, theirs: theirs ?? undefined });
    showClashResult(code, mine, theirs, outcome, notice, !!config.serverId);
  }

  function concede() {
    const close = openModal(
      h(
        'div',
        { class: 'confirm' },
        h('p', { text: copy.game.concedeConfirm }),
        h(
          'div',
          { class: 'actions' },
          // the safe choice is the primary one (and first, so it takes the focus)
          h('button', { class: 'btn btn-primary', text: copy.game.keepPlaying, onclick: () => close() }),
          // a loss: held to confirm (hold.ts)
          holdToConfirm(h('button', { class: 'btn', text: copy.game.concede }), () => {
            close();
            finish(false, 'concede');
          }),
        ),
      ),
    );
  }

  // --- Board gestures: tap selects, long-press opens the notes wheel (wheel.ts) --
  const gestures = boardGestures({
    board,
    cells,
    useWheel,
    select,
    canNote: (cell) => editable(cell) && !game.values[cell],
    notes: (cell) => game.notes[cell],
    toggleNote,
  });
  const cellFrom = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>('[data-cell]');

  // iOS runs its own long-press (text selection, magnifier, callout) off the touch
  // events and then cancels our pointer mid-gesture. Cancelling touchstart keeps the
  // whole gesture ours; pointer events still fire.
  board.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });

  // Keyboard: tabbing onto the board (or the skip link) selects the focused cell.
  board.addEventListener('focusin', (event) => {
    const target = cellFrom(event.target);
    if (target && Number(target.dataset.cell) !== selected) select(Number(target.dataset.cell));
  });

  /**
   * Touch and mouse act on pointerdown, with no tap delay. Keyboards, switch
   * access and screen readers only send a click, so a click counts too, unless
   * it's the click that follows a press already handled.
   */
  const onPress = (target: HTMLElement, act: (event: Event) => void) => {
    let pressedAt = -Infinity;
    target.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pressedAt = event.timeStamp;
      act(event);
    });
    target.addEventListener('click', (event) => {
      if (event.timeStamp - pressedAt < 1000) return;
      act(event);
    });
  };
  onPress(pad, (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-digit]');
    if (key) input(Number(key.dataset.digit));
  });
  hintButton.addEventListener('click', () => void hint());
  onPress(notesButton, () => {
    if (finished || paused) return;
    notesMode = !notesMode;
    render();
  });
  onPress(undoButton, () => undo());
  pauseButton.addEventListener('click', () => setPaused(!paused));
  leftButton.addEventListener('click', () => {
    if (finished) return void goBack(homeScreen);
    if (ranked && !paused) return concede();
    save();
    void goBack(config.mode === 'daily' ? dailyScreen : homeScreen);
  });

  const onKey = (event: KeyboardEvent) => {
    if (coaching) return; // tutorial or hint explanation on screen
    if (document.querySelector('body > .backdrop')) return; // a pop-up has the keyboard
    if (gestures.wheelOpen()) {
      if (event.key === 'Escape') gestures.closeWheel();
      return;
    }
    const digitKey = event.code.startsWith('Digit') ? Number(event.code.slice(5)) : NaN;
    if (event.shiftKey && digitKey >= 1 && digitKey <= 9) toggleNote(selected, digitKey);
    else if (/^[1-9]$/.test(event.key)) input(Number(event.key));
    else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') input(0);
    else if (event.key === 'n' || event.key === 'N') {
      // The Notes button shows the mode, so no toast is needed; screen readers hear it.
      notesMode = !notesMode;
      announce(copy.game.a11y.notesMode(notesMode));
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') undo();
    else if (event.key === '?') openShortcuts();
    else if ((event.key === 'h' || event.key === 'H') && !event.ctrlKey && !event.metaKey) void hint();
    else if ((event.key === 'p' || event.key === 'P') && !event.ctrlKey && !event.metaKey) void setPaused(!paused);
    else if (event.key.startsWith('Arrow') && selected < 0) select(40); // first arrow press starts in the centre
    else if (event.key.startsWith('Arrow')) {
      const r = ROW_OF[selected];
      const c = COL_OF[selected];
      const moves: Record<string, [number, number]> = {
        ArrowUp: [(r + 8) % 9, c],
        ArrowDown: [(r + 1) % 9, c],
        ArrowLeft: [r, (c + 8) % 9],
        ArrowRight: [r, (c + 1) % 9],
      };
      const [nr, nc] = moves[event.key];
      select(nr * 9 + nc);
    } else return;
    event.preventDefault();
  };
  const onHide = () => {
    if (document.hidden) save();
  };
  window.addEventListener('keydown', onKey);
  // Highlight and mistake-limit preferences apply to the game in progress.
  const stopA11y = onA11yChange(() => render());
  document.addEventListener('visibilitychange', onHide);

  focusDigit = selected >= 0 ? game.values[selected] : 0;
  // Left paused (went Home mid-pause): reopen paused, with the clock where it stopped.
  if (game.paused) {
    if (competitive) game.startedAt = Date.now() - game.elapsedMs;
    void setPaused(true, true);
  }
  render();
  tick();

  // The first-game tutorial waits for a Casual or Daily game: a Ranked or Clash clock (the
  // server's) wouldn't stop for it.
  if (!tutorialDone() && !competitive) {
    coaching = true;
    const steps: TutorialStep[] = [
      {
        target: board,
        ...copy.tutorial.pick,
        gesture: 'tap',
      },
      {
        target: pad,
        ...copy.tutorial.fill,
        gesture: 'tap',
      },
      // notes, with the wheel when it's on in Setup. Three cards in all (owner, 2026-10-24): Erase
      // and Undo say what they do on their keys, and a hint's cost is told at the first one (hint)
      { target: notesButton, ...(useWheel ? copy.tutorial.notesWithWheel : copy.tutorial.notes), gesture: 'tap' },
    ];
    // Wait for the page turnstile to settle so the spotlight lands on the final positions.
    setTimeout(() => {
      void runTutorial(steps).then(() => {
        saveSettings({ tutorialDone: true });
        coaching = false;
        last = performance.now();
      });
    }, 480);
  }

  return {
    el,
    title: typeLabel,
    destroy() {
      save();
      gestures.destroy();
      for (const { timer } of fading.values()) clearTimeout(timer);
      clearInterval(clock);
      clearInterval(autosave);
      window.removeEventListener('keydown', onKey);
      stopA11y();
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}

