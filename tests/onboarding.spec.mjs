import { test, expect } from '@playwright/test';
import { memoryModel } from '../server/plans.mjs';

for (const width of [360, 390, 1440]) test(`new account setup precedes calendar, saves choices and fits ${width}px`, async ({ page, browser }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/auth.html');
  const name = `welcome_${Date.now()}_${width}`;
  const response = await page.request.post('/api/register', { headers: { Origin: 'http://127.0.0.1:8081' }, data: { name, password: 'test-password-long', timeZone: 'Europe/Budapest' } });
  expect((await response.json()).onboardingRequired).toBe(true);
  await page.goto('/dashboard.html'); await expect(page).toHaveURL(/onboarding\.html/);
  await page.locator('input[name=theme][value=aurora-night]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora-night');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `qa-artifacts/onboarding-${width}.png`, fullPage: true });
  await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-start').fill('09:00'); await page.locator('#onboarding-end').fill('08:00');
  await page.locator('#onboarding-next').click(); await expect(page.locator('#onboarding-error')).toContainText('after the start');
  await page.locator('#onboarding-end').fill('19:00'); await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-reminder').fill('15');
  await page.getByRole('button', { name: 'Let’s get started' }).click();
  await expect(page).toHaveURL(/dashboard\.html\?welcome=1/); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('.welcome-connections')).toBeVisible();
  await expect(page.locator('.welcome-connections a')).toHaveAttribute('href', 'dashboard.html#connections');
  const doc = await (await page.request.get('/api/planner')).json();
  expect(doc.state.settings.onboardingComplete).toBe(true); expect(doc.state.settings.appearance.preset).toBe('aurora-night');
  expect(doc.state.settings.planningStart).toBe('09:00'); expect(doc.state.settings.reminderMinutes).toBe(15); expect(doc.state.settings.backgroundReminders).not.toBe(true);
  await page.getByRole('button', { name: 'Not now', exact: true }).click(); await expect(page.locator('.welcome-connections')).toHaveCount(0);
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'aurora-night');
  if (width === 1440) {
    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:8081' }); await other.addCookies(await page.context().cookies());
    const fresh = await other.newPage(); await fresh.goto('/dashboard.html'); await expect(fresh.locator('#startup-status')).toHaveText('Planner ready.'); await expect(fresh.locator('html')).toHaveAttribute('data-theme', 'aurora-night'); await other.close();
  }
});

test('unfinished Google account setup handles save conflicts without opening the planner or requesting notifications', async ({ page }) => {
  const state = memoryModel().snapshot(); state.settings.onboardingComplete = false;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'new-google', name: 'New Google user' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  let saved;
  await page.route('**/api/planner', route => route.request().method() === 'PUT' ? (saved = route.request().postDataJSON(), route.fulfill({ status: 409, json: { error: 'Changed' } })) : route.fulfill({ json: { state, version: 0 } }));
  await page.goto('/onboarding.html');
  await page.locator('#onboarding-next').click(); await page.locator('#onboarding-next').click(); await page.locator('#onboarding-next').click();
  await expect(page.locator('#onboarding-error')).toContainText('not been overwritten'); await expect(page).toHaveURL(/onboarding\.html/);
  expect(saved.state.settings.onboardingComplete).toBe(true); expect(saved.state.settings.backgroundReminders).not.toBe(true);
});

test('existing accounts bypass setup and retain scheduled notification preferences', async ({ page }) => {
  const state = memoryModel().snapshot(); state.settings.backgroundReminders = true; state.settings.reminderMinutes = 30;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'existing', name: 'Existing' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.'); await expect(page).toHaveURL(/dashboard\.html/);
  await page.goto('/onboarding.html'); await expect(page).toHaveURL(/dashboard\.html/);
});
