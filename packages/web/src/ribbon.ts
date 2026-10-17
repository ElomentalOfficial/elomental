/**
 * The copper ribbon's outline from the Figma welcome screen, in that frame's
 * 390×844 units: x 42–347, y 0–740, with a small tear on each side and the
 * torn tail at the bottom. Shared by the splash (welcome.ts), its peel
 * (fabric.ts) and the banner over the controls on wide screens (game.ts).
 */
export const RIBBON_PATH =
  'M42 0H347V152L336 196L347 188V740L291 694L300 688L253 664L244 630L236 678L178 653L126 630L170 657L49 723L42 718V388L54 386L42 366Z';

/** The ribbon's box within that frame. */
export const RIBBON_BOX = { x: 42, width: 305, height: 740 } as const;
