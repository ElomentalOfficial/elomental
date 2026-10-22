import { axe, expect, settled, startCasualByKeyboard, test } from './fixtures.ts';

test('Home has no axe violations', async ({ app }) => {
  expect(await axe(app)).toEqual([]);
  await expect(app).toHaveTitle('Elomental');
});

test('Casual is a page; Clash opens from it as a dialog that keeps focus and closes back to the page', async ({ app }) => {
  await app.locator('.tile.area-casual').focus();
  await app.keyboard.press('Enter');
  await expect(app).toHaveTitle('Casual · Elomental');
  expect(await axe(app)).toEqual([]);
  const clash = app.getByRole('button', { name: /^Clash a friend/ });
  await clash.focus();
  await app.keyboard.press('Enter');
  const dialog = app.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Tab around more times than there are controls: focus never leaves the dialog.
  for (let i = 0; i < 12; i++) {
    await app.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await app.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(clash).toBeFocused();
  await app.getByRole('button', { name: 'Back' }).click();
  await expect(app.locator('.tile.area-casual')).toBeVisible();
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

test('Setup, the Accessibility page and the statement have no axe violations', async ({ app }) => {
  await app.locator('.tile.area-setup').click();
  await expect(app.getByRole('heading', { name: 'Accessibility', level: 2 })).toBeVisible();
  expect(await axe(app)).toEqual([]);
  await app.getByRole('button', { name: 'Open accessibility' }).click();
  await expect(app).toHaveTitle('Accessibility · Elomental');
  expect(await axe(app)).toEqual([]);
  await app.getByRole('button', { name: 'Accessibility statement' }).click();
  await expect(app.getByRole('heading', { name: 'Known limits' })).toBeVisible();
  expect(await axe(app)).toEqual([]);
});

test('on long pages the header with Back stays in view while the body scrolls', async ({ app }) => {
  await app.locator('.tile.area-setup').click();
  await app.getByRole('button', { name: 'Open accessibility' }).click();
  const back = app.getByRole('button', { name: 'Back' });
  await settled(app);
  const before = await back.boundingBox();
  await app.locator('.sub-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
  await expect(back).toBeInViewport();
  expect((await back.boundingBox())?.y).toBe(before?.y);
});

test('desktop: the wheel scrolls the page from anywhere, and the column widens with Text size', async ({ app }) => {
  await app.setViewportSize({ width: 1302, height: 735 });
  await app.locator('.tile.area-setup').click();
  await app.getByRole('button', { name: 'Open accessibility' }).click();
  await settled(app);
  const width = () => app.locator('.screen.sub').evaluate((s) => s.getBoundingClientRect().width);
  const normal = await width();
  // The far left edge, well outside the column.
  await app.mouse.move(20, 400);
  await app.mouse.wheel(0, 300);
  await expect.poll(() => app.locator('.sub-body').evaluate((b) => b.scrollTop)).toBeGreaterThan(0);
  await app.getByRole('radio', { name: '200%' }).click();
  expect(await width()).toBeGreaterThan(normal * 1.5);
});

test('200% text: nothing is cut off and nothing scrolls sideways', async ({ app }) => {
  await app.locator('.tile.area-setup').click();
  await app.getByRole('button', { name: 'Open accessibility' }).click();
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
  await expect(app).toHaveTitle('Setup · Elomental');
  expect(await problems()).toEqual([]);
  await app.getByRole('button', { name: 'Back' }).click();
  await expect(app.locator('.tile.area-casual')).toBeVisible();
  expect(await problems()).toEqual([]);
  await startCasualByKeyboard(app);
  expect(await problems()).toEqual([]);
});
