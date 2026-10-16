import {
  BOXES,
  BOX_OF,
  COLS,
  COL_OF,
  PEERS,
  ROWS,
  ROW_OF,
  TECHNIQUE_BY_ID,
  nextPlacement,
  type Difficulty,
} from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { PAR_MS, recordResult, type Mode, type Outcome } from '../profile.ts';
import { requestPuzzle } from '../puzzles.ts';
import { openNotesWheel, type NotesWheel } from '../radial.ts';
import { readJson, removeKey, writeJson } from '../storage.ts';
import { markTutorialDone, runTutorial, tutorialDone, type TutorialStep } from '../tutorial.ts';
import { formatTime, goBack, h, mount, openModal, toast, type Screen } from '../ui.ts';
import { dailyScreen } from './daily.ts';
import { homeScreen } from './home.ts';

export interface GameConfig {
  mode: Mode;
  difficulty: Difficulty;
  puzzle: string;
  solution: string;
  rating: number;
  seed: string;
  dateKey?: string;
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
}

const SAVE_KEY = 'elomental:game';
const MAX_MISTAKES = 3;
/** Hints per game (Casual · Easy only), so a puzzle can't be solved on hints alone. */
const MAX_HINTS = 10;
/** Hold this long to open the notes wheel; quick taps stay well under it. */
const LONG_PRESS_MS = 230;
/** Or drag this far from the square to open it immediately (swipe-to-note). */
const SWIPE_START = 14;

export function loadSavedGame(): SavedGame | null {
  const saved = readJson<SavedGame>(SAVE_KEY);
  if (saved) saved.hints ??= 0;
  return saved;
}

export async function startGame(options: { mode: Mode; difficulty: Difficulty; seed?: string; dateKey?: string }) {
  mount(loadingScreen());
  try {
    const p = await requestPuzzle({ difficulty: options.difficulty, seed: options.seed });
    const game: SavedGame = {
      config: {
        mode: options.mode,
        difficulty: options.difficulty,
        puzzle: p.puzzle,
        solution: p.solution,
        rating: p.rating,
        seed: p.seed,
        dateKey: options.dateKey,
      },
      values: [...p.puzzle].map(Number),
      notes: new Array(81).fill(0),
      mistakes: 0,
      hints: 0,
      elapsedMs: 0,
      startedAt: Date.now(),
      history: [],
    };
    writeJson(SAVE_KEY, game);
    mount(gameScreen(game));
  } catch (error) {
    console.error(error);
    toast('Could not forge a puzzle');
    mount(homeScreen());
  }
}

export function resumeGame(game: SavedGame): void {
  mount(gameScreen(game));
}

function loadingScreen(): Screen {
  return {
    el: h('div', { class: 'screen loading' }, h('div', { class: 'loader' }), h('p', { text: 'Forging your square…' })),
  };
}

const MODE_LABEL: Record<Mode, string> = { casual: 'Casual', daily: 'Daily Square', ranked: 'Ranked' };
const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

