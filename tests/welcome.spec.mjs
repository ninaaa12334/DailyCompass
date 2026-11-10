import { test, expect } from '@playwright/test';

test('landing preview changes activity visuals and lets the user pause motion', async ({ page }) => {
  await page.goto('/index.html'); await expect(page.locator('#sample-title')).toHaveText('Football practice');
  await page.locator('[data-scene-choice=study]').click(); await expect(page.locator('#sample-title')).toHaveText('A little maths practice'); await expect(page.locator('.scene-study')).toBeVisible(); await expect(page.locator('.scene-ball')).toBeHidden();
  await page.locator('[data-scene-choice=rest]').click(); await expect(page.locator('#sample-row-title')).toHaveText('A moment for yourself'); await expect(page.locator('.scene-rest')).toBeVisible();
  await page.locator('#toggle-motion').click(); await expect(page.locator('body')).toHaveAttribute('data-motion', 'paused'); await page.reload(); await expect(page.locator('#toggle-motion')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.screenshot({ path: 'qa-artifacts/welcome-desktop.png' });
});
for (const width of [360, 390, 430]) test(`landing navigation and example cards fit ${width}px phone screens`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await page.goto('/index.html');
  const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ element: el.className?.baseVal || el.className || el.tagName, right: Math.round(el.getBoundingClientRect().right) })));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), JSON.stringify(overflow)).toBe(true);
  for (const name of ['football', 'study', 'rest']) { await page.locator(`[data-scene-choice=${name}]`).click(); const box = await page.locator('.sample-day-card').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); }
  if (width === 390) { await page.locator('[data-scene-choice=football]').click(); await page.screenshot({ path: 'qa-artifacts/welcome-phone.png', fullPage: true }); }
});
test('landing respects reduced motion and keeps real signup and demo destinations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/index.html');
  await expect(page.locator('#toggle-motion')).toBeDisabled(); expect(await page.locator('.flow-orbit').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await expect(page.getByRole('link', { name: 'Find my flow' })).toHaveAttribute('href', 'auth.html?mode=signup');
  await expect(page.getByRole('link', { name: 'Take a little look' })).toHaveAttribute('href', 'dashboard.html?demo=1');
});
