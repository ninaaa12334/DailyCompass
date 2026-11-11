import { test, expect } from '@playwright/test';
import { memoryModel } from '../server/plans.mjs';

for (const width of [360, 390, 1440]) test(`settings sections stay organized at ${width}px and explain missing setup`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await page.locator('[data-panel=settings]').click();
  for (const id of ['calendar', 'notifications', 'account', 'privacy', 'planning']) {
    await page.locator(`[data-settings-view=${id}]`).click();
    await expect(page.locator('[data-settings-section]:visible')).toHaveCount(1);
    await expect(page.locator(`[data-settings-view=${id}]`)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('[data-settings-view=calendar]').click();
  await expect(page.locator('#ical-form')).toBeVisible();
  if (width === 1440) await page.screenshot({ path: 'qa-artifacts/private-calendar-setup.png', fullPage: true });
  await page.getByText('Advanced: Google OAuth connection (Google Cloud required)', { exact: true }).click();
  await expect(page.locator('#connections')).toContainText('Server setup needed');
  await page.locator('#google-setup-help summary').click(); await expect(page.locator('#google-redirect-uri')).toHaveText('http://127.0.0.1:8081/api/google/callback');
  await page.locator('[data-settings-view=notifications]').click(); await page.locator('#push-setup-help summary').click();
  await expect(page.locator('#push-setup-help')).toContainText('npm.cmd run setup:push');
  await expect(page.locator('#push-test')).toBeVisible();
  await page.screenshot({ path: `qa-artifacts/settings-${width}.png`, fullPage: true });
});

test('private calendar connection submits once, clears the secret field and supports refresh and disconnect', async ({ page }) => {
  const state = memoryModel().snapshot(); let connected = false, calls = [];
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  await page.route('**/api/ical/status', route => route.fulfill({ json: { connected, lastSync: connected ? '2026-11-11T12:00:00Z' : null } }));
  await page.route('**/api/ical/sync', route => { calls.push(route.request().postDataJSON()); connected = true; return route.fulfill({ json: { state, version: 1 } }); });
  await page.route('**/api/ical/disconnect', route => { connected = false; return route.fulfill({ json: { state, version: 2 } }); });
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await page.locator('[data-panel=settings]').click(); await page.locator('[data-settings-view=calendar]').click();
  const url = 'https://calendar.google.com/calendar/ical/test%40example.com/private-test123/basic.ics';
  await page.locator('#ical-url').fill(url); await page.locator('#ical-connect').click();
  await expect(page.locator('#ical-status')).toContainText('Connected (read-only)'); await expect(page.locator('#ical-url')).toBeEmpty();
  expect(calls).toEqual([{ url }]);
  expect(await page.evaluate(url => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(value => value.includes(url)), url)).toBe(false);
  await page.locator('#ical-refresh').click(); await expect(page.locator('#ical-status')).toContainText('Connected (read-only)'); expect(calls).toEqual([{ url }, {}]);
  await page.locator('#ical-disconnect').click(); await expect(page.locator('#ical-status')).toContainText('No private calendar link');
});

test('test notification targets this device and reports acceptance without claiming delivery', async ({ page }) => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/test-only';
  await page.addInitScript(endpoint => Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint }) } }) } }), endpoint);
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: { push: true } } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state: memoryModel().snapshot(), version: 0 } }));
  let target;
  await page.route('**/api/push/test', route => { target = route.request().postDataJSON(); return route.fulfill({ json: { acceptedByPushService: true, deviceDeliveryConfirmed: false } }); });
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await page.locator('[data-panel=settings]').click(); await page.locator('[data-settings-view=notifications]').click(); await page.locator('#push-test').click();
  expect(target).toEqual({ endpoint }); await expect(page.locator('#push-test-status')).toContainText('not proof of delivery');
});
