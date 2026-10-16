/**
 * Windows Phone ("Metro") motion: tiles turnstile in and out, hinged on the
 * left edge of the screen and staggered top-to-bottom, left-to-right, and a
 * press tilts the tile toward the finger.
 */

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const PERSPECTIVE = 'perspective(900px)';
const EASE_OUT = 'cubic-bezier(0.1, 0.9, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.7, 0, 1, 0.5)';

/** Reading order: rows top to bottom, then left to right within a row. */
function inReadingOrder(items: HTMLElement[]): { el: HTMLElement; rect: DOMRect }[] {
  return items
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left);
}

/** Pivot every tile on the same vertical hinge: the left edge of `stage`. */
function hingeOrigin(stage: HTMLElement, rect: DOMRect): string {
  return `${stage.getBoundingClientRect().left - rect.left}px 50%`;
}

/**
 * Tiles swing in on the left hinge, one after another. Forward (arriving
 * fresh) they come from behind the screen, top-left first. Backward
 * (returning from a mode) they come back from the viewer's side, bottom-right
 * first: the exact reverse of how they left.
 */
export function turnstileIn(stage: HTMLElement, items: HTMLElement[], backward = false): void {
  if (reducedMotion()) return;
  const order = inReadingOrder(items);
  if (backward) order.reverse();
  order.forEach(({ el, rect }, i) => {
    el.style.transformOrigin = hingeOrigin(stage, rect);
    el.animate(
      [
        { transform: `${PERSPECTIVE} rotateY(${backward ? -82 : 78}deg)`, opacity: 0 },
        { transform: `${PERSPECTIVE} rotateY(0deg)`, opacity: 1 },
      ],
      { duration: backward ? 440 : 520, delay: 30 + i * (backward ? 45 : 55), easing: EASE_OUT, fill: 'backwards' },
    );
  });
}

/** Tiles swing out toward the viewer; `last` (the tapped tile) goes after the rest. */
export function turnstileOut(stage: HTMLElement, items: HTMLElement[], last?: HTMLElement): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const order = inReadingOrder(items.filter((el) => el !== last));
  if (last) order.push({ el: last, rect: last.getBoundingClientRect() });
  const animations = order.map(({ el, rect }, i) => {
    el.style.transformOrigin = hingeOrigin(stage, rect);
    const isLast = el === last;
    return el.animate(
      [
        { transform: `${PERSPECTIVE} rotateY(0deg)`, opacity: 1 },
        { transform: `${PERSPECTIVE} rotateY(-82deg)`, opacity: 0 },
      ],
      { duration: isLast ? 300 : 230, delay: i * 35 + (isLast ? 70 : 0), easing: EASE_IN, fill: 'forwards' },
    );
  });
  return Promise.all(animations.map((a) => a.finished)).then(() => undefined);
}

/** The press "tilt": the tile dips toward wherever the finger lands. */
export function enableTilt(el: HTMLElement, strength = 11): void {
  const release = () => {
    el.style.transform = '';
  };
  el.addEventListener('pointerdown', (event) => {
    if (reducedMotion()) return;
    const r = el.getBoundingClientRect();
    const dx = (event.clientX - (r.left + r.width / 2)) / r.width; // -0.5 … 0.5
    const dy = (event.clientY - (r.top + r.height / 2)) / r.height;
    // Positive rotateY pushes the right edge away and positive rotateX the top edge,
    // so the side under the finger sinks into the screen.
    el.style.transformOrigin = '50% 50%';
    el.style.transform = `${PERSPECTIVE} rotateX(${(-dy * strength).toFixed(2)}deg) rotateY(${(dx * strength).toFixed(2)}deg) scale(0.97)`;
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(type, release);
}
