import { h } from './ui.ts';

/**
 * Notes wheel: long-press a cell and a small ring of digits appears around the
 * finger. Slide toward a digit and lift to toggle that note. Lifting without
 * reaching a digit just closes it. There is no "open" state to get stuck in:
 * the wheel only exists while the finger is down.
 */

const RADIUS = 50;
const DEAD_ZONE = 20;
const STEP = 360 / 9;

export interface NotesWheel {
  move(x: number, y: number): void;
  /** Finger lifted: toggle the digit under it (if any) and close. */
  release(x: number, y: number): void;
  close(): void;
}

export function openNotesWheel(options: {
  x: number;
  y: number;
  /** Bitmask of notes already in the cell (bit d = digit d). */
  notes: number;
  onToggle(digit: number): void;
  onClose(): void;
}): NotesWheel {
  const margin = RADIUS + 22;
  const cx = Math.min(Math.max(options.x, margin), innerWidth - margin);
  const cy = Math.min(Math.max(options.y, margin), innerHeight - margin);
  let hovered = 0;
  let closed = false;

  const tiles: HTMLElement[] = [];
  const wheel = h('div', { class: 'wheel', attrs: { role: 'dialog', 'aria-label': 'Slide to a number to add a note' } });
  wheel.style.left = `${cx}px`;
  wheel.style.top = `${cy}px`;
  for (let d = 1; d <= 9; d++) {
    const angle = ((-90 + (d - 1) * STEP) * Math.PI) / 180;
    const tile = h('span', { class: `wheel-digit${options.notes & (1 << d) ? ' on' : ''}`, text: String(d) });
    tile.style.setProperty('--x', `${Math.cos(angle) * RADIUS}px`);
    tile.style.setProperty('--y', `${Math.sin(angle) * RADIUS}px`);
    tile.style.animationDelay = `${(d - 1) * 10}ms`;
    tiles[d] = tile;
    wheel.append(tile);
  }
  // Transparent layer that only exists while the finger is down; any other touch closes it.
  const layer = h('div', { class: 'wheel-layer' }, wheel);
  document.body.append(layer);
  navigator.vibrate?.(10);
  layer.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  layer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    close();
  });

  function digitAt(x: number, y: number): number {
    // Measured from where the finger went down, so it still feels right when
    // the wheel had to be nudged away from a screen edge.
    const dx = x - options.x;
    const dy = y - options.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return 0;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return (Math.round((((angle % 360) + 360) % 360) / STEP) % 9) + 1;
  }

  function move(x: number, y: number) {
    if (closed) return;
    const digit = digitAt(x, y);
    if (digit === hovered) return;
    if (hovered) tiles[hovered].classList.remove('hover');
    hovered = digit;
    if (hovered) {
      tiles[hovered].classList.add('hover');
      navigator.vibrate?.(5);
    }
  }

  function release(x: number, y: number) {
    if (closed) return;
    move(x, y);
    if (hovered) options.onToggle(hovered);
    close();
  }

  function close() {
    if (closed) return;
    closed = true;
    layer.classList.add('closing');
    setTimeout(() => layer.remove(), 140);
    options.onClose();
  }

  return { move, release, close };
}
