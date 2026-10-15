/**
 * The Figma panels have torn, brush-stroke edges. Instead of image assets we
 * build a few SVG masks with turbulence-displaced edges and expose them as
 * CSS variables (--m1..--m4 for squarish shapes, --mw1..--mw2 for wide ones).
 * Any element with the `rough` class keeps its own background colour, so
 * state changes (selected, wrong, ...) stay plain CSS.
 */
function mask(width: number, height: number, seed: number, amount: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">` +
    `<filter id="f" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="${seed}"/>` +
    `<feDisplacementMap in="SourceGraphic" scale="${amount * 2}" xChannelSelector="R" yChannelSelector="G"/>` +
    `</filter>` +
    `<rect x="${amount}" y="${amount}" width="${width - amount * 2}" height="${height - amount * 2}" fill="white" filter="url(#f)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function installRoughMasks(): void {
  const root = document.documentElement.style;
  for (let i = 1; i <= 4; i++) root.setProperty(`--m${i}`, mask(100, 100, i * 7, 3));
  for (let i = 1; i <= 2; i++) root.setProperty(`--mw${i}`, mask(400, 100, i * 13, 5));
}
