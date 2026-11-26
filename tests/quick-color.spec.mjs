import { test, expect } from '@playwright/test';

test('tapping a colour on the event card recolours the event and deadlines', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-26T08:00:00Z') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard.html?demo=1'); await expect(page.locator('#startup-status')).toContainText('ready');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.locator('.week-event', { hasText: 'School' }).first().click();
  await page.locator('.event-card .color-swatch[title=Tomato]').click();
  const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('demo.day-compass.planner.v2')));
  expect(Object.values((await saved()).days).flatMap(d => d.commitments).find(c => c.title === 'School').color).toBe('tomato');
  await expect(page.locator('.event-card .event-card-bar')).toHaveCSS('background-color', 'rgb(213, 0, 0)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  const chip = page.locator('.deadline-chip').first(); await chip.scrollIntoViewIfNeeded(); await chip.click();
  await page.locator('.event-card .color-swatch[title=Grape]').click();
  await page.keyboard.press('Escape');
  expect((await saved()).tasks.find(t => t.color)?.color).toBe('grape');
  await page.locator('.deadline-chip').first().click();
  await page.locator('.event-card .color-auto').click();
  expect((await saved()).tasks.some(t => t.color)).toBe(false);
});
