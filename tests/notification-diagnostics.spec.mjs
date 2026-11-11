import { test, expect } from '@playwright/test';
import { memoryModel } from '../server/plans.mjs';

async function setup(page) {
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: { push: true } } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state: memoryModel().snapshot(), version: 0 } }));
  await page.route('**/api/reminders', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    globalThis.popupRequests = [];
    const registration = { async update() {}, async showNotification(title, options) { globalThis.popupRequests.push({ title, options }); }, pushManager: { async getSubscription() { return { endpoint: 'https://fcm.googleapis.com/fcm/send/test' }; } } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { async register() { return registration; }, async getRegistration() { return registration; } } });
    Object.defineProperty(window, 'Notification', { value: class { static permission = 'granted'; static requestPermission() { throw new Error('Permission must not be changed'); } } });
  });
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
}

test('direct popup test bypasses push requests and reports only browser API acceptance', async ({ page }) => {
  let pushRequests = 0; await page.route('**/api/push/test', route => { pushRequests++; return route.abort(); });
  await setup(page); await page.locator('#notification-display-test').click();
  await expect(page.locator('#notification-display-status')).toContainText('bypassing the push service');
  await expect(page.locator('#notification-display-status')).toContainText('does not prove a popup appeared');
  expect(pushRequests).toBe(0); expect(await page.evaluate(() => globalThis.popupRequests.length)).toBe(1);
});

test('background test distinguishes a browser display report from confirmed Windows display', async ({ page }) => {
  await page.route('**/api/push/test', route => route.fulfill({ json: { acceptedByPushService: true, testKey: 'a'.repeat(64), deviceDeliveryConfirmed: false } }));
  await page.route('**/api/push/test/status**', route => route.fulfill({ json: { browserReceived: true, displayRequested: true, displayError: null, deviceDeliveryConfirmed: false } }));
  await setup(page); await page.locator('#push-test').click();
  await expect(page.locator('#push-test-status')).toContainText('Browser receipt confirmed');
  await expect(page.locator('#push-test-status')).toContainText('does not confirm you saw a popup');
  expect(await page.evaluate(() => globalThis.popupRequests.length)).toBe(0);
});
