import { BOXES, BOX_OF, COL_OF, PEERS, ROW_OF, type Difficulty } from '@elomental/engine';
import { ICONS } from '../icons.ts';
import { RANKED_TIME_MS, recordResult, type Mode, type Outcome } from '../profile.ts';
import { requestPuzzle } from '../puzzles.ts';
import { readJson, removeKey, writeJson } from '../storage.ts';
import { formatTime, h, mount, openModal, toast, type Screen } from '../ui.ts';
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
  timeLimitMs?: number;
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
  elapsedMs: number;
  /** Wall-clock start; ranked time keeps running even while the tab is hidden. */
  startedAt: number;
  history: Change[][];
}

const SAVE_KEY = 'elomental:game';
const MAX_MISTAKES = 3;

export const loadSavedGame = (): SavedGame | null => readJson<SavedGame>(SAVE_KEY);

export async function startGame(options: { mode: Mode; difficulty: Difficulty; seed?: string; dateKey?: string }) {
  mount(loadingScreen());
  try {
    const p = await requestPuzzle({ difficulty: options.difficulty, seed: options.seed });
    const config: GameConfig = {
      mode: options.mode,
      difficulty: options.difficulty,
      puzzle: p.puzzle,
      solution: p.solution,
      rating: p.rating,
      seed: p.seed,
      dateKey: options.dateKey,
      timeLimitMs: options.mode === 'ranked' ? RANKED_TIME_MS[options.difficulty] : undefined,
    };
    const game: SavedGame = {
      config,
      values: [...p.puzzle].map(Number),
      notes: new Array(81).fill(0),
      mistakes: 0,
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
    el: h(
      'div',
      { class: 'screen loading' },
      h('div', { class: 'loader rough' }),
      h('p', { class: 'sc', text: 'Forging your square…' }),
    ),
  };
}

const MODE_LABEL: Record<Mode, string> = { casual: 'Casual', daily: 'Daily Square', ranked: 'Ranked' };

function gameScreen(game: SavedGame): Screen {
  const { config } = game;
  const ranked = config.mode === 'ranked';
  const given = [...config.puzzle].map((ch) => ch !== '0');
  const solution = [...config.solution].map(Number);

  let selected = given.indexOf(false);
  let notesMode = false;
  let paused = false;
  let finished = false;

  // --- Top bar -------------------------------------------------------------
  const leftButton = h('button', { class: 'bar-btn rough-wide sc', text: ranked ? 'Concede' : 'Home' });
  const timer = h('div', { class: 'timer' });
  const pauseButton = h('button', { class: 'icon-btn rough', html: ICONS.pause, attrs: { 'aria-label': 'Pause' } });
  const rightSlot = ranked
    ? h('div', { class: 'ranked-chip sc', html: `${ICONS.sword}<span>Ranked</span>` })
    : pauseButton;

  // --- Status row ----------------------------------------------------------
  const strikes = Array.from({ length: MAX_MISTAKES }, () => h('span', { class: 'strike', html: ICONS.close }));
  const status = h(
    'div',
    { class: 'status' },
    h('div', { class: 'mistakes' }, h('span', { class: 'sc', text: 'Mistake' }), ...strikes),
    h('div', {
      class: 'puzzle-info sc',
      text: `${MODE_LABEL[config.mode]} · ${config.mode === 'daily' ? 'Medium' : config.difficulty}`,
    }),
  );

  // --- Board ---------------------------------------------------------------
  const cells: HTMLElement[] = [];
  const board = h('div', { class: 'board', attrs: { role: 'grid', 'aria-label': 'Sudoku board' } });
  for (let b = 0; b < 9; b++) {
    const box = h('div', { class: 'box' });
    for (const c of BOXES[b]) {
      const cell = h('div', { class: `cell rough v${((c * 7 + b) % 4) + 1}`, attrs: { 'data-cell': String(c) } });
      cells[c] = cell;
      box.append(cell);
    }
    board.append(box);
  }
  const pauseCover = h(
    'button',
    { class: 'pause-cover sc', onclick: () => setPaused(false) },
    h('span', { class: 'play-badge', html: ICONS.play }),
    'Paused',
  );
  const boardWrap = h('div', { class: 'board-wrap' }, board, pauseCover);

  // --- Tools and number pad ------------------------------------------------
  const notesButton = h('button', { class: 'tool rough-wide sc', html: `${ICONS.pencil}<span>Notes</span>` });
  const undoButton = h('button', { class: 'tool rough-wide sc', html: `${ICONS.undo}<span>Undo</span>` });
  const tools = h('div', { class: 'tools' }, notesButton, undoButton);

  const keys: HTMLElement[] = [];
  const pad = h('div', { class: 'pad rough' });
  for (let d = 1; d <= 9; d++) {
    const key = h('button', { class: `key rough v${(d % 4) + 1}`, text: String(d), attrs: { 'data-digit': String(d) } });
    keys[d] = key;
    pad.append(key);
  }
  pad.append(h('button', { class: 'key key-erase rough v2', html: ICONS.close, attrs: { 'data-digit': '0', 'aria-label': 'Erase' } }));

  const el = h(
    'div',
    { class: `screen game mode-${config.mode}` },
    h('div', { class: 'topbar' }, leftButton, timer, rightSlot),
    status,
    boardWrap,
    tools,
    pad,
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

  function input(digit: number) {
    if (finished || paused || selected < 0 || given[selected]) return;
    if (digit === 0) return erase();
    const cell = selected;

    if (notesMode) {
      if (game.values[cell]) return;
      commit([{ cell, value: 0, notes: game.notes[cell] ^ (1 << digit) }]);
    } else {
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
      if (!correct) {
        game.mistakes++;
        navigator.vibrate?.(40);
        cells[cell].classList.remove('shake');
        void cells[cell].offsetWidth;
        cells[cell].classList.add('shake');
      }
    }
    render();
    save();
    if (game.values.every((v, c) => v === solution[c])) finish(true, 'solved');
    else if (game.mistakes >= MAX_MISTAKES) finish(false, 'mistakes');
  }

  function erase() {
    if (given[selected] || (!game.values[selected] && !game.notes[selected])) return;
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

  function select(cell: number) {
    if (finished || paused) return;
    selected = cell;
    render();
  }

  function setPaused(value: boolean) {
    if (ranked || finished) return;
    paused = value;
    el.classList.toggle('paused', paused);
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    tick();
  }

  // --- Rendering -----------------------------------------------------------
  function render() {
    const selectedValue = selected >= 0 ? game.values[selected] : 0;
    for (let c = 0; c < 81; c++) {
      const value = game.values[c];
      const cell = cells[c];
      const related =
        selected >= 0 &&
        c !== selected &&
        (ROW_OF[c] === ROW_OF[selected] || COL_OF[c] === COL_OF[selected] || BOX_OF[c] === BOX_OF[selected]);
      cell.classList.toggle('given', given[c]);
      cell.classList.toggle('filled', !given[c] && value > 0);
      cell.classList.toggle('wrong', !given[c] && value > 0 && value !== solution[c]);
      cell.classList.toggle('selected', c === selected);
      cell.classList.toggle('peer', related);
      cell.classList.toggle('same', c !== selected && selectedValue > 0 && value === selectedValue);

      const key = value ? `v${value}` : game.notes[c] ? `n${game.notes[c]}` : '';
      if (cell.dataset.k === key) continue;
      cell.dataset.k = key;
      if (value) cell.textContent = String(value);
      else if (game.notes[c]) {
        cell.replaceChildren(
          h(
            'div',
            { class: 'notes' },
            ...Array.from({ length: 9 }, (_, i) => h('span', { text: game.notes[c] & (1 << (i + 1)) ? String(i + 1) : '' })),
          ),
        );
      } else cell.textContent = '';
    }

    strikes.forEach((s, i) => s.classList.toggle('used', i < game.mistakes));
    for (let d = 1; d <= 9; d++) {
      let placed = 0;
      for (let c = 0; c < 81; c++) if (game.values[c] === d && solution[c] === d) placed++;
      keys[d].classList.toggle('done', placed === 9);
    }
    notesButton.classList.toggle('on', notesMode);
  }

  // --- Clock ---------------------------------------------------------------
  let last = performance.now();
  function tick() {
    const now = performance.now();
    if (ranked) {
      game.elapsedMs = Date.now() - game.startedAt;
    } else if (!paused && !finished && !document.hidden) {
      // Cap the step so a sleeping phone doesn't add the whole nap to the clock.
      game.elapsedMs += Math.min(now - last, 1000);
    }
    last = now;
    if (ranked && config.timeLimitMs) {
      const left = config.timeLimitMs - game.elapsedMs;
      timer.textContent = formatTime(left);
      timer.classList.toggle('urgent', left < 60_000);
      if (left <= 0 && !finished) finish(false, 'time');
    } else {
      timer.textContent = formatTime(game.elapsedMs);
    }
  }
  const clock = setInterval(tick, 250);
  const autosave = setInterval(save, 2000);

  // --- Finish --------------------------------------------------------------
  function finish(won: boolean, reason: 'solved' | 'mistakes' | 'time' | 'concede') {
    if (finished) return;
    finished = true;
    tick();
    removeKey(SAVE_KEY);
    selected = -1;
    render();
    el.classList.add(won ? 'won' : 'lost');
    const outcome = recordResult({
      mode: config.mode,
      difficulty: config.difficulty,
      rating: config.rating,
      dateKey: config.dateKey,
      won,
      mistakes: game.mistakes,
    });
    setTimeout(() => showResult(won, reason, outcome), won ? 650 : 350);
  }

  function showResult(won: boolean, reason: string, outcome: Outcome) {
    const titles: Record<string, string> = {
      solved: 'Square Complete',
      mistakes: 'Three Strikes',
      time: "Time's Up",
      concede: 'Conceded',
    };
    const rows: (HTMLElement | null)[] = [
      statRow('Time', formatTime(game.elapsedMs)),
      statRow('Mistakes', `${game.mistakes} / ${MAX_MISTAKES}`),
    ];
    if (outcome.elo) {
      const delta = outcome.elo.after - outcome.elo.before;
      rows.push(
        statRow(
          'Elo',
          `${outcome.elo.before} → ${outcome.elo.after} (${delta >= 0 ? '+' : ''}${delta})`,
          delta > 0 ? 'gold' : '',
        ),
      );
      if (outcome.elo.protectedLoss) rows.push(h('p', { class: 'note', text: 'Below 500 Elo your rating is protected — no points lost.' }));
    }
    if (outcome.daily) {
      rows.push(statRow('This month', `${outcome.daily.done} / ${outcome.daily.days} squares`));
      if (outcome.daily.monthComplete) rows.push(h('p', { class: 'note gold', text: 'Month complete — avatar unlocked!' }));
    }

    const rewards = h('div', { class: 'rewards' });
    if (outcome.dust) rewards.append(h('div', { class: 'reward', html: `${ICONS.dust}<span>+${outcome.dust} Dust Stones</span>` }));
    if (outcome.crown) rewards.append(h('div', { class: 'reward rare', html: `${ICONS.crown}<span>Rare drop: Rusted Crown!</span>` }));

    const again =
      config.mode === 'daily'
        ? h('button', { class: 'btn btn-light rough-wide sc', text: 'Calendar', onclick: () => mount(dailyScreen()) })
        : h('button', {
            class: 'btn btn-light rough-wide sc',
            text: ranked ? 'Next match' : 'New square',
            onclick: () => void startGame({ mode: config.mode, difficulty: config.difficulty }),
          });

    openModal(
      h(
        'div',
        { class: 'result' },
        h('h2', { class: `sc ${won ? 'gold' : ''}`, text: titles[reason] }),
        h('div', { class: 'stats' }, ...rows),
        rewards.childElementCount ? rewards : null,
        h(
          'div',
          { class: 'actions' },
          again,
          h('button', { class: 'btn btn-dark rough-wide sc', text: 'Home', onclick: () => mount(homeScreen()) }),
        ),
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
            class: 'btn btn-gold rough-wide sc',
            text: 'Concede',
            onclick: () => {
              close();
              finish(false, 'concede');
            },
          }),
          h('button', { class: 'btn btn-dark rough-wide sc', text: 'Keep playing', onclick: () => close() }),
        ),
      ),
    );
  }

  // --- Events --------------------------------------------------------------
  // pointerdown instead of click: instant response and no 300 ms tap delay.
  board.addEventListener('pointerdown', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!cell) return;
    event.preventDefault();
    select(Number(cell.dataset.cell));
  });
  pad.addEventListener('pointerdown', (event) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-digit]');
    if (!key) return;
    event.preventDefault();
    input(Number(key.dataset.digit));
  });
  notesButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    notesMode = !notesMode;
    render();
  });
  undoButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    undo();
  });
  pauseButton.addEventListener('click', () => setPaused(!paused));
  leftButton.addEventListener('click', () => {
    if (finished) return mount(homeScreen());
    if (ranked) return concede();
    save();
    mount(config.mode === 'daily' ? dailyScreen() : homeScreen());
  });

  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (/^[1-9]$/.test(event.key)) input(Number(event.key));
    else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') input(0);
    else if (event.key === 'n' || event.key === 'N') {
      notesMode = !notesMode;
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') undo();
    else if (event.key.startsWith('Arrow') && selected >= 0) {
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

  render();
  tick();

  return {
    el,
    destroy() {
      save();
      clearInterval(clock);
      clearInterval(autosave);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    },
  };
}

function statRow(label: string, value: string, valueClass = ''): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'sc', text: label }), h('strong', { class: valueClass, text: value }));
}
