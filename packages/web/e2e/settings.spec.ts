import type { Page } from '@playwright/test';
import { expect, settled, startCasualByKeyboard, test } from './fixtures.ts';

/**
 * Every choice on Setup > Accessibility does what it says: each is checked
 * where the player meets it (the board, the clock, the page), not just in storage.
 */

/** Stores preferences as the app does, reloads, and comes back to Home. */
async function usePrefs(page: Page, prefs: Record<string, unknown>) {
  await page.evaluate((p) => {
    const key = 'elomental:a11y';
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), ...p }));
  }, prefs);
  await page.reload();
  await page.locator('.screen.welcome').click();
  await expect(page.locator('.tile.area-casual')).toBeVisible();
  await settled(page);
}

/** Puts a number that is surely wrong (it's already in the row) into an empty cell. Returns the cell. */
async function wrongMove(page: Page, skip: number[] = []): Promise<number> {
  const [cell, digit] = await page.evaluate((skip) => {
    const cells = [...document.querySelectorAll<HTMLElement>('.cell')];
    const value = (i: number) => /: (\d), /.exec(cells[i].getAttribute('aria-label') ?? '')?.[1];
    for (let i = 0; i < 81; i++) {
      if (skip.includes(i) || !/ empty$/.test(cells[i].getAttribute('aria-label') ?? '')) continue;
      const row = Math.floor(i / 9);
      for (let c = 0; c < 9; c++) {
        const v = value(row * 9 + c);
        if (v) return [i, v] as const;
      }
    }
    throw new Error('no empty cell with a filled row');
  }, skip);
  await page.locator(`[data-cell="${cell}"]`).click();
  await page.keyboard.press(digit);
  return cell;
}

const label = (page: Page, cell: number) => page.locator(`[data-cell="${cell}"]`);

test('every choice on the Accessibility page is stored and shown as chosen', async ({ app }) => {
  await app.locator('.tile-setup').click();
  await app.getByRole('button', { name: 'Open accessibility' }).click();
  const pick = async (group: string, option: string) => {
    const radio = app.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
  };
  await pick('Text size', '150%');
  await pick('Contrast', 'High');
  await pick('Colour-blind friendly', 'On');
  await pick('Reduce motion', 'Reduce');
  await pick('Timer', 'Hide');
  await pick('Highlight row and column', 'Off');
  await pick('Highlight the 3×3 box', 'On');
  await pick('Highlight same numbers', 'Off');
  await pick('Wrong numbers', 'Until next move');
  await pick('Mistake limit in Casual', 'Off');
  await pick('Vibration', 'Off');
  await pick('Sounds', 'On');
  expect(await app.evaluate(() => JSON.parse(localStorage.getItem('elomental:a11y')!))).toEqual({
    textSize: 150,
    contrast: 'high',
    colourBlind: true,
    motion: 'reduce',
    showTimer: false,
    highlightLines: false,
    highlightBox: true,
    highlightSame: false,
    keepWrong: true,
    casualMistakeLimit: false,
    haptics: false,
    sounds: true,
  });
  const html = app.locator('html');
  await expect(html).toHaveAttribute('data-large-text', '');
  await expect(html).toHaveAttribute('data-contrast', 'high');
  await expect(html).toHaveAttribute('data-colour-blind', '');
  await expect(html).toHaveAttribute('data-reduce-motion', '');
  await expect(html).toHaveAttribute('data-hide-timer', '');
  expect(await html.evaluate((el) => getComputedStyle(el).getPropertyValue('--text-scale').trim())).toBe('1.5');

  // Reset to defaults: asks first (Cancel keeps everything), then puts every choice back.
  await app.getByRole('button', { name: 'Reset to defaults' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByRole('dialog')).toBeHidden();
  await expect(app.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: '150%' })).toHaveAttribute('aria-checked', 'true');
  await app.getByRole('button', { name: 'Reset to defaults' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(app.getByRole('status')).toHaveText('Accessibility settings are back to their defaults.');
  expect(await app.evaluate(() => JSON.parse(localStorage.getItem('elomental:a11y')!))).toEqual({
    textSize: 100,
    contrast: 'system',
    colourBlind: false,
    motion: 'system',
    showTimer: true,
    highlightLines: true,
    highlightBox: false,
    highlightSame: true,
    keepWrong: false,
    casualMistakeLimit: true,
    haptics: true,
    sounds: false,
  });
  for (const [group, option] of [['Text size', '100%'], ['Contrast', 'System'], ['Sounds', 'Off'], ['Wrong numbers', 'Briefly']]) {
    await expect(app.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option })).toHaveAttribute('aria-checked', 'true');
  }
  await expect(html).not.toHaveAttribute('data-large-text', '');
  await expect(html).not.toHaveAttribute('data-hide-timer', '');
});

test('Text size scales the type', async ({ app }) => {
  const size = () => app.locator('.profile-rank').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const normal = await size();
  await usePrefs(app, { textSize: 200 });
  expect(await size()).toBeCloseTo(normal * 2, 0);
});

