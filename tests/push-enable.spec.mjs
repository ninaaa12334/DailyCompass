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

test('unavailable push service offers an explicit page-open fallback that fires without a subscription', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T18:00:00Z') });
  const model = memoryModel(); model.saveSettings({ timeZone: 'Europe/Budapest', backgroundReminders: true, remindersEnabled: false });
  model.saveActivity({ id: 'event', kind: 'fixed', title: 'Future activity', date: '2026-11-11', start: '19:02', end: '19:30', reminder: 1, category: 'Study', priority: 'Medium', notes: '', repeat: 'none', repeatUntil: '', locked: false });
  let state = model.snapshot(), subscriptions = 0;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: { push: true, pushKey: 'AQID' } } }));
  await page.route('**/api/planner', route => { if (route.request().method() === 'PUT') state = route.request().postDataJSON().state; return route.fulfill({ json: { state, version: 1 } }); });
  await page.route('**/api/push/subscribe', route => { subscriptions++; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/reminders', route => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    globalThis.testNotifications = [];
    const registration = { pushManager: { async getSubscription() { return null; }, async subscribe() { throw new Error('Registration failed - push service not available'); } } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { async register() { return registration; }, ready: Promise.resolve(registration), async getRegistration() { return registration; } } });
    Object.defineProperty(window, 'Notification', { value: class { static permission = 'granted'; constructor(title, options) { globalThis.testNotifications.push({ title, options }); } close() {} } });
  });
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await page.locator('#push-enable').click(); await expect(page.locator('#push-operation-status')).toContainText('cannot use its push service');
  await expect(page.locator('#push-operation-status')).toContainText('normal Chrome or Edge');
  await page.locator('#push-open-page-fallback').click(); await expect(page.locator('#push-operation-status')).toContainText('not background push');
  expect(state.settings.remindersEnabled).toBe(true); expect(subscriptions).toBe(0);
  await page.clock.runFor(60000);
  expect(await page.evaluate(() => globalThis.testNotifications.length)).toBe(1);
  await expect(page.locator('#reminder-alert')).toContainText('Future activity');
});
