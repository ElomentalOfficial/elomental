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

/** Ribbon outline in the welcome frame's 390×844 units (same as welcome.ts). */
const RIBBON =
  'M42 0H347V152L336 196L347 188V740L291 694L300 688L253 664L244 630L236 678L178 653L126 630L170 657L49 723L42 718V388L54 386L42 366Z';
const RIBBON_TOP = 0;
const RIBBON_BOTTOM = 740;
const FRONT = '#b3603a';
const BACK = '#7f4227';
const LETTERS = [
  ['E', 134, 278], ['L', 195, 278], ['O', 256, 278],
  ['M', 134, 353], ['E', 195, 353], ['N', 256, 353],
  ['T', 134, 428], ['A', 195, 428], ['L', 256, 428],
] as const;

const DURATION_MS = 1600;
/** Source rows per slice (device pixels); small enough to look continuous. */
const SLICE = 2;
/** Distance from the eye to the screen, in CSS pixels. */
const PERSPECTIVE = 1100;

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeIn = (t: number) => t * t * t;
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
  const front = ribbonCanvas(srcW, srcH, k, (ctx) => {
    ctx.fillStyle = FRONT;
    ctx.fill(path);
    ctx.fillStyle = '#ffffe5';
    ctx.font = '400 62px Fraunces, Georgia, serif';
    ctx.textAlign = 'center';
    for (const [ch, x, y] of LETTERS) ctx.fillText(ch, x, y);
  });
  const back = ribbonCanvas(srcW, srcH, k, (ctx) => {
    ctx.fillStyle = BACK;
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
      // The fold travels steadily from the bottom edge to just past the top,
      // the roll widening as it goes (cloth billows rather than creasing)...
      const e = easeInOutSine(Math.min(1, t / 0.8));
      const fold = length * (1 - 1.08 * e);
      const radius = (36 + 110 * e) * dpr;
      // ...and only at the end is the whole sheet lifted up and away.
      const away = easeIn(Math.max(0, (t - 0.7) / 0.3));
      const liftY = -away * canvas.height * 1.1;
      const liftZ = away * 160 * dpr;

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
        const scale = eye / (eye - a.z - liftZ);
        const yTop = vy + (top + a.y + liftY - vy) * scale;
        const yBottom = vy + (top + b.y + liftY - vy) * (eye / (eye - b.z - liftZ));
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
        ctx.drawImage(facingAway ? back : front, 0, s, srcW, h, destX, destY, destW, destH);
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
