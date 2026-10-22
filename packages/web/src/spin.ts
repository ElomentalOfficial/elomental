import { reducedMotion } from './a11y.ts';
import { h } from './ui.ts';

/** How many copies stack behind the face to give the token its edge, and how far apart (px). */
const LAYERS = 3;
const DEPTH = 1;
/** Degrees turned per pixel dragged, and the furthest it turns each way (never edge-on, never its back). */
const PER_PX = 0.6;
const LIMIT = 70;
/** The spring that brings it back face-front when let go: its pull, and how much each swing keeps. */
const PULL = 0.08;
const KEEP = 0.86;

/**
 * A banner's hero icon (pageBanner.ts) as a token you can turn, like Apple's Fitness awards: drag it
 * sideways (mouse or finger) and it turns on its upright axis, showing a slim edge, up to LIMIT
 * each way with more resistance the further it goes; let go and it springs back face-front with a
 * small wobble. Decorative: no role, not in the tab order. Still for Reduce motion.
 */
export function spinnable(src: string): HTMLElement {
  // the light catching the face as it turns: a bright band cut to the icon's own outline
  const shine = h('span', { class: 'spin-shine' });
  shine.style.setProperty('--icon', `url("${src}")`);
  const face = (cls: string) => h('img', { class: `spin-layer ${cls}`, attrs: { src, alt: '', draggable: 'false' } });
  const token = h('span', { class: 'spin-token' },
    ...Array.from({ length: LAYERS }, (_, i) => {
      const layer = face('spin-edge');
      layer.style.transform = `translateZ(${-(i + 1) * DEPTH}px)`;
      return layer;
    }),
    face('spin-face'),
    shine);
  const el = h('span', { class: 'spin', attrs: { 'aria-hidden': 'true' } }, token);

  /** The turn the drag asks for, and the turn shown (eased toward LIMIT, never past it). */
  let pulled = 0;
  let angle = 0;
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let frame = 0;
  const ease = (a: number) => LIMIT * Math.tanh(a / LIMIT);
  const paint = () => {
    token.style.transform = `rotateY(${angle.toFixed(2)}deg)`;
    // the band crosses the face with the turn (from one side to the other, never off it), brightest at
    // the furthest tilt, gone face-on
    shine.style.setProperty('--sweep', `${50 - (angle / LIMIT) * 22}%`);
    shine.style.opacity = String(Math.min(1, Math.abs(angle) / (LIMIT * 0.6)));
  };
  const tick = () => {
    frame = 0;
    if (dragging) return;
    velocity = (velocity - angle * PULL) * KEEP;
    angle = Math.max(-LIMIT, Math.min(LIMIT, angle + velocity));
    if (Math.abs(velocity) < 0.02 && Math.abs(angle) < 0.1) {
      angle = 0;
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
    pulled = angle;
    velocity = 0;
    el.setPointerCapture(event.pointerId);
    el.classList.add('spinning');
  });
  el.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    pulled += (event.clientX - lastX) * PER_PX;
    lastX = event.clientX;
    angle = ease(pulled);
    paint();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('spinning');
    if (!frame) frame = requestAnimationFrame(tick);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  return el;
}
