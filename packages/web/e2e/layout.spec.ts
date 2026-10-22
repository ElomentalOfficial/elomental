import { expect, test } from '@playwright/test';
import { DEVICES, problems, settled, SIZES } from './fixtures.ts';

/**
 * Every main screen at every Text size on four screen sizes: nothing may run
 * out of its box, overlap its neighbours or spill off the screen.
 * (Setup > Accessibility > Text size; WCAG 1.4.4 / 1.4.10.) The signed-in screens
 * (Forge, Profile, Leaderboard, Affinity) are in layout-signed-in.spec.ts.
 */

for (const device of DEVICES) {
  for (const size of SIZES) {
    test(`${device.name}, text ${size}%: every screen fits`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      test.setTimeout(90_000);
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.route(/supabase\.co|challenges\.cloudflare\.com/, (route) => route.abort());
      await page.addInitScript((textSize) => {
        if (sessionStorage.getItem('layout-ready')) return;
        sessionStorage.setItem('layout-ready', '1');
        localStorage.setItem('elomental:tutorial-done', 'true');
        localStorage.setItem('elomental:a11y', JSON.stringify({ textSize }));
      }, size);
      await page.goto('/');
      // The splash turns away by itself after a moment; skip it if it's still there.
      await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      const found: string[] = [];
      found.push(...(await problems(page, 'Home')));

      await page.locator('.tile.area-casual').click();
      await expect(page).toHaveTitle(/^Casual/);
      found.push(...(await problems(page, 'Casual')));
      // The pop-ups for playing with a friend, opened from the Casual page.
      for (const name of ['Clash a friend', 'Square code']) {
        await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        found.push(...(await problems(page, `${name} pop-up`)));
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
      }
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);

      await page.locator('.tile.area-daily').click();
      await expect(page).toHaveTitle(/Daily Square/);
      found.push(...(await problems(page, 'Daily')));
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);

      await page.locator('.tile.area-setup').first().click();
      await expect(page).toHaveTitle(/Setup/);
      found.push(...(await problems(page, 'Setup')));
      await page.getByRole('button', { name: 'Open accessibility' }).click();
      await expect(page).toHaveTitle(/Accessibility/);
      found.push(...(await problems(page, 'Accessibility')));
      await page.getByRole('button', { name: 'Accessibility statement' }).click();
      await expect(page.getByRole('heading', { name: 'Known limits' })).toBeVisible();
      found.push(...(await problems(page, 'Statement')));
      for (const title of [/^Accessibility/, /^Setup/, /^Elomental$/]) {
        await page.getByRole('button', { name: 'Back' }).click();
        await expect(page).toHaveTitle(title);
        await settled(page);
      }

      await page.locator('.tile.area-casual').click();
      await expect(page).toHaveTitle(/^Casual/);
      await page.getByRole('button', { name: /^Play / }).click();
      await expect(page.getByRole('grid', { name: 'Sudoku board' })).toBeVisible({ timeout: 20_000 });
      found.push(...(await problems(page, 'Game')));
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      found.push(...(await problems(page, 'Shortcuts')));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await page.getByRole('button', { name: 'Pause' }).click();
      found.push(...(await problems(page, 'Paused')));

      expect(found).toEqual([]);
    });

    test(`${device.name}, text ${size}%: the first-game tutorial fits`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      test.setTimeout(90_000);
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.route(/supabase\.co|challenges\.cloudflare\.com/, (route) => route.abort());
      await page.addInitScript((textSize) => {
        if (sessionStorage.getItem('layout-ready')) return;
        sessionStorage.setItem('layout-ready', '1');
        localStorage.setItem('elomental:a11y', JSON.stringify({ textSize }));
      }, size);
      await page.goto('/');
      // The splash turns away by itself after a moment; skip it if it's still there.
      await page.locator('.screen.welcome').click({ timeout: 2_000 }).catch(() => undefined);
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);
      await page.locator('.tile.area-casual').click();
      await expect(page).toHaveTitle(/^Casual/);
      await page.getByRole('button', { name: /^Play / }).click();
      const card = page.locator('.coach-card');
      await expect(card).toBeVisible({ timeout: 20_000 });
      const found: string[] = [];
      const steps = Number((await page.locator('.coach-count').textContent())?.split('/')[1]);
      expect(steps).toBeGreaterThan(3);
      for (let step = 1; step <= steps; step++) {
        await expect(page.locator('.coach-count')).toHaveText(`${step} / ${steps}`);
        // the spotlight glides to its control and the card rises: wait until both have stopped
        await settled(page);
        found.push(...(await problems(page, `Tutorial step ${step}`)));
        // The card fits on screen and the control it explains is in view.
        const off = await page.evaluate(() => {
          const out: string[] = [];
          const c = document.querySelector('.coach-card')!.getBoundingClientRect();
          const s = document.querySelector('.coach-spot')!.getBoundingClientRect();
          if (c.top < -1 || c.bottom > innerHeight + 1) out.push('card runs off screen');
          if (s.bottom < 0 || s.top > innerHeight) out.push('spotlight off screen');
          return out;
        });
        found.push(...off.map((o) => `Tutorial step ${step}: ${o}`));
        await expect(page.locator('.coach-next')).toBeVisible();
        await page.locator('.coach-next').press('Enter');
      }
      await expect(card).toBeHidden();
      expect(found).toEqual([]);
    });
  }
}
