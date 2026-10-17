import { ICONS } from './icons.ts';
import { h } from './ui.ts';

/**
 * Notes wheel: a frosted-glass ring of nine segments (1 at the top, clockwise)
 * around a hub, opened by a long-press or by swiping off a square. Pointing
 * at a segment fills it with the accent colour; lifting toggles that note,
 * lifting anywhere else cancels. It only exists while the finger is down, so
 * it can't get stuck on screen.
 */

const R_IN = 40; // hub radius
const R_OUT = 104; // ring outer radius
const R_DIGIT = (R_IN + R_OUT) / 2;
const SIZE = R_OUT * 2;
const DEAD_ZONE = 22;
/** Finger travel before the wheel starts picking (a still lift cancels). */
const MOVE_SLOP = 10;
const STEP = 360 / 9;

export interface NotesWheel {
  move(x: number, y: number): void;
  /** Finger lifted: toggle the digit under it (if any) and close. */
  release(x: number, y: number): void;
  close(): void;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (r: number, deg: number) => `${(R_OUT + r * Math.cos(rad(deg))).toFixed(2)} ${(R_OUT + r * Math.sin(rad(deg))).toFixed(2)}`;

/** Annular sector for digit d, in the ring's own 0..SIZE coordinates. */
function segmentPath(d: number): string {
  const mid = -90 + (d - 1) * STEP;
  const a = mid - STEP / 2;
  const b = mid + STEP / 2;
  return `M${point(R_OUT, a)} A${R_OUT} ${R_OUT} 0 0 1 ${point(R_OUT, b)} L${point(R_IN, b)} A${R_IN} ${R_IN} 0 0 0 ${point(R_IN, a)}Z`;
}

const RING_SVG = (() => {
  const dividers = Array.from({ length: 9 }, (_, k) => {
    const deg = -90 - STEP / 2 + k * STEP;
    return `<line x1="${point(R_IN, deg).replace(' ', '" y1="')}" x2="${point(R_OUT, deg).replace(' ', '" y2="')}"/>`;
  }).join('');
  const segments = Array.from({ length: 9 }, (_, i) => `<path class="seg" data-seg="${i + 1}" d="${segmentPath(i + 1)}"/>`).join('');
  return (
    `<svg class="wheel-ring" viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true">` +
    `<g class="segs">${segments}</g>` +
    `<g class="dividers">${dividers}</g>` +
    `<circle class="hub-edge" cx="${R_OUT}" cy="${R_OUT}" r="${R_IN}"/>` +
    `</svg>`
  );
})();

export function openNotesWheel(options: {
  x: number;
  y: number;
  /** Bitmask of notes already in the cell (bit d = digit d). */
  notes: number;
  onToggle(digit: number): void;
  onClose(): void;
}): NotesWheel {
  const margin = R_OUT + 8;
  const cx = Math.min(Math.max(options.x, margin), innerWidth - margin);
  const cy = Math.min(Math.max(options.y, margin), innerHeight - margin);
  let hovered = 0;
  let closed = false;

  const wheel = h(
    'div',
    { class: 'wheel', attrs: { role: 'dialog', 'aria-label': 'Slide toward a number to add or remove a note' } },
    h('div', { class: 'wheel-glass', html: RING_SVG }),
    h('div', { class: 'wheel-hub', html: ICONS.pencil }),
  );
  wheel.style.left = `${cx}px`;
  wheel.style.top = `${cy}px`;
  const segs = [...wheel.querySelectorAll<SVGPathElement>('.seg')];

  const digits: HTMLElement[] = [];
  for (let d = 1; d <= 9; d++) {
    const deg = -90 + (d - 1) * STEP;
    const digit = h('span', {
      class: `wheel-digit${options.notes & (1 << d) ? ' on' : ''}`,
      text: String(d),
      attrs: { 'aria-label': `Note ${d}${options.notes & (1 << d) ? ', set' : ''}` },
    });
    digit.style.setProperty('--x', `${Math.cos(rad(deg)) * R_DIGIT}px`);
    digit.style.setProperty('--y', `${Math.sin(rad(deg)) * R_DIGIT}px`);
    digits[d] = digit;
    wheel.append(digit);
  }

  // Transparent layer that only exists while the finger is down; any other touch closes it.
  const layer = h('div', { class: 'wheel-layer' }, wheel);
  document.body.append(layer);
  navigator.vibrate?.(8);
  layer.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  layer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    close();
  });

  // Near a screen edge the wheel is nudged inward, so the finger starts off its
  // centre. Picking is measured from the wheel's real centre (the segment the
  // finger is over), but only once the finger has actually moved, so a lift
  // without sliding still cancels.
  let moved = false;
  function digitAt(x: number, y: number): number {
    if (!moved) {
      if (Math.hypot(x - options.x, y - options.y) < MOVE_SLOP) return 0;
      moved = true;
    }
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return 0;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return (Math.round((((angle % 360) + 360) % 360) / STEP) % 9) + 1;
  }

  function move(x: number, y: number) {
    if (closed) return;
    const digit = digitAt(x, y);
    if (digit === hovered) return;
    if (hovered) {
      digits[hovered].classList.remove('hover');
      segs[hovered - 1].classList.remove('hover');
    }
    hovered = digit;
    if (!hovered) return;
    digits[hovered].classList.add('hover');
    segs[hovered - 1].classList.add('hover');
    navigator.vibrate?.(5);
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
    setTimeout(() => layer.remove(), 110);
    options.onClose();
  }

  return { move, release, close };
}
