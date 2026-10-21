/**
 * Colour maths for the palette proposal (docs/review/palette-2026-10-21-ui.md).
 * OKLab / OKLCH (Björn Ottosson), WCAG 2.x relative luminance and contrast, and colour-vision
 * simulation with the same Machado et al. (2009) full-severity matrices as
 * packages/web/scripts/contrast.ts, so the numbers here and there agree.
 */
export type RGB = [number, number, number]; // 0..255
export type LCH = [number, number, number]; // L 0..1, C, H degrees

const lin = (v: number) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);

export const parseHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
export const toHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** a over b at opacity alpha (sRGB, as browsers composite) */
export const over = (a: RGB, alpha: number, b: RGB): RGB => [0, 1, 2].map((i) => a[i] * alpha + b[i] * (1 - alpha)) as RGB;

export function oklab(c: RGB): [number, number, number] {
  const [r, g, b] = c.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklch(c: RGB): LCH {
  const [L, a, b] = oklab(c);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, Math.hypot(a, b), H];
}
/** OKLCH to linear-light sRGB (may be out of gamut) */
function lchToLinear([L, C, H]: LCH): RGB {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (x: RGB) => x.every((v) => v >= -1e-6 && v <= 1 + 1e-6);
/** OKLCH to sRGB, reducing chroma (same L and H) until it fits the sRGB gamut */
export function fromLch([L, C, H]: LCH): RGB {
  if (!inGamut(lchToLinear([L, C, H]))) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(lchToLinear([L, mid, H]))) lo = mid;
      else hi = mid;
    }
    C = lo;
  }
  return lchToLinear([L, C, H]).map(unlin) as RGB;
}
/** The OKLCH lightness at which a colour of chroma C and hue H has relative luminance Y */
export function solveY(Y: number, C: number, H: number): RGB {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(fromLch([mid, C, H]).map((v) => Math.round(v)) as RGB) < Y) lo = mid;
    else hi = mid;
  }
  return fromLch([(lo + hi) / 2, C, H]).map((v) => Math.round(v)) as RGB;
}
/** Visible difference: Euclidean distance in OKLab (0.02 is about a just-noticeable step) */
export const dE = (a: RGB, b: RGB) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

export const MACHADO: Record<string, number[][]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export function simulate(c: RGB, vision: string): RGB {
  if (vision === 'normal') return c;
  const m = MACHADO[vision];
  const l = c.map(lin);
  return m.map((row) => Math.min(255, Math.max(0, unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))) as RGB;
}
