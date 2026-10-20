import { expect, startCasualByKeyboard, test } from './fixtures.ts';

/**
 * One saved game per mode (full review H4): starting a Casual game no longer replaces a Ranked
 * game in progress, and a save from the old single slot moves to its own mode's slot.
 */
test('a game in progress is kept per mode, and the old single save moves over', async ({ app }) => {
  await startCasualByKeyboard(app);
  const keys = () => app.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elomental:game')).sort());
  await expect.poll(keys).toEqual(['elomental:game:casual']);

  // An old single-slot save of a Ranked game (as before this change), next to the Casual one.
  await app.evaluate(() => {
    const casual = JSON.parse(localStorage.getItem('elomental:game:casual')!);
    localStorage.setItem('elomental:game', JSON.stringify({ ...casual, config: { ...casual.config, mode: 'ranked' } }));
  });
  await app.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(app.locator('.tile.area-ranked')).toBeVisible();

  // The Ranked tile resumes that game; the Casual game is still saved beside it.
  await app.locator('.tile.area-ranked').click();
  await expect(app.locator('.screen.game.mode-ranked')).toBeVisible({ timeout: 20_000 });
  await expect.poll(keys).toEqual(['elomental:game:casual', 'elomental:game:ranked']);
});
