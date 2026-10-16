import { h } from './ui.ts';

/**
 * Notes fan: long-press a cell and nine cards fan out from the finger, 1 to 9
 * left to right, like a hand of cards. Slide toward a card and lift to toggle
 * that note; lift anywhere else to cancel. The fan only exists while the
 * finger is down, so it can't get stuck on screen.
 *
 * It opens away from the finger (upward, or downward near the top edge, and
 * angled away from the side edges) so the finger never covers a number.
 */

const CARD_COUNT = 9;
const STEP = 24; // degrees between cards
const SPREAD = STEP * (CARD_COUNT - 1);
const DEAD_ZONE = 26; // px the finger must travel before a card is picked
const PICK_TOLERANCE = STEP * 0.6;
const ROOM = 128; // px needed in the fan's direction (card length + margin)

export interface NotesWheel {
  move(x: number, y: number): void;
  /** Finger lifted: toggle the card under it (if any) and close. */
  release(x: number, y: number): void;
  close(): void;
}

/** Signed difference between two angles, in (-180, 180]. */
const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180;

export function openNotesWheel(options: {
  x: number;
  y: number;
  /** Bitmask of notes already in the cell (bit d = digit d). */
  notes: number;
  onToggle(digit: number): void;
  onClose(): void;
}): NotesWheel {
  // Fan direction: 0° = up, clockwise.
  const downward = options.y < ROOM + 20;
  let center = downward ? 180 : 0;
  if (options.x < ROOM * 0.8) center += downward ? -45 : 45;
  else if (options.x > innerWidth - ROOM * 0.8) center += downward ? 45 : -45;
  // Keep 1→9 reading left to right whichever way the fan opens.
  const cardAngle = (d: number) =>
    downward ? center + SPREAD / 2 - (d - 1) * STEP : center - SPREAD / 2 + (d - 1) * STEP;

  let hovered = 0;
  let closed = false;

  const cards: HTMLElement[] = [];
  const fan = h('div', {
    class: 'fan',
    attrs: { role: 'dialog', 'aria-label': 'Slide to a number to add or remove a note' },
  });
  fan.style.left = `${options.x}px`;
  fan.style.top = `${options.y}px`;
  for (let d = 1; d <= CARD_COUNT; d++) {
    const angle = cardAngle(d);
    const card = h(
      'span',
      { class: `fan-card${options.notes & (1 << d) ? ' on' : ''}`, attrs: { 'aria-label': `Note ${d}` } },
      h('span', { class: 'fan-digit', text: String(d) }),
    );
    card.style.setProperty('--angle', `${angle}deg`);
    card.style.setProperty('--from', `${center}deg`);
    card.style.animationDelay = `${(d - 1) * 14}ms`;
    cards[d] = card;
    fan.append(card);
  }
  // Transparent layer that only exists while the finger is down; any other touch closes it.
  const layer = h('div', { class: 'fan-layer' }, fan);
  document.body.append(layer);
  navigator.vibrate?.(10);
  layer.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  layer.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    close();
  });

  function cardAt(x: number, y: number): number {
    const dx = x - options.x;
    const dy = y - options.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return 0;
    const direction = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0° up, clockwise
    let best = 0;
    let bestDiff = Infinity;
    for (let d = 1; d <= CARD_COUNT; d++) {
      const diff = Math.abs(angleDiff(direction, cardAngle(d)));
      if (diff < bestDiff) {
        best = d;
        bestDiff = diff;
      }
    }
    return bestDiff <= PICK_TOLERANCE ? best : 0;
  }

  function move(x: number, y: number) {
    if (closed) return;
    const digit = cardAt(x, y);
    if (digit === hovered) return;
    if (hovered) cards[hovered].classList.remove('hover');
    hovered = digit;
    if (hovered) {
      cards[hovered].classList.add('hover');
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
    setTimeout(() => layer.remove(), 160);
    options.onClose();
  }

  return { move, release, close };
}
