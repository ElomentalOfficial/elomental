import { expect, settled, test } from './fixtures.ts';

/**
 * Ranked says what it costs before you pay it (full review H10, M15, L21): the sheet gives
 * the length, the stakes and the pauses; the first hint asks first; and Concede's confirm
 * leads with Keep playing.
 */
test('Ranked: the sheet, the first-hint confirm and the concede confirm', async ({ app }) => {
  await settled(app);
  await app.locator('.tile.area-ranked').click();
  const sheet = app.getByRole('dialog', { name: 'Ranked' });
  await expect(sheet).toContainText(/About \d+ min/);
  await expect(sheet).toContainText(/Win about \+\d+/);
  await expect(sheet).toContainText('3 pauses of up to 5 minutes.');
  await sheet.getByRole('button', { name: 'Start' }).click();
  await expect(app.getByRole('grid', { name: 'Sudoku board' })).toBeVisible({ timeout: 20_000 });

  // the first hint asks; Keep playing (the default) uses none
  await app.getByRole('button', { name: /^Hint/ }).click();
  const ask = app.getByRole('dialog', { name: 'Use a hint?' });
  await expect(ask).toContainText('cuts this game’s Elo gain by 25%');
  await expect(ask.getByRole('button').first()).toHaveText('Keep playing');
  await ask.getByRole('button', { name: 'Keep playing' }).click();
  await expect(ask).toBeHidden();
  await expect(app.locator('.hint-count')).toHaveText('3');

  // Concede: the safe choice comes first
  await app.getByRole('button', { name: 'Concede' }).click();
  const confirm = app.getByRole('dialog');
  await expect(confirm.getByRole('button').first()).toHaveText('Keep playing');
  await confirm.getByRole('button', { name: 'Keep playing' }).click();
  await expect(app.getByRole('grid', { name: 'Sudoku board' })).toBeVisible();
});
