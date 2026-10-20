import { openNotesWheel, type NotesWheel } from '../radial.ts';

/** Hold this long to open the notes wheel; quick taps stay well under it. */
const LONG_PRESS_MS = 230;
/** Or drag this far from the square to open it immediately (swipe-to-note). */
const SWIPE_START = 14;

export interface BoardGestures {
  /** The notes wheel is open (it takes the keyboard's Esc). */
  wheelOpen: () => boolean;
  closeWheel: () => void;
  /** Closes the wheel and lets go of the window listeners. */
  destroy: () => void;
}

/**
 * The board's pointer gestures (game.ts): a tap selects a square; a long-press, a drag off an
 * empty square or a right-click opens the notes wheel on it (radial.ts), unless the wheel is
 * off in Setup. Keyboard selection stays in game.ts.
 */
export function boardGestures(opts: {
  board: HTMLElement;
  cells: HTMLElement[];
  useWheel: boolean;
  select: (cell: number) => void;
  /** The square takes notes now (empty, not a given, the game running). */
  canNote: (cell: number) => boolean;
  notes: (cell: number) => number;
  toggleNote: (cell: number, digit: number) => void;
}): BoardGestures {
  const { board, cells } = opts;
  let press: { id: number; x: number; y: number; cell: number; timer: number } | null = null;
  let wheel: NotesWheel | null = null;

  const cellFrom = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>('[data-cell]');

  function openWheel(cell: number, x: number, y: number) {
    // No extra cue on the cell or the keypad: the open wheel already shows it's notes.
    endPressFeedback();
    wheel = openNotesWheel({
      x,
      y,
      notes: opts.notes(cell),
      onToggle: (digit) => opts.toggleNote(cell, digit),
      onClose: () => {
        wheel = null;
      },
    });
  }

  board.addEventListener('pointerdown', (event) => {
    const target = cellFrom(event.target);
    if (!target) return;
    wheel?.close(); // never let a half-finished wheel block the board
    event.preventDefault();
    const cell = Number(target.dataset.cell);
    opts.select(cell);
    if (!opts.useWheel || !opts.canNote(cell)) return;
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

  return {
    wheelOpen: () => wheel !== null,
    closeWheel: () => wheel?.close(),
    destroy: () => {
      wheel?.close();
      window.removeEventListener('pointermove', onPressMove, true);
      window.removeEventListener('pointerup', onPressUp, true);
      window.removeEventListener('pointercancel', onPressCancel, true);
    },
  };
}
