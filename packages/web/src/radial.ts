import { h } from './ui.ts';

/**
 * Notes wheel: long-press a cell and the digits 1-9 fan out around the finger.
 * Slide toward a digit and lift to toggle that note. Lifting without sliding
 * leaves the wheel open so digits can be tapped instead (easier for some
 * players, and how it works with a mouse).
 */

const RADIUS = 78;
const BUBBLE = 46;
const DEAD_ZONE = 24;
const STEP = 360 / 9;

export interface NotesWheel {
  move(x: number, y: number): void;
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
  const margin = RADIUS + BUBBLE / 2 + 8;
  const cx = Math.min(Math.max(options.x, margin), innerWidth - margin);
  const cy = Math.min(Math.max(options.y, margin), innerHeight - margin);
  let hovered = 0;
  let moved = false;
  let closed = false;

  const bubbles: HTMLElement[] = [];
  const wheel = h('div', { class: 'wheel', attrs: { role: 'dialog', 'aria-label': 'Add a note' } });
  wheel.style.left = `${cx}px`;
  wheel.style.top = `${cy}px`;
  wheel.append(h('div', { class: 'wheel-hub', text: 'note' }));
  for (let d = 1; d <= 9; d++) {
    const angle = ((-90 + (d - 1) * STEP) * Math.PI) / 180;
    const bubble = h('button', {
      class: `wheel-digit${options.notes & (1 << d) ? ' on' : ''}`,
      text: String(d),
      attrs: { 'aria-label': `Toggle note ${d}`, 'data-digit': String(d) },
    });
    bubble.style.setProperty('--x', `${Math.cos(angle) * RADIUS}px`);
    bubble.style.setProperty('--y', `${Math.sin(angle) * RADIUS}px`);
    bubble.style.animationDelay = `${(d - 1) * 12}ms`;
    bubbles[d] = bubble;
    wheel.append(bubble);
  }
  const backdrop = h('div', { class: 'wheel-backdrop' }, wheel);
  document.body.append(backdrop);
  navigator.vibrate?.(12);

  // Tap mode: after a lift without a pick, digits are tappable and a tap outside closes.
  backdrop.addEventListener('pointerdown', (event) => {
    if (!backdrop.classList.contains('tap-mode')) return;
    event.preventDefault();
    const digit = (event.target as HTMLElement).closest<HTMLElement>('[data-digit]')?.dataset.digit;
    if (digit) {
      const d = Number(digit);
      options.onToggle(d);
      bubbles[d].classList.toggle('on');
      navigator.vibrate?.(8);
    } else close();
  });

  function digitAt(x: number, y: number): number {
    // Direction is measured from where the finger went down, so it still feels
    // right when the wheel had to be nudged away from a screen edge.
    const dx = x - options.x;
    const dy = y - options.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return 0;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return (Math.round((((angle % 360) + 360) % 360) / STEP) % 9) + 1;
  }

  function move(x: number, y: number) {
    if (closed) return;
    const digit = digitAt(x, y);
    if (digit) moved = true;
    if (digit === hovered) return;
    if (hovered) bubbles[hovered].classList.remove('hover');
    hovered = digit;
    if (hovered) {
      bubbles[hovered].classList.add('hover');
      navigator.vibrate?.(5);
    }
  }

  function release(x: number, y: number) {
    if (closed) return;
    move(x, y);
    if (hovered) {
      options.onToggle(hovered);
      close();
    } else if (!moved) {
      backdrop.classList.add('tap-mode');
    } else {
      close();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 120);
    options.onClose();
  }

  return { move, release, close };
}