function gameScreen(game: SavedGame): Screen {
  const { config } = game;
  const ranked = config.mode === 'ranked';
  const hintsAllowed = config.mode === 'casual' && config.difficulty === 'easy';
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
  const leftButton = h('button', { class: 'bar-btn', text: ranked ? 'Concede' : 'Home' });
  const timer = h('div', { class: 'timer' });
  const pauseButton = h('button', { class: 'bar-btn bar-icon', html: ICONS.pause, attrs: { 'aria-label': 'Pause' } });
  if (ranked) pauseButton.style.visibility = 'hidden';

  const skulls = Array.from({ length: MAX_MISTAKES }, () => h('span', { class: 'skull', html: ICONS.mistake }));
  const status = h(
    'div',
    { class: 'status' },
    h('div', { class: 'mistakes', attrs: { 'aria-label': 'Mistakes' } }, ...skulls),
    h('div', {
      class: 'puzzle-info',
      // Only Casual shows its difficulty; Daily and Ranked keep it hidden.
      text: config.mode === 'casual' ? `Casual · ${capitalize(config.difficulty)}` : MODE_LABEL[config.mode],
    }),
  );

  // --- Board ---------------------------------------------------------------
  const cells: HTMLElement[] = [];
  const board = h('div', { class: 'board', attrs: { role: 'grid', 'aria-label': 'Sudoku board' } });
  for (let b = 0; b < 9; b++) {
    const box = h('div', { class: 'box' });
    for (const c of BOXES[b]) {
      const cell = h('div', { class: 'cell', attrs: { 'data-cell': String(c), role: 'gridcell' } });
      cells[c] = cell;
      box.append(cell);
    }
    board.append(box);
  }
  const pauseCover = h(
    'button',
    { class: 'pause-cover', onclick: () => setPaused(false) },
    h('span', { class: 'play-badge', html: ICONS.play }),
    'Paused',
  );
  const boardWrap = h('div', { class: 'board-wrap' }, board, pauseCover);

  // --- Pad -----------------------------------------------------------------
  const keys: HTMLElement[] = [];
  const pad = h('div', { class: 'pad' });
  for (let d = 1; d <= 9; d++) {
    const key = h('button', { class: 'key', text: String(d), attrs: { 'data-digit': String(d) } });
    keys[d] = key;
    pad.append(key);
  }
  pad.append(h('button', { class: 'key key-erase', html: ICONS.eraser, attrs: { 'data-digit': '0', 'aria-label': 'Erase' } }));

  const hintButton = h('button', {
    class: `action${hintsAllowed ? '' : ' locked'}`,
    html: `${hintsAllowed ? ICONS.hint : ICONS.lock}<span>Hint</span>`,
  });
  const undoButton = h('button', { class: 'action', html: `${ICONS.undo}<span>Undo</span>` });

  const el = h(
    'div',
    { class: `screen game mode-${config.mode}` },
    h('div', { class: 'topbar' }, leftButton, timer, pauseButton),
    h('div', { class: 'separator', html: ICONS.separator }),
    status,
    boardWrap,
    h(
      'div',
      { class: 'controls' },
      h('div', { class: 'separator', html: ICONS.separator }),
      pad,
      h('div', { class: 'actions-row' }, hintButton, undoButton),
    ),
  );

  // --- State changes -------------------------------------------------------
  const save = () => {
    if (!finished) writeJson(SAVE_KEY, game);
  };

  function commit(changes: Change[]) {
    game.history.push(changes.map((c) => ({ cell: c.cell, value: game.values[c.cell], notes: game.notes[c.cell] })));
    for (const c of changes) {
      game.values[c.cell] = c.value;
      game.notes[c.cell] = c.notes;
    }
  }

  const editable = (cell: number) => cell >= 0 && !given[cell] && !finished && !paused;

  function toggleNote(cell: number, digit: number) {
    if (!editable(cell) || game.values[cell]) return;
    commit([{ cell, value: 0, notes: game.notes[cell] ^ (1 << digit) }]);
    render();
    save();
  }

  function place(cell: number, digit: number) {
    if (game.values[cell] === digit) return;
    const changes: Change[] = [{ cell, value: digit, notes: 0 }];
    const correct = digit === solution[cell];
    if (correct) {
      // Clear this digit from the notes of every peer, like pencil marks on paper.
      for (const p of PEERS[cell]) {
        if (game.notes[p] & (1 << digit)) changes.push({ cell: p, value: game.values[p], notes: game.notes[p] & ~(1 << digit) });
      }
    }
    commit(changes);
    focusDigit = digit;
    if (!correct) {
      game.mistakes++;
      navigator.vibrate?.(40);
      replay(cells[cell], 'shake');
      replay(status, 'strike');
    }
    render();
    if (correct) celebrateUnits(cell);
    save();
    if (game.values.every((v, c) => v === solution[c])) finish(true, 'solved');
    else if (game.mistakes >= MAX_MISTAKES) finish(false, 'mistakes');
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
    const units = [ROWS[ROW_OF[cell]], COLS[COL_OF[cell]], BOXES[BOX_OF[cell]]];
    const swept = new Map<number, number>();
    for (const unit of units) {
      if (!unit.every((c) => game.values[c] === solution[c])) continue;
      for (const c of unit) {
        const distance = Math.abs(ROW_OF[c] - ROW_OF[cell]) + Math.abs(COL_OF[c] - COL_OF[cell]);
        swept.set(c, Math.min(swept.get(c) ?? Infinity, distance));
      }
    }
    for (const [c, distance] of swept) {
      cells[c].style.animationDelay = `${distance * 35}ms`;
      replay(cells[c], 'sweep');
    }
    if (swept.size) navigator.vibrate?.(12);
  }

  function input(digit: number) {
    if (finished || paused || selected < 0) return;
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
    const last = game.history.pop();
    if (!last) return;
    for (const c of last) {
      game.values[c.cell] = c.value;
      game.notes[c.cell] = c.notes;
    }
    render();
    save();
  }

  function hint() {
    if (finished || paused) return;
    if (!hintsAllowed) return toast('Hints are only available in Casual · Easy');
    if (game.hints >= MAX_HINTS) return toast(`No hints left — ${MAX_HINTS} per game`);
    // Only correct digits count as known; a wrong entry must not mislead the hint.
    const known = Uint8Array.from(game.values, (v, c) => (v === solution[c] ? v : 0));
    const next = nextPlacement(known);
    if (!next) return;
    game.hints++;
    selected = next.cell;
    place(next.cell, next.digit);
    cells[next.cell].classList.add('hinted');
    setTimeout(() => cells[next.cell].classList.remove('hinted'), 900);
    const left = MAX_HINTS - game.hints;
    toast(`${TECHNIQUE_BY_ID[next.technique].name}: ${next.digit} · ${left} hint${left === 1 ? '' : 's'} left`);
  }

  function renderHintButton() {
    if (!hintsAllowed) {
      hintButton.setAttribute('aria-disabled', 'true');
      hintButton.setAttribute('aria-label', 'Hint, only in Casual Easy');
      return;
    }
    const left = MAX_HINTS - game.hints;
    hintButton.classList.toggle('locked', left <= 0);
    hintButton.setAttribute('aria-disabled', String(left <= 0));
    hintButton.setAttribute('aria-label', `Hint, ${left} left`);
    hintButton.innerHTML = `${left > 0 ? ICONS.hint : ICONS.lock}<span>Hint</span><span class="hint-count" aria-hidden="true">${left}</span>`;
  }

  function select(cell: number) {
    if (finished || paused) return;
    selected = cell;
    focusDigit = game.values[cell];
    render();
  }

  function setPaused(value: boolean) {
    if (ranked || finished) return;
    paused = value;
    el.classList.toggle('paused', paused);
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    tick();
  }

  // --- Rendering -----------------------------------------------------------
  function render() {
    for (let c = 0; c < 81; c++) {
      const value = game.values[c];
      const cell = cells[c];
      const cross = selected >= 0 && c !== selected && (ROW_OF[c] === ROW_OF[selected] || COL_OF[c] === COL_OF[selected]);
      cell.classList.toggle('given', given[c]);
      cell.classList.toggle('filled', !given[c] && value > 0);
      cell.classList.toggle('wrong', !given[c] && value > 0 && value !== solution[c]);
      cell.classList.toggle('selected', c === selected);
      cell.classList.toggle('cross', cross);
      cell.classList.toggle('same', focusDigit > 0 && value === focusDigit);

      const key = value ? `v${value}` : game.notes[c] ? `n${game.notes[c]}` : '';
      if (cell.dataset.k === key) continue;
      const wasEmpty = !cell.dataset.k?.startsWith('v');
      cell.dataset.k = key;
      cell.setAttribute(
        'aria-label',
        `Row ${ROW_OF[c] + 1}, column ${COL_OF[c] + 1}: ` +
          (value ? String(value) : game.notes[c] ? `notes ${digitsIn(game.notes[c]).join(' ')}` : 'empty'),
      );
      if (value) {
        cell.textContent = String(value);
        // A freshly placed digit pops in (not on first paint or a resumed game).
        if (rendered && wasEmpty && !given[c]) replay(cell, 'pop');
      } else if (game.notes[c]) {
        cell.replaceChildren(
          h(
            'div',
            { class: 'notes' },
            ...Array.from({ length: 9 }, (_, i) => h('span', { text: game.notes[c] & (1 << (i + 1)) ? String(i + 1) : '' })),
          ),
        );
      } else cell.textContent = '';
    }

    skulls.forEach((s, i) => s.classList.toggle('used', i < game.mistakes));
    for (let d = 1; d <= 9; d++) {
      let placed = 0;
      for (let c = 0; c < 81; c++) if (game.values[c] === d && solution[c] === d) placed++;
      keys[d].classList.toggle('done', placed === 9);
    }
    el.classList.toggle('notes-mode', notesMode);
    renderHintButton();
    rendered = true;
  }
  let rendered = false;
  const digitsIn = (mask: number) => Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => mask & (1 << d));

  // --- Clock (always counts up) ---------------------------------------------
  let last = performance.now();
  function tick() {
    const now = performance.now();
    if (coaching) {
      // The clock stands still during the first-game tutorial, ranked included.
      game.startedAt = Date.now() - game.elapsedMs;
    } else if (ranked) {
      game.elapsedMs = Date.now() - game.startedAt;
    } else if (!paused && !finished && !document.hidden) {
      // Cap the step so a sleeping phone doesn't add the whole nap to the clock.
      game.elapsedMs += Math.min(now - last, 1000);
    }
    last = now;
    timer.textContent = formatTime(game.elapsedMs);
    if (ranked) timer.classList.toggle('over-par', game.elapsedMs > PAR_MS[config.difficulty]);
  }
  const clock = setInterval(tick, 250);
  const autosave = setInterval(save, 2000);

  // --- Finish --------------------------------------------------------------
  function finish(won: boolean, reason: 'solved' | 'mistakes' | 'concede') {
    if (finished) return;
    finished = true;
    tick();
    removeKey(SAVE_KEY);
    selected = -1;
    focusDigit = 0;
    render();
    el.classList.add(won ? 'won' : 'lost');
    const outcome = recordResult({
      mode: config.mode,
      difficulty: config.difficulty,
      rating: config.rating,
      dateKey: config.dateKey,
      won,
      mistakes: game.mistakes,
      hints: game.hints,
      elapsedMs: game.elapsedMs,
    });
    setTimeout(() => showResult(won, reason, outcome), won ? 650 : 350);
  }

  function showResult(won: boolean, reason: string, outcome: Outcome) {
    const titles: Record<string, string> = { solved: 'Square Complete', mistakes: 'Three Strikes', concede: 'Conceded' };
    const rows: (HTMLElement | null)[] = [
      statRow('Time', formatTime(game.elapsedMs)),
      statRow('Mistakes', `${game.mistakes} / ${MAX_MISTAKES}`),
    ];
    if (game.hints) rows.push(statRow('Hints', String(game.hints)));
    if (outcome.elo) {
      const delta = outcome.elo.after - outcome.elo.before;
      const eloRow = statRow('Elo', `${outcome.elo.before} → ${outcome.elo.after} (${delta >= 0 ? '+' : ''}${delta})`, delta > 0 ? 'good' : '');
      // The new rating counts up from the old one.
      countUp(eloRow.querySelector('strong')!, outcome.elo.before, outcome.elo.after, (n) => `${outcome.elo!.before} → ${n} (${delta >= 0 ? '+' : ''}${delta})`);
      rows.push(eloRow);
      if (outcome.elo.bonus > 0) rows.push(h('p', { class: 'note good', text: `Speed bonus +${Math.round(outcome.elo.bonus * 100)}% — under par time` }));
      if (outcome.elo.bonus < 0) rows.push(h('p', { class: 'note', text: `Slow finish ${Math.round(outcome.elo.bonus * 100)}% — over twice par time` }));
      if (outcome.elo.protectedLoss) rows.push(h('p', { class: 'note', text: 'Below 500 Elo your rating is protected — no points lost.' }));
    }
    if (outcome.daily) {
      rows.push(statRow('This month', `${outcome.daily.done} / ${outcome.daily.days} squares`));
      if (outcome.daily.monthComplete) rows.push(h('p', { class: 'note good', text: 'Month complete — avatar unlocked!' }));
    }

    const rewards = h('div', { class: 'rewards' });
    if (outcome.dust) {
      const amount = h('span', { text: `+${outcome.dust} Stardust` });
      countUp(amount, 0, outcome.dust, (n) => `+${n} Stardust`);
      rewards.append(h('div', { class: 'reward' }, h('span', { html: ICONS.dust }), amount));
    }
    if (outcome.crown) rewards.append(h('div', { class: 'reward rare', html: `${ICONS.crown}<span>Rare drop: Rusted Crown!</span>` }));

    const again =
      config.mode === 'daily'
        ? h('button', { class: 'btn btn-primary', text: 'Calendar', onclick: () => void goBack(dailyScreen) })
        : h('button', {
            class: 'btn btn-primary',
            text: ranked ? 'Next match' : 'New square',
            onclick: () => void startGame({ mode: config.mode, difficulty: config.difficulty }),
          });

    openModal(
      h(
        'div',
        { class: 'result' },
        h('h2', { class: won ? 'good' : '', text: titles[reason] }),
        h('div', { class: 'stats' }, ...rows),
        rewards.childElementCount ? rewards : null,
        h('div', { class: 'actions' }, again, h('button', { class: 'btn', text: 'Home', onclick: () => void goBack(homeScreen) })),
      ),
      { dismissible: false },
    );
  }

  function concede() {
    const close = openModal(
      h(
        'div',
        { class: 'confirm' },
        h('p', { text: 'Concede this match? It counts as a loss.' }),
        h(
          'div',
          { class: 'actions' },
          h('button', {
            class: 'btn btn-primary',
            text: 'Concede',
            onclick: () => {
              close();
              finish(false, 'concede');
            },
          }),
          h('button', { class: 'btn', text: 'Keep playing', onclick: () => close() }),
        ),
      ),
    );
  }

  // --- Board gestures: tap selects, long-press opens the notes wheel --------
  let press: { id: number; x: number; y: number; cell: number; timer: number } | null = null;
  let wheel: NotesWheel | null = null;

  const cellFrom = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>('[data-cell]');

  function openWheel(cell: number, x: number, y: number) {
    endPressFeedback();
    cells[cell].classList.add('noting');
    wheel = openNotesWheel({
      x,
      y,
      notes: game.notes[cell],
      onToggle: (digit) => toggleNote(cell, digit),
      onClose: () => {
        cells[cell].classList.remove('noting');
        wheel = null;
      },
    });
  }

  // iOS runs its own long-press (text selection, magnifier, callout) off the touch
  // events and then cancels our pointer mid-gesture. Cancelling touchstart keeps the
  // whole gesture ours; pointer events still fire.
  board.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });

  board.addEventListener('pointerdown', (event) => {
    const target = cellFrom(event.target);
    if (!target) return;
    wheel?.close(); // never let a half-finished wheel block the board
    event.preventDefault();
    const cell = Number(target.dataset.cell);
    select(cell);
    if (!editable(cell) || game.values[cell]) return;
    if (event.button === 2) return openWheel(cell, event.clientX, event.clientY); // right-click on desktop
    try {
      // Keep receiving moves while the finger slides off the board toward a wheel digit.
      board.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; the gesture still works on the board.
    }
    // Immediate feedback while the hold builds up (a ring fills around the square).
    cells[cell].classList.add('pressing');
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cell,
      timer: window.setTimeout(() => {
        if (press) openWheel(press.cell, press.x, press.y);
      }, LONG_PRESS_MS),
    };
  });
  const endPressFeedback = () => {
    for (const c of board.querySelectorAll('.cell.pressing')) c.classList.remove('pressing');
  };
  // Move/up/cancel are tracked on the window, not the board: once the wheel opens it
  // covers the board, and iOS doesn't reliably honour pointer capture for touch, so
  // the lift can land on the wheel's overlay instead. Missing it is what left the
  // wheel stuck open with no way to close it.
  const onPressMove = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (!wheel && Math.hypot(event.clientX - press.x, event.clientY - press.y) > SWIPE_START) {
      // Swipe shortcut: dragging off a square means "note", so open at once
      // instead of waiting for the long-press. Nothing else uses drags on the board.
      clearTimeout(press.timer);
      endPressFeedback();
      openWheel(press.cell, press.x, press.y);
    }
    wheel?.move(event.clientX, event.clientY);
  };
  const onPressUp = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    clearTimeout(press.timer);
    endPressFeedback();
    press = null;
    wheel?.release(event.clientX, event.clientY);
  };
  const onPressCancel = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    clearTimeout(press.timer);
    endPressFeedback();
    press = null;
    // The system took the touch away: drop the wheel without adding anything.
    wheel?.close();
  };
  window.addEventListener('pointermove', onPressMove, true);
  window.addEventListener('pointerup', onPressUp, true);
  window.addEventListener('pointercancel', onPressCancel, true);

  pad.addEventListener('pointerdown', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-digit]');
    if (!key) return;
    event.preventDefault();
    input(Number(key.dataset.digit));
  });
  hintButton.addEventListener('click', hint);
  undoButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    undo();
  });
  pauseButton.addEventListener('click', () => setPaused(!paused));
  leftButton.addEventListener('click', () => {
    if (finished) return void goBack(homeScreen);
    if (ranked) return concede();
    save();
    void goBack(config.mode === 'daily' ? dailyScreen : homeScreen);
  });

  const onKey = (event: KeyboardEvent) => {
    if (wheel) {
      if (event.key === 'Escape') wheel.close();
      return;
    }
    const digitKey = event.code.startsWith('Digit') ? Number(event.code.slice(5)) : NaN;
    if (event.shiftKey && digitKey >= 1 && digitKey <= 9) toggleNote(selected, digitKey);
    else if (/^[1-9]$/.test(event.key)) input(Number(event.key));
    else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') input(0);
    else if (event.key === 'n' || event.key === 'N') {
      notesMode = !notesMode;
      toast(notesMode ? 'Notes mode on' : 'Notes mode off');
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') undo();
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
  document.addEventListener('visibilitychange', onHide);

  focusDigit = selected >= 0 ? game.values[selected] : 0;
  render();
  tick();

  if (!tutorialDone()) {
    coaching = true;
    const steps: TutorialStep[] = [
      {
        target: board,
        title: 'Pick a square',
        text: 'Tap any empty square to select it. Its row and column light up. Tap a filled square to highlight every matching number.',
        gesture: 'tap',
      },
      {
        target: pad,
        title: 'Fill it in',
        text: 'Tap a number to place it in the selected square. A wrong number costs a skull — three skulls and the square is lost.',
        gesture: 'tap',
      },
      {
        target: board,
        title: 'Take notes',
        text: 'Long-press a square for the notes wheel, slide toward a number and lift to pencil it in (or out). Faster: just swipe from the square toward the number. Lift without choosing to cancel.',
        gesture: 'hold-slide',
      },
      {
        target: pad.querySelector<HTMLElement>('.key-erase')!,
        title: 'Erase',
        text: 'Clears the selected square — its number or its notes.',
        gesture: 'tap',
      },
      {
        target: undoButton,
        title: 'Undo',
        text: 'Takes back your last move. Mistakes still count, though.',
        gesture: 'tap',
      },
      ...(hintsAllowed
        ? [
            {
              target: hintButton,
              title: 'Hints',
              text: `Casual · Easy only: fills in the next logical square. ${MAX_HINTS} per game, and each one trims your Stardust.`,
              gesture: 'tap' as const,
            },
          ]
        : []),
    ];
    // Wait for the page turnstile to settle so the spotlight lands on the final positions.
    setTimeout(() => {
      void runTutorial(steps).then(() => {
        markTutorialDone();
        coaching = false;
        last = performance.now();
      });
    }, 480);
  }

  return {
    el,
    destroy() {
      save();
      wheel?.close();
      clearInterval(clock);
      clearInterval(autosave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onPressMove, true);
      window.removeEventListener('pointerup', onPressUp, true);
      window.removeEventListener('pointercancel', onPressCancel, true);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}

function statRow(label: string, value: string, valueClass = ''): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { text: label }), h('strong', { class: valueClass, text: value }));
}

/**
 * Count a number up in `target` (ease-out, ~0.7s, after the modal settles).
 * The final text is set immediately for screen readers and reduced motion.
 */
function countUp(target: HTMLElement, from: number, to: number, format: (n: number) => string): void {
  target.textContent = format(to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  target.textContent = format(from);
  const duration = 700;
  let start = 0;
  const step = (now: number) => {
    start ||= now;
    const t = Math.min(1, (now - start) / duration);
    target.textContent = format(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 250);
}
