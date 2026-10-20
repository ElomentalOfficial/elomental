import { expect } from '@playwright/test';
import { startCasualByKeyboard, test } from './fixtures.ts';

// The notes wheel (screens/wheel.ts): a long-press opens it and a slide picks a note, a drag off
// a square opens it at once, Esc closes it, and a quick tap only selects. No other test drives it.
test('notes wheel gestures', async ({ app: page }, info) => {
  test.skip(info.project.name === 'light');
  await startCasualByKeyboard(page);
  const empty = page.locator('.cell:not(.given)').first();
  const box = (await empty.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // long-press
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await expect(page.locator('.wheel-layer')).toBeVisible();
  // slide to the top digit and lift: a note goes in
  await page.mouse.move(x, y - 60, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.wheel-layer')).toHaveCount(0);
  await expect(empty.locator('.notes')).toHaveCount(1);
  // drag opens at once
  const next = page.locator('.cell:not(.given):not(:has(.notes))').first();
  const b2 = (await next.boundingBox())!;
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + 30, b2.y + b2.height / 2, { steps: 3 });
  await expect(page.locator('.wheel-layer')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.wheel-layer')).toHaveCount(0);
  // a quick tap only selects
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await expect(page.locator('.wheel-layer')).toHaveCount(0);
  await expect(next).toHaveClass(/selected/);
});
