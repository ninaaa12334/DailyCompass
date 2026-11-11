import { test, expect } from '@playwright/test';
import { memoryModel } from '../server/plans.mjs';

test('disabled reminder times explain the state and link directly to enabling notifications', async ({ page }) => {
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('#reminder-mode')).toContainText('Notifications are off');
  await page.locator('#open-reminder-settings').click();
  await expect(page.locator('#settings-notifications')).toBeVisible(); await expect(page.locator('#push-enable')).toBeVisible();
});

test('background mode never shows the misleading open-page alerts-off message', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T18:00:00Z') });
  const model = memoryModel(); model.saveSettings({ timeZone: 'Europe/Budapest', backgroundReminders: true, remindersEnabled: false });
  model.saveActivity({ id: 'sat-test', kind: 'fixed', title: 'SAT practise', date: '2026-11-11', start: '20:45', end: '21:30', reminder: 25, category: 'Study', priority: 'Medium', notes: '', repeat: 'none', repeatUntil: '', locked: false });
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state: model.snapshot(), version: 0 } }));
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('#reminder-mode')).toContainText('Background reminders are enabled');
  await expect(page.locator('#reminder-mode')).not.toContainText('off');
  await expect(page.locator('#reminder-list')).toContainText('reminder 2026-11-11 at 20:20');
});

test('reminder lead and quiet hours save locally, persist and can be reopened from a direct link', async ({ page }) => {
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('#reminder-preferences-form')).toBeVisible();
  await page.locator('#reminder-lead').fill('30'); await page.locator('#reminder-use-quiet').uncheck();
  await page.locator('#reminder-preferences-form').getByRole('button', { name: 'Save reminder preferences' }).click();
  await expect(page.locator('#reminder-preferences-status')).toContainText('saved');
  await page.reload(); await expect(page.locator('#reminder-lead')).toHaveValue('30'); await expect(page.locator('#reminder-use-quiet')).not.toBeChecked();
  await page.locator('#reminder-use-quiet').check(); await page.locator('#reminder-quiet-start').fill('21:00'); await page.locator('#reminder-quiet-end').fill('07:30');
  await page.locator('#reminder-preferences-form').getByRole('button', { name: 'Save reminder preferences' }).click();
  await expect(page.locator('#reminder-preferences-status')).toContainText('saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('day-compass.planner.v2')).settings);
  expect(saved.reminderMinutes).toBe(30); expect(saved.quietStart).toBe('21:00'); expect(saved.quietEnd).toBe('07:30');
});

test('reminder center shows nearest upcoming first, quiet-hour warnings and honest delivery status', async ({ page }) => {
  const state = memoryModel().snapshot(); state.settings.backgroundReminders = true;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  const records = [{ title: 'Later task', due: Date.now() + 7200000, status: 'pending', quiet: true }, { title: 'Next task', due: Date.now() + 3600000, status: 'pending', quiet: false }, { title: 'Previous task', due: Date.now() - 3600000, status: 'accepted-by-push-service' }];
  await page.route('**/api/reminders', route => route.fulfill({ json: records }));
  await page.goto('/dashboard.html#notifications'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('#scheduled-reminders li').first()).toContainText('Next task');
  await expect(page.locator('#scheduled-reminders li').last()).toContainText('Will be skipped: quiet hours');
  await page.getByText('Recent attempts & changes', { exact: true }).click();
  await expect(page.locator('#notification-center')).toContainText('display not confirmed');
  records.splice(0, 2); await page.locator('#reminder-refresh').click();
  await expect(page.locator('#scheduled-reminders li')).toHaveCount(0); await expect(page.locator('#reminder-center-status')).toContainText('No upcoming reminders');
});
