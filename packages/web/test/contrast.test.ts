import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accepted, contrast, lookAlikes, readStyles } from '../scripts/contrast.ts';
import { PALETTE_FILE, paletteCss } from '../scripts/palette.ts';

const css = readStyles();

test('the palette stylesheet is what scripts/palette.ts generates (run npm run palette after editing it)', () => {
  assert.equal(readFileSync(PALETTE_FILE, 'utf8'), paletteCss());
});

test('every colour pair meets its WCAG ratio in both themes', () => {
  const failures: string[] = [];
  for (const [theme, rows] of Object.entries(contrast(css))) {
    for (const r of rows) {
      if (!r.pass && !accepted(theme, r.label)) failures.push(`${theme}: ${r.label} ${r.ratio.toFixed(2)}:1 (need ${r.need}) ${r.fg} on ${r.bg}`);
    }
  }
  assert.deepEqual(failures, []);
});

/**
 * Cell states that may look alike in colour, because something other than
 * colour tells them apart (styles.css). A new look-alike pair fails the test.
 */
const SHAPE_CUES: Record<string, string> = {
  'cell / row/column highlight': 'supplementary; the selection ring marks the selected cell',
  'same number / hint': 'a hint plays an outline pulse, and the number appears',
  'wrong / hint': 'wrong cells carry a slash mark',
  'same number / wrong': 'wrong cells carry a slash mark',
};

test('cell states that look alike to colour-blind players also differ in shape', () => {
  const uncovered: string[] = [];
  for (const [theme, rows] of Object.entries(lookAlikes(css))) {
    for (const r of rows) if (!SHAPE_CUES[r.pair]) uncovered.push(`${theme} ${r.vision}: ${r.pair} (ΔE ${r.deltaE.toFixed(1)})`);
  }
  assert.deepEqual(uncovered, []);
});
