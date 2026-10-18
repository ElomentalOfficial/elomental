import { expect, test, type Page } from '@playwright/test';
import { settled } from './fixtures.ts';

/**
 * Every main screen at every Text size on four screen sizes: nothing may run
 * out of its box, overlap its neighbours or spill off the screen.
 * (Setup > Accessibility > Text size; WCAG 1.4.4 / 1.4.10.)
 */

const DEVICES = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 375, height: 812 },
  { name: 'tablet upright', width: 768, height: 1024 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'desktop', width: 1302, height: 735 },
];
const SIZES = [100, 125, 150, 200];

/** Elements that frame content: text must stay inside the nearest one. */
const BOXES = 'button, a.btn, .tile, .setting, .modal, .stat-chip, .profile-card, .coach-card, .resume-card, .friend-option, .subbar, .key, .action, .cell, .segment, .difficulty, .month-card, .reward-card';
/** Rows and grids whose children must not overlap one another. */
const ROWS = '.home-grid, .subbar, .segmented, .pad, .actions-row, .profile-stats, .difficulty-picker, .friend-card, .topbar, .status, .casual-head, .coach-actions, .calendar';

async function problems(page: Page, where: string): Promise<string[]> {
  await test.step(`settle: ${where}`, () => settled(page));
  return page.evaluate(
    ([BOXES, ROWS, where]) => {
      const out: string[] = [];
      const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 18)}"`;
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('.sr-only, [aria-hidden="true"]');
      };
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`${where}: page scrolls sideways`);
      // Leaf text: inside its box and on screen.
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        if (!visible(el) || el.closest('.board, .welcome, .brand-banner, svg')) continue;
        const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!ownText) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const t = range.getBoundingClientRect();
        if (t.right > innerWidth + 1 || t.left < -1) out.push(`${where}: off screen ${name(el)}`);
        const box = el.closest(BOXES);
        if (box && box !== el.closest('.subbar') ) {
          const b = box.getBoundingClientRect();
          // A box that scrolls may hold more than it shows, top to bottom.
          const scrolls = /auto|scroll/.test(getComputedStyle(box).overflowY);
          const outY = !scrolls && (t.top < b.top - 2 || t.bottom > b.bottom + 2);
          if (t.left < b.left - 1 || t.right > b.right + 1 || outY) out.push(`${where}: text outside its box ${name(el)} in ${name(box)}`);
        }
        if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) out.push(`${where}: cut off ${name(el)}`);
      }
      // Siblings in a row or grid: no overlap.
      for (const row of document.querySelectorAll(ROWS)) {
        if (!visible(row)) continue;
        const kids = [...row.children].filter((k) => visible(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
        for (let i = 0; i < kids.length; i++) {
          for (let j = i + 1; j < kids.length; j++) {
            const a = kids[i].getBoundingClientRect();
            const b = kids[j].getBoundingClientRect();
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (w > 1 && h > 1) out.push(`${where}: overlap ${name(kids[i])} / ${name(kids[j])}`);
          }
        }
      }
      return [...new Set(out)];
    },
    [BOXES, ROWS, where] as const,
  );
}

for (const device of DEVICES) {
  for (const size of SIZES) {
    test(`${device.name}, text ${size}%: every screen fits`, async ({ page }, info) => {
      test.skip(info.project.name === 'light', 'layout is the same in both themes');
      test.setTimeout(90_000);
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.route(/supabase\.co/, (route) => route.abort());
      await page.addInitScript((textSize) => {
        if (sessionStorage.getItem('layout-ready')) return;
        sessionStorage.setItem('layout-ready', '1');
        localStorage.setItem('elomental:tutorial-done', 'true');
        localStorage.setItem('elomental:a11y', JSON.stringify({ textSize }));
      }, size);
      await page.goto('/');
      await page.locator('.screen.welcome').click();
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      const found: string[] = [];
      found.push(...(await problems(page, 'Home')));

      await page.locator('.tile.area-casual').click();
      await expect(page.getByRole('dialog', { name: 'Casual' })).toBeVisible();
      found.push(...(await problems(page, 'Casual pop-up')));
      // The pop-ups for playing with a friend, opened from Casual.
      for (const name of ['Clash a friend', 'Square code']) {
        await page.getByRole('dialog', { name: 'Casual' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        found.push(...(await problems(page, `${name} pop-up`)));
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
        await page.locator('.tile.area-casual').click();
        await expect(page.getByRole('dialog', { name: 'Casual' })).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();

      await page.locator('.tile.area-daily').click();
      await expect(page).toHaveTitle(/Daily Square/);
      found.push(...(await problems(page, 'Daily')));
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);

      await page.locator('.tile-setup:visible, .tile.area-setup:visible').first().click();
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
      const casual = page.getByRole('dialog', { name: 'Casual' });
      await expect(casual).toBeVisible();
      await casual.getByRole('button', { name: /^Play / }).click();
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
      await page.setViewportSize({ width: device.width, height: device.height });
      await page.route(/supabase\.co/, (route) => route.abort());
      await page.addInitScript((textSize) => {
        if (sessionStorage.getItem('layout-ready')) return;
        sessionStorage.setItem('layout-ready', '1');
        localStorage.setItem('elomental:a11y', JSON.stringify({ textSize }));
      }, size);
      await page.goto('/');
      await page.locator('.screen.welcome').click();
      await expect(page.locator('.tile.area-casual')).toBeVisible();
      await settled(page);
      await page.locator('.tile.area-casual').click();
      await page.getByRole('dialog', { name: 'Casual' }).getByRole('button', { name: /^Play / }).click();
      const card = page.locator('.coach-card');
      await expect(card).toBeVisible({ timeout: 20_000 });
      const found: string[] = [];
      const steps = Number((await page.locator('.coach-count').textContent())?.split('/')[1]);
      expect(steps).toBeGreaterThan(3);
      for (let step = 1; step <= steps; step++) {
        await expect(page.locator('.coach-count')).toHaveText(`${step} / ${steps}`);
        await page.waitForTimeout(450); // the spotlight glides to its control
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
        await page.locator('.coach-next').press('Enter');
      }
      await expect(card).toBeHidden();
      expect(found).toEqual([]);
    });
  }
}
