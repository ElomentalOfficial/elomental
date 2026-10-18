import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanA11y } from '../src/a11y.ts';

test('accessibility settings from the account keep only known keys and values', () => {
  assert.deepEqual(
    cleanA11y({
      textSize: 150,
      contrast: 'high',
      motion: 'reduce',
      colourBlind: true,
      sounds: false,
      // Dropped: unknown size, unknown key, wrong types.
      extra: 'x',
      highlightBox: 'yes',
    }),
    { textSize: 150, contrast: 'high', motion: 'reduce', colourBlind: true, sounds: false },
  );
  assert.deepEqual(cleanA11y({ textSize: 175, contrast: 'max', motion: 'fast' }), {});
  assert.deepEqual(cleanA11y(null), {});
  assert.deepEqual(cleanA11y('high'), {});
});
