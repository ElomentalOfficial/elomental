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
  /** Switch to tap mode (digits tappable, tap outside closes). */
  hold(): void;
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
  // A visible way out, in addition to tapping outside.
  wheel.append(h('div', { class: 'wheel-hint', text: 'tap outside to close' }));
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
  // Same as the board: keep iOS's own long-press and selection out of the wheel.
  backdrop.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });

  // Any new touch on the overlay is a tap: the opening finger went down before the
  // overlay existed, so it can never land here. Tapping a digit toggles it, tapping
  // anywhere else closes, whatever state the wheel thinks it is in. That way a lost
  // lift event can never leave the wheel stuck on screen.
  backdrop.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    hold();
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
      hold();
    } else {
      close();
    }
  }

  function hold() {
    if (closed) return;
    if (hovered) bubbles[hovered].classList.remove('hover');
    hovered = 0;
    backdrop.classList.add('tap-mode');
  }

  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 120);
    options.onClose();
  }

  return { move, release, hold, close };
}
