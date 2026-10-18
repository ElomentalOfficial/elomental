import { RIBBON_PATH as RIBBON } from './ribbon.ts';

/**
 * The welcome ribbon peeling away like a piece of fabric.
 *
 * The ribbon is drawn once into an offscreen canvas (front with its letters,
 * a darker back, and a black silhouette for shading). Each frame it is
 * re-drawn row by row: a fold line travels up from the bottom edge, the
 * cloth below it wraps over a soft roll that grows as it lifts, and once
 * past the roll it continues upward showing its back. Every row gets its own
 * perspective scale, light and a little sideways ripple, so the whole sheet
 * bends continuously instead of moving as one rigid piece.
 */

const RIBBON_TOP = 0;
const RIBBON_BOTTOM = 740;
/** The ribbon's colour is the theme's accent (Lava in dark, Crimson in light), as on the static splash. */
const front = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#a85b37';
/** Its back: the same colour, about 28% darker. */
function darker(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return '#7f4227';
  return '#' + [0, 2, 4].map((i) => Math.round(parseInt(m[1].slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
}
const LETTERS = [
  ['E', 134, 278], ['L', 195, 278], ['O', 256, 278],
  ['M', 134, 353], ['E', 195, 353], ['N', 256, 353],
  ['T', 134, 428], ['A', 195, 428], ['L', 256, 428],
] as const;

const DURATION_MS = 1100;
/** Time curve exponent: >1 starts slow and finishes fast (2.6 = strongly). */
const ACCELERATION = 2.6;
/** How much larger the cloth grows by the end of the peel (0.55 = 55%). */
const EXPAND = 0.55;
/** Source rows per slice (device pixels); small enough to look continuous. */
const SLICE = 2;
/** Distance from the eye to the screen, in CSS pixels. */
const PERSPECTIVE = 1100;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function ribbonCanvas(width: number, height: number, scale: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  paint(ctx);
  return canvas;
}

/** Sets up the cloth canvas over the page for the given welcome SVG. */
export function createPeel(art: SVGSVGElement): { canvas: HTMLCanvasElement; draw(t: number, now: number): void } {
  const box = art.getBoundingClientRect();
  // The SVG is laid out "xMidYMin meet": 390 units across its width, top aligned.
  const unit = Math.min(box.width / 390, box.height / 844);
  const originX = box.left + (box.width - 390 * unit) / 2;
  const originY = box.top;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const k = unit * dpr; // ribbon units -> device pixels

  // Source images, cropped to the ribbon's height.
  const srcW = 390 * k;
  const srcH = (RIBBON_BOTTOM - RIBBON_TOP) * k;
  const path = new Path2D(RIBBON);
  const colour = front();
  const frontFace = ribbonCanvas(srcW, srcH, k, (ctx) => {
    ctx.fillStyle = colour;
    ctx.fill(path);
    ctx.fillStyle = '#ffffe5';
    ctx.font = '400 62px Federo, Georgia, serif';
    ctx.textAlign = 'center';
    for (const [ch, x, y] of LETTERS) ctx.fillText(ch, x, y);
  });
  const back = ribbonCanvas(srcW, srcH, k, (ctx) => {
    ctx.fillStyle = darker(colour);
    ctx.fill(path);
  });
  const shade = ribbonCanvas(srcW, srcH, k, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fill(path);
  });

  const canvas = document.createElement('canvas');
  canvas.className = 'fabric';
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;

  // Everything below works in device pixels on the screen canvas.
  const left = originX * dpr;
  const top = (originY + RIBBON_TOP * unit) * dpr;
  const length = srcH; // ribbon length along the cloth
  const vx = canvas.width / 2; // vanishing point: centre of the screen
  const vy = canvas.height / 2;
  const eye = PERSPECTIVE * dpr;

  /** Draws the cloth at progress t (0..1); `now` (ms) drives the ripple. */
  const draw = (t: number, now: number) => {
      // Time runs slow at first and races at the end: the cloth eases off the
      // page, then whips away.
      const p = t ** ACCELERATION;
      // The fold travels from the bottom edge to just past the top, the roll
      // widening as it goes (cloth billows rather than creasing)...
      const e = Math.min(1, p / 0.75);
      const fold = length * (1 - 1.08 * e);
      const radius = (36 + 110 * e) * dpr;
      // ...then the whole sheet is thrown up and away.
      const away = Math.max(0, (p - 0.5) / 0.5) ** 1.4;
      const liftY = -away * canvas.height * 1.2;
      const liftZ = away * 160 * dpr;
      // Starting at its own size, the cloth expands as it flips up and away.
      const grow = 1 + EXPAND * p;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let s = 0; s < length; s += SLICE) {
        const h = Math.min(SLICE, length - s);
        // Position of this row of cloth: flat above the fold, wrapped on the roll, then flipped up.
        const place = (row: number) => {
          const past = row - fold;
          if (past <= 0) return { y: row, z: 0, angle: 0 };
          const arc = Math.PI * radius;
          if (past < arc) {
            const angle = past / radius;
            return { y: fold + radius * Math.sin(angle), z: radius * (1 - Math.cos(angle)), angle };
          }
          // Past the roll the free cloth keeps bending, on a wider arc that
          // carries it up and back away from the player (an S-curve, not a board).
          const extra = past - arc;
          const wide = radius * 3.2;
          const phi = Math.min(extra / wide, Math.PI / 2);
          const straight = Math.max(0, extra - wide * (Math.PI / 2));
          return {
            y: fold - wide * Math.sin(phi) - straight,
            z: Math.max(0, 2 * radius - wide * (1 - Math.cos(phi))),
            angle: Math.PI + phi,
          };
        };
        const a = place(s);
        const b = place(s + h);
        const facingAway = a.angle > Math.PI / 2;

        // Perspective: rows lifted toward the eye grow and spread from the centre.
        const scale = (eye / (eye - a.z - liftZ)) * grow;
        const yTop = vy + (top + a.y + liftY - vy) * scale;
        const yBottom = vy + (top + b.y + liftY - vy) * (eye / (eye - b.z - liftZ)) * grow;
        const destY = Math.min(yTop, yBottom);
        // Rows overlap by a pixel so no hairline of the page shows between them.
        const destH = Math.abs(yBottom - yTop) + dpr;

        // Cloth: the lifted part ripples sideways and breathes in width, in a
        // wave that travels along the sheet.
        const lifted = smoothstep(fold - 80 * dpr, fold + 60 * dpr, s);
        const phase = s / (46 * dpr) - now / 140;
        // Two overlapping waves, stronger on the free (flipped) part, read as cloth rather than a sine.
        const free = smoothstep(fold + Math.PI * radius, fold + Math.PI * radius + 160 * dpr, s);
        const sway = (Math.sin(phase) * 8 + Math.sin(phase * 1.9 + 0.8) * 5 * free) * dpr * lifted * (0.35 + e);
        const breathe = 1 + Math.sin(phase * 0.7 + 1.3) * 0.025 * lifted;
        const destW = srcW * scale * breathe;
        const destX = vx + (left - vx) * scale + sway - (destW - srcW * scale) / 2;

        ctx.globalAlpha = 1;
        ctx.drawImage(facingAway ? back : frontFace, 0, s, srcW, h, destX, destY, destW, destH);
        // Light: darker where the cloth turns away, a soft highlight on the crest of the roll.
        // The underside is lit near the roll and falls into shade further from it.
        const beyond = Math.max(0, s - fold - Math.PI * radius);
        const darkness = facingAway
          ? 0.06 + 0.24 * Math.min(1, beyond / (320 * dpr)) + 0.1 * Math.abs(Math.sin(a.angle))
          : 0.32 * (1 - Math.cos(a.angle));
        if (darkness > 0.01) {
          ctx.globalAlpha = Math.min(darkness, 0.45);
          ctx.drawImage(shade, 0, s, srcW, h, destX, destY, destW, destH);
        }
      }
      ctx.globalAlpha = 1;
  };
  return { canvas, draw };
}

/**
 * Plays the peel over the page. `art` is the welcome SVG (its box gives the
 * ribbon's size and position); resolves when the cloth has left the screen.
 */
export function peelRibbon(art: SVGSVGElement): Promise<void> {
  // Reduced motion: no peel; the page just fades (styles.css).
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return new Promise((resolve) => setTimeout(resolve, 320));
  }
  const { canvas, draw } = createPeel(art);
  let start = 0;
  return new Promise((resolve) => {
    const frame = (now: number) => {
      start ||= now;
      const t = Math.min(1, (now - start) / DURATION_MS);
      draw(t, now);
      if (t < 1) requestAnimationFrame(frame);
      else {
        canvas.remove();
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