test('Contrast: High outlines every cell; System follows the device', async ({ app }) => {
  await usePrefs(app, { contrast: 'high' });
  await startCasualByKeyboard(app);
  expect(await app.locator('.cell').first().evaluate((c) => getComputedStyle(c).boxShadow)).toContain('inset');
  await usePrefs(app, { contrast: 'system' });
  await expect(app.locator('html')).toHaveAttribute('data-contrast', 'standard');
  await app.emulateMedia({ contrast: 'more' });
  await expect(app.locator('html')).toHaveAttribute('data-contrast', 'high');
});

test('Reduce motion: System follows the device, and a wrong number still shows before it goes', async ({ app }) => {
  await expect(app.locator('html')).not.toHaveAttribute('data-reduce-motion', '');
  await app.emulateMedia({ reducedMotion: 'reduce' });
  await expect(app.locator('html')).toHaveAttribute('data-reduce-motion', '');
  await startCasualByKeyboard(app);
  const cell = await wrongMove(app);
  await app.waitForTimeout(500);
  // Still readable half a second later (the fade used to be cut to nothing).
  expect(await label(app, cell).evaluate((c) => getComputedStyle(c).color)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(label(app, cell)).toHaveAttribute('aria-label', / empty$/, { timeout: 3000 });
});

test('Colour-blind friendly marks same numbers with a bar', async ({ app }) => {
  await usePrefs(app, { colourBlind: true });
  await startCasualByKeyboard(app);
  const filled = await app.evaluate(() => [...document.querySelectorAll('.cell')].findIndex((c) => !/ empty$/.test(c.getAttribute('aria-label') ?? '')));
  await label(app, filled).click();
  const same = app.locator('.cell.same').first();
  await expect(same).toBeVisible();
  expect(await same.evaluate((c) => getComputedStyle(c, '::after').content)).not.toBe('none');
});

test('Timer: Hide takes the clock off the screen and out of the screen reader', async ({ app }) => {
  await usePrefs(app, { showTimer: false });
  await startCasualByKeyboard(app);
  await expect(app.locator('.timer')).toBeHidden();
});

test('the three highlights each switch on and off', async ({ app }) => {
  await startCasualByKeyboard(app);
  // Cell 40 is row 5, column 5; cell 36 shares its row, cell 30 only its box.
  const select = async () => {
    await label(app, 40).click();
    return {
      row: await label(app, 36).evaluate((c) => c.classList.contains('cross')),
      box: await label(app, 30).evaluate((c) => c.classList.contains('cross')),
    };
  };
  expect(await select()).toEqual({ row: true, box: false });
  await usePrefs(app, { highlightLines: false, highlightBox: true });
  await startCasualByKeyboard(app);
  expect(await select()).toEqual({ row: false, box: true });

  const filled = await app.evaluate(() => [...document.querySelectorAll('.cell')].findIndex((c) => !/ empty$/.test(c.getAttribute('aria-label') ?? '')));
  await label(app, filled).click();
  await expect(app.locator('.cell.same').first()).toBeVisible();
  await usePrefs(app, { highlightSame: false });
  await startCasualByKeyboard(app);
  await label(app, filled).click();
  await expect(app.locator('.cell.same')).toHaveCount(0);
});

test('Wrong numbers: Briefly fades them, Until next move keeps them', async ({ app }) => {
  await startCasualByKeyboard(app);
  const brief = await wrongMove(app);
  await expect(label(app, brief)).toHaveAttribute('aria-label', / empty$/, { timeout: 3000 });
  await usePrefs(app, { keepWrong: true });
  await startCasualByKeyboard(app);
  const kept = await wrongMove(app);
  await app.waitForTimeout(2500);
  await expect(label(app, kept)).toHaveAttribute('aria-label', /, wrong$/);
});

test('Mistake limit in Casual: Off lets the game go on past three mistakes', async ({ app }) => {
  await usePrefs(app, { casualMistakeLimit: false });
  await startCasualByKeyboard(app);
  const used: number[] = [];
  for (let i = 0; i < 4; i++) {
    used.push(await wrongMove(app, used));
    await app.waitForTimeout(150);
  }
  await expect(app.getByRole('img', { name: '4 mistakes' })).toBeVisible();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.getByRole('grid', { name: 'Sudoku board' })).toBeVisible();
});

test('Vibration and Sounds: each cue only when switched on', async ({ app }) => {
  await app.addInitScript(() => {
    const w = window as unknown as { buzz: number; tones: number };
    w.buzz = 0;
    w.tones = 0;
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: () => ((w.buzz += 1), true) });
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      w.tones += 1;
      return make.call(this);
    };
  });
  const counts = () => app.evaluate(() => ({ buzz: (window as unknown as { buzz: number }).buzz, tones: (window as unknown as { tones: number }).tones }));

  // Defaults: vibration on, sounds off.
  await usePrefs(app, {});
  await startCasualByKeyboard(app);
  await wrongMove(app);
  expect(await counts()).toEqual({ buzz: 1, tones: 0 });

  await usePrefs(app, { haptics: false, sounds: true });
  await startCasualByKeyboard(app);
  await wrongMove(app);
  expect(await counts()).toEqual({ buzz: 0, tones: 1 });
});
