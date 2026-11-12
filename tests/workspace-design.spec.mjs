import { test, expect } from '@playwright/test';
async function ready(page) { await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') }); await page.goto('/dashboard.html?demo=1'); await expect(page.locator('#startup-status')).toContainText('ready'); }
test('combined workspace preserves calendar navigation, real activity badges and saved theme choices', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1100 }); await ready(page);
  const summaryBox = await page.locator('.workspace-summary').boundingBox(), calendarBox = await page.locator('.calendar-widget').boundingBox();
  expect(summaryBox.height).toBeLessThan(160); expect(calendarBox.y).toBeLessThan(430);
  await expect(page.locator('#productivity-dialog')).not.toBeVisible();
  await expect(page.locator('.workspace-brand')).toBeVisible(); await expect(page.locator('.week-event[data-activity=school] .activity-mark')).toBeVisible();
  await page.locator('[data-panel=calendar]').click(); await expect(page.locator('[data-panel=calendar]')).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.calendar-widget')).toBeVisible();
  await page.locator('.mood-details summary').click(); await page.locator('[data-scene-theme=aurora-night]').click(); await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora-night');
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'qa-artifacts/combined-aurora.png' });
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora-night');
  await page.locator('.mood-details summary').click();
  await page.locator('[data-scene-theme=aurora]').click(); await expect(page.locator('html')).toHaveAttribute('data-mode', 'light'); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'qa-artifacts/combined-calm.png' });
  await page.locator('[data-panel=ai]').click(); await expect(page.locator('#ai-panel')).toBeVisible(); await expect(page.locator('.workspace-sidecar')).toBeHidden();
});
for (const width of [360, 390, 430]) test(`combined workspace remains usable on ${width}px phones`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.workspace-brand')).toBeHidden();
  await page.locator('[data-panel=calendar]').click(); await expect(page.locator('.time-day-column')).toHaveCount(1);
  await page.locator('.mood-details summary').click(); await page.locator('[data-scene-theme=aurora-night]').click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 390) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'qa-artifacts/combined-phone.png' }); }
});
test('simple calendar keeps upcoming event editing and tasks without duplicate recommendation cards', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.companion-card')).toHaveCount(0);
  await expect(page.getByText('A little breathing room', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Upcoming events', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-grid > .opportunities-widget')).toHaveCount(0);
  await expect(page.locator('.day-details')).not.toHaveAttribute('open');
  await expect(page.locator('.tasks-widget')).toBeVisible();
  await page.locator('.upcoming-activity').first().click(); await expect(page.locator('#activity-dialog')).toBeVisible();
});

test('sidebar collapse frees calendar space, persists, and leaves phone navigation labelled', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await ready(page);
  const before = (await page.locator('.calendar-widget').boundingBox()).width;
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await page.locator('.calendar-widget').boundingBox()).width).toBeGreaterThan(before + 100);
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.calendar-widget')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'qa-artifacts/compact-sidebar.png' });
  await page.reload(); await expect(page.locator('#startup-status')).toContainText('ready');
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-panel=calendar] .workspace-nav-label')).toBeVisible();
  await expect(page.locator('.sidebar-toggle')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.locator('[data-panel=calendar] .workspace-nav-label')).toBeVisible();
});
