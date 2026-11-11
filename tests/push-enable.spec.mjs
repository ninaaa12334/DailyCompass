import { test, expect } from '@playwright/test';
import { memoryModel } from '../server/plans.mjs';

async function account(page) {
  let state = memoryModel().snapshot();
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: { push: true, pushKey: 'AQID' } } }));
  await page.route('**/api/planner', route => { if (route.request().method() === 'PUT') state = route.request().postDataJSON().state; return route.fulfill({ json: { state, version: 1 } }); });
  await page.route('**/api/reminders', route => route.fulfill({ json: [] }));
}

test('blocked permission gives actionable guidance that survives a status refresh', async ({ page }) => {
  await account(page);
  await page.addInitScript(() => Object.defineProperty(window, 'Notification', { value: class { static permission = 'denied'; static async requestPermission() { return 'denied'; } } }));
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await page.locator('#push-enable').click(); await expect(page.locator('#push-operation-status')).toContainText('Notifications are blocked');
  await expect(page.locator('#push-operation-status')).toContainText('Site settings');
  await page.locator('#reminder-refresh').click(); await expect(page.locator('#push-status')).toContainText('Permission: denied');
  await expect(page.locator('#push-operation-status')).toContainText('Notifications are blocked'); await expect(page.locator('#push-enable')).toBeEnabled();
});

test('successful enable stores the subscription and enables account background reminders', async ({ page }) => {
  await account(page);
  await page.addInitScript(() => {
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-only', toJSON() { return { endpoint: this.endpoint, keys: { auth: 'test', p256dh: 'test' } }; } };
    let subscribed = false, registered = false;
    const registration = { pushManager: { async getSubscription() { return subscribed ? subscription : null; }, async subscribe() { subscribed = true; return subscription; } } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { async register() { registered = true; return registration; }, ready: Promise.resolve(registration), async getRegistration() { return registered ? registration : null; } } });
    Object.defineProperty(window, 'Notification', { value: class { static permission = 'granted'; } });
  });
  let sent;
  await page.route('**/api/push/subscribe', route => { sent = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }); });
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.'); await page.locator('#push-enable').click();
  await expect(page.locator('#push-operation-status')).toContainText('enabled for this account and device');
  expect(sent.endpoint).toContain('fcm.googleapis.com'); await expect(page.locator('#push-status')).toContainText('This device: subscribed'); await expect(page.locator('#push-status')).toContainText('Background reminders: enabled');
});
