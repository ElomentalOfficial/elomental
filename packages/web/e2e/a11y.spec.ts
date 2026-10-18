import { axe, expect, startCasualByKeyboard, test } from './fixtures.ts';

test('Home has no axe violations', async ({ app }) => {
  expect(await axe(app)).toEqual([]);
  await expect(app).toHaveTitle('Elomental');
});

test('the Casual pop-up is a dialog: focus moves in, stays in, Esc closes, focus returns', async ({ app }) => {
  const tile = app.locator('.tile.area-casual');
  await tile.focus();
  await app.keyboard.press('Enter');
  const dialog = app.getByRole('dialog', { name: 'Casual' });
  await expect(dialog).toBeVisible();
  expect(await axe(app)).toEqual([]);
  // Tab around more times than there are controls: focus never leaves the dialog.
  for (let i = 0; i < 12; i++) {
    await app.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await app.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(tile).toBeFocused();
});

test('a game plays from the keyboard and speaks to screen readers', async ({ app }) => {
  await startCasualByKeyboard(app);
  await expect(app).toHaveTitle('Casual · Easy · Elomental');
  expect(await axe(app)).toEqual([]);

  // The first Tab stop is "Skip to board"; it lands on the board's one focusable cell.
  await app.keyboard.press('Tab');
  await expect(app.getByRole('button', { name: 'Skip to board' })).toBeFocused();
  await app.keyboard.press('Enter');
  const focused = app.locator('.cell:focus');
  await expect(focused).toHaveAttribute('aria-selected', 'true');
  await expect(app.locator('.cell[tabindex="0"]')).toHaveCount(1);

  // Arrows move focus and selection together; labels give row, column and box.
  await app.keyboard.press('ArrowRight');
  await expect(focused).toHaveAttribute('aria-label', /^Row 5, column 6, box 5: /);

  // Walk to an empty cell and type a number.
  const empty = await app.evaluate(() => [...document.querySelectorAll('.cell')].findIndex((c) => / empty$/.test(c.getAttribute('aria-label') ?? '')));
  const [row, col] = [Math.floor(empty / 9), empty % 9];
  for (let r = 4; r !== row; r += row > 4 ? 1 : -1) await app.keyboard.press(row > 4 ? 'ArrowDown' : 'ArrowUp');
  for (let c = 5; c !== col; c += col > 5 ? 1 : -1) await app.keyboard.press(col > 5 ? 'ArrowRight' : 'ArrowLeft');
  await expect(focused).toHaveAttribute('aria-label', / empty$/);
  await app.keyboard.press('5');
  await expect(app.locator(`[data-cell="${empty}"]`)).toHaveAttribute('aria-label', /: 5, (your number|wrong)$/);
  const label = await app.locator(`[data-cell="${empty}"]`).getAttribute('aria-label');
  if (label?.endsWith('wrong')) {
    await expect(app.locator('.screen.game [aria-live]')).toHaveText('Wrong number. 2 mistakes left.');
    await expect(app.getByRole('img', { name: '1 of 3 mistakes' })).toBeVisible();
  }

  // Buttons work from the keyboard (they used to need a pointer).
  const notes = app.getByRole('button', { name: 'Notes' });
  await notes.focus();
  await app.keyboard.press('Enter');
  await expect(notes).toHaveAttribute('aria-pressed', 'true');
  await app.keyboard.press('Space');
  await expect(notes).toHaveAttribute('aria-pressed', 'false');
});

test('"?" opens the keyboard shortcuts dialog', async ({ app }) => {
  await startCasualByKeyboard(app);
  await app.keyboard.press('?');
  const dialog = app.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  expect(await axe(app)).toEqual([]);
  await app.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('Setup, its Accessibility section and the statement have no axe violations', async ({ app }) => {
  await app.locator('.tile-setup').click();
  await expect(app.getByRole('heading', { name: 'Accessibility', level: 2 })).toBeVisible();
  expect(await axe(app)).toEqual([]);
  await app.getByRole('button', { name: 'Accessibility statement' }).click();
  await expect(app).toHaveTitle('Accessibility · Elomental');
  expect(await axe(app)).toEqual([]);
});

test('200% text: nothing is cut off and nothing scrolls sideways', async ({ app }) => {
  await app.locator('.tile-setup').click();
  await app.getByRole('radio', { name: '200%' }).click();
  const problems = () =>
    app.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
      for (const el of document.querySelectorAll<HTMLElement>('.screen button, .tile-label, .puzzle-info, .modal button, .modal p, .modal h2')) {
        if (el.offsetWidth && el.scrollWidth > el.clientWidth + 2) out.push(`clipped: ${el.className} "${el.textContent?.trim().slice(0, 20)}"`);
        if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) out.push(`ellipsis: ${el.textContent}`);
      }
      return out;
    });
  expect(await problems()).toEqual([]);
  await app.getByRole('button', { name: 'Back' }).click();
  await expect(app.locator('.tile.area-casual')).toBeVisible();
  expect(await problems()).toEqual([]);
  await startCasualByKeyboard(app);
  expect(await problems()).toEqual([]);
});
