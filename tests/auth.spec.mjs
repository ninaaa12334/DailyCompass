import { test, expect } from '@playwright/test';
import { finishOnboarding } from './onboarding-helper.mjs';

test('welcome links open real signup and login pages, with no obsolete account notice', async ({ page }) => {
  await page.goto('/index.html'); await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await expect(page.locator('#account-confirm')).toBeVisible(); await expect(page.locator('#account-password')).toHaveAttribute('autocomplete', 'new-password');
  await page.locator('[data-auth-mode=login]').click(); await expect(page.locator('#confirm-password-field')).toBeHidden(); await expect(page.locator('#account-password')).toHaveAttribute('autocomplete', 'current-password');
  await page.locator('#google-signin').click(); await expect(page.locator('#auth-error')).toContainText('GOOGLE_CLIENT_ID');
});
test('signup confirms password and creates a persistent account that can log in later', async ({ page }) => {
  const name = `signup_${Date.now()}`;
  await page.goto('/auth.html?mode=signup'); await page.locator('#account-name').fill(name); await page.locator('#account-password').fill('a-good-test-password'); await page.locator('#account-confirm').fill('does-not-match'); await page.locator('#account-submit').click();
  expect(await page.locator('#account-confirm').evaluate(input => input.validity.customError)).toBe(true);
  await page.locator('#account-confirm').fill('a-good-test-password'); await page.locator('#account-submit').click(); await finishOnboarding(page); await expect(page.locator('#planner-mode')).toContainText(name);
  await page.locator('[data-panel=settings]').click(); await page.locator('[data-settings-view=account]').click(); await page.locator('#account-logout').click(); await expect(page.locator('#planner-mode')).toContainText('Local planner');
  await page.goto('/auth.html?mode=login'); await page.locator('#account-name').fill(name); await page.locator('#account-password').fill('a-good-test-password'); await page.locator('#account-submit').click(); await expect(page.locator('#planner-mode')).toContainText(name);
});
for (const width of [360, 390, 430]) test(`account forms fit ${width}px phone screens`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await page.goto('/auth.html?mode=signup');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const element of ['#google-signin', '#account-submit']) expect((await page.locator(element).boundingBox()).height).toBeGreaterThanOrEqual(44);
  if (width === 390) await page.screenshot({ path: 'qa-artifacts/signup-phone.png', fullPage: true });
});
