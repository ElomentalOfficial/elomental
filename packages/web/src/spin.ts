import { reducedMotion } from './a11y.ts';
import { h } from './ui.ts';

/** How many copies stack behind the face to give the token its edge, and how far apart (px). */
const LAYERS = 7;
const DEPTH = 1.6;
/** Degrees turned per pixel dragged. */
const PER_PX = 0.9;
/** How fast a fling slows down each frame, and how strongly the token settles face-front. */
const FRICTION = 0.955;
const SETTLE = 0.06;

/**
 * A banner's hero icon (pageBanner.ts) as a token you can spin, like Apple's Fitness awards: drag
 * it sideways (mouse or finger) and it turns on its upright axis, showing an edge as it goes; let
 * go and it carries on with the fling, slows, and settles face-front. Decorative: no role, not in
 * the tab order. Still for Reduce motion.
 */
export function spinnable(src: string): HTMLElement {
  const face = (cls: string) => h('img', { class: `spin-layer ${cls}`, attrs: { src, alt: '', draggable: 'false' } });
  const token = h('span', { class: 'spin-token' },
    ...Array.from({ length: LAYERS }, (_, i) => {
      const layer = face('spin-edge');
      layer.style.transform = `translateZ(${-(i + 1) * DEPTH}px)`;
      return layer;
    }),
    face('spin-back'),
    face('spin-face'));
  const el = h('span', { class: 'spin', attrs: { 'aria-hidden': 'true' } }, token);

  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let frame = 0;
  const paint = () => (token.style.transform = `rotateY(${angle}deg)`);
  const tick = () => {
    frame = 0;
    if (dragging) return;
    velocity *= FRICTION;
    // once the fling has slowed, it is drawn to the nearest face-front turn
    const home = Math.round(angle / 360) * 360;
    if (Math.abs(velocity) < 6) velocity += (home - angle) * SETTLE;
    angle += velocity;
    if (Math.abs(velocity) < 0.05 && Math.abs(home - angle) < 0.3) {
      angle = 0;
      velocity = 0;
      paint();
      return;
    }
    paint();
    frame = requestAnimationFrame(tick);
  };
  el.addEventListener('pointerdown', (event) => {
    if (reducedMotion()) return;
    dragging = true;
    lastX = event.clientX;
    lastT = performance.now();
    velocity = 0;
    el.setPointerCapture(event.pointerId);
    el.classList.add('spinning');
  });
  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const now = performance.now();
    const turn = (event.clientX - lastX) * PER_PX;
    angle += turn;
    // degrees per frame (16ms), from this move
    velocity = (turn / Math.max(1, now - lastT)) * 16;
    lastX = event.clientX;
    lastT = now;
    paint();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('spinning');
    // a pause before letting go is no fling
    if (performance.now() - lastT > 80) velocity = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  return el;
}
