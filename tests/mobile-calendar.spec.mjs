import { test, expect } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') });
});
async function ready(page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/dashboard.html?demo=1');
  await expect(page.locator('#startup-status')).toContainText('ready');
}

for (const width of [360, 390, 430]) {
  test(`phone calendar fits Day, Week, and Month at ${width}px`, async ({ page }) => {
    await ready(page, width);
    for (const view of ['Day', 'Week', 'Month']) {
      await page.getByRole('button', { name: view, exact: true }).tap();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const viewport = page.locator(view === 'Month' ? '#month-view' : '#week-view');
      expect(await viewport.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const switchButton = page.getByRole('button', { name: view, exact: true });
      expect((await switchButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
      if (view === 'Week') {
        await expect(page.locator('.mobile-week-day')).toHaveCount(7);
        await expect(page.locator('.time-day-column')).toHaveCount(1);
      }
      if (width === 390) await page.locator('.calendar-widget').screenshot({ path: `qa-artifacts/phone-calendar-${view.toLowerCase()}.png` });
    }
  });
}

test('mobile week day selection preserves Week preference and returns to seven columns on desktop', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Week', exact: true }).tap();
  await page.locator('.mobile-week-day[data-date="2026-11-06"]').tap();
  await expect(page.locator('#selected-day')).toContainText('Nov 6');
  await expect(page.locator('.time-day-column')).toHaveAttribute('data-date', '2026-11-06');
  await page.locator('.time-slot[data-hour="10"]').tap();
  await expect(page.locator('#activity-date')).toHaveValue('2026-11-06');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => sessionStorage.getItem('demo.day-compass.calendar-view.v1'))).toBe('week');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.time-day-column')).toHaveCount(7);
  await expect(page.locator('#mobile-week-days')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile month agenda reads full activity names and opens the shared editor for the selected date', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Month', exact: true }).tap();
  await expect(page.locator('#mobile-agenda-list')).toContainText('School');
  await page.locator('#mobile-agenda-list').getByRole('button', { name: /Edit School/ }).tap();
  await expect(page.locator('#activity-start')).toHaveValue('08:00');
  await page.keyboard.press('Escape');
  await page.locator('.calendar-day[data-date="2026-11-09"]').tap();
  await expect(page.locator('#mobile-agenda-empty')).toContainText('A clear day');
  await page.locator('#mobile-agenda-add').tap();
  await expect(page.locator('#activity-date')).toHaveValue('2026-11-09');
  await page.keyboard.press('Escape');
});

test('long event labels stay readable while scrolling through the phone timeline', async ({ page }) => {
  await ready(page);
  const initialFrame = await page.locator('#week-view').boundingBox();
  const initialLabel = await page.locator('.week-event').filter({ hasText: 'School' }).locator('.event-label').boundingBox();
  expect(initialLabel.y - initialFrame.y).toBeLessThan(150);
  await page.locator('#week-view').evaluate(node => { node.scrollTop = 660; });
  const label = page.locator('.week-event').filter({ hasText: 'School' }).locator('.event-label');
  const labelBox = await label.boundingBox();
  const frameBox = await page.locator('#week-view').boundingBox();
  expect(labelBox.y).toBeGreaterThanOrEqual(frameBox.y + 70);
  expect(labelBox.y + labelBox.height).toBeLessThan(frameBox.y + frameBox.height);
});
