import { h } from './ui.ts';

/**
 * Notes wheel: long-press a cell and a frosted-glass disc appears with the
 * digits 1-9 around its edge (1 at the top, clockwise). Slide toward a digit:
 * a liquid drop is pulled out of the centre and stretches onto it. Lift to
 * toggle that note; lift without reaching a digit to cancel. The wheel only
 * exists while the finger is down, so it can't get stuck on screen.
 *
 * The liquid is three accent shapes (a centre blob, a neck and a tip) moved
 * with springy transitions. No SVG filters, which are unreliable on iOS.
 */

const RADIUS = 74; // centre to digit
const DISC = 2 * RADIUS + 54; // glass diameter
const DEAD_ZONE = 24;
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
  const margin = DISC / 2 + 8;
  const cx = Math.min(Math.max(options.x, margin), innerWidth - margin);
  const cy = Math.min(Math.max(options.y, margin), innerHeight - margin);
  let hovered = 0;
  let closed = false;

  const digits: HTMLElement[] = [];
  const glass = h('div', { class: 'wheel-glass' });
  const neck = h('div', { class: 'liquid-neck' });
  const tip = h('div', { class: 'liquid-tip' });
  const hub = h('div', { class: 'liquid-hub' });
  const wheel = h(
    'div',
    { class: 'wheel', attrs: { role: 'dialog', 'aria-label': 'Slide toward a number to add or remove a note' } },
    glass,
    neck,
    hub,
    tip,
  );
  wheel.style.left = `${cx}px`;
  wheel.style.top = `${cy}px`;
  wheel.style.setProperty('--disc', `${DISC}px`);
  for (let d = 1; d <= 9; d++) {
    const angle = ((-90 + (d - 1) * STEP) * Math.PI) / 180;
    const digit = h('span', {
      class: `wheel-digit${options.notes & (1 << d) ? ' on' : ''}`,
      text: String(d),
      attrs: { 'aria-label': `Note ${d}` },
    });
    digit.style.setProperty('--x', `${Math.cos(angle) * RADIUS}px`);
    digit.style.setProperty('--y', `${Math.sin(angle) * RADIUS}px`);
    digit.style.animationDelay = `${40 + (d - 1) * 12}ms`;
    digits[d] = digit;
    wheel.append(digit);
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

  let lastDeg = -90;
  /** Pull the liquid toward digit `d` (0 = settle back into the centre). */
  function pour(d: number) {
    if (!d) {
      wheel.classList.remove('pouring');
      return;
    }
    // Keep the angle continuous (9 → 1 turns 40°, not 320°) so the neck swings the short way.
    let deg = -90 + (d - 1) * STEP;
    while (deg - lastDeg > 180) deg -= 360;
    while (deg - lastDeg < -180) deg += 360;
    lastDeg = deg;
    const rad = (deg * Math.PI) / 180;
    wheel.style.setProperty('--angle', `${deg}deg`);
    wheel.style.setProperty('--tip-x', `${Math.cos(rad) * RADIUS}px`);
    wheel.style.setProperty('--tip-y', `${Math.sin(rad) * RADIUS}px`);
    // The glass leans a little toward the drop, like a surface under tension.
    wheel.style.setProperty('--lean-x', `${Math.cos(rad) * 5}px`);
    wheel.style.setProperty('--lean-y', `${Math.sin(rad) * 5}px`);
    wheel.classList.add('pouring');
  }

  function move(x: number, y: number) {
    if (closed) return;
    const digit = digitAt(x, y);
    if (digit === hovered) return;
    if (hovered) digits[hovered].classList.remove('hover');
    hovered = digit;
    pour(digit);
    if (hovered) {
      digits[hovered].classList.add('hover');
      navigator.vibrate?.(6);
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
    setTimeout(() => layer.remove(), 180);
    options.onClose();
  }

  return { move, release, close };
}
