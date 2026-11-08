import { test, expect } from '@playwright/test';
const date = '2026-11-08';
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') });
});
async function ready(page) {
  await page.goto('/dashboard.html');
  await expect(page.locator('#startup-status')).toContainText('Planner ready');
  await expect(page.locator('#startup-error')).toBeHidden();
}
async function add(page, title, type = 'fixed', values = {}) {
  await page.locator('#calendar-add').click();
  await page.locator('#activity-kind').selectOption(type);
  await page.locator('#activity-title').fill(title);
  await page.locator('#activity-date').fill(values.date || date);
  if (type === 'fixed') {
    await page.locator('#activity-start').fill(values.start || '10:00');
    await page.locator('#activity-end').fill(values.end || '11:00');
  } else {
    await page.locator('#activity-duration').fill(String(values.duration || 60));
    await page.locator('#activity-deadline').fill(values.deadline || date);
  }
  await page.locator('#save-activity').click();
  await expect(page.locator('#activity-dialog')).toBeHidden();
}
async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('day-compass.planner.v2'))); }

test('first visit resolves loading, all views navigate, slot creation and keyboard work', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('#now-heading')).toHaveText('A little breathing room');
  await expect(page.locator('.time-day-column')).toHaveCount(7);
  await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('.time-day-column')).toHaveCount(1);
  const slot = page.locator('.time-slot[data-hour="9"]');
  await slot.focus(); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#activity-dialog')).toBeVisible();
  await expect(page.locator('#activity-date')).toHaveValue('2026-11-09');
  await expect(page.locator('#activity-start')).toHaveValue('09:00');
  await page.keyboard.press('Escape');
  await page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.locator('.month-cell')).toHaveCount(42);
  await page.locator('#next-period').click(); await page.locator('#next-period').click();
  await expect(page.locator('#calendar-month')).toContainText('January 2027');
  await page.locator('#previous-period').click();
  await page.locator('.calendar-day[data-date="2026-12-31"]').click();
  await expect(page.locator('#selected-day')).toContainText('Dec 31');
  await page.locator('#calendar-today').click();
  await expect(page.locator('#selected-day')).toContainText('Nov 8');
  await page.reload(); await expect(page.getByRole('group', { name: 'Calendar view' }).getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('existing data migrates without loss, CRUD, conflicts, completion, deletion undo, and reload', async ({ page }) => {
  const legacy = [{ id: 'legacy', title: 'Old task', category: 'Study', duration: 30, priority: 'Medium', deadline: date, completed: false }];
  await page.addInitScript(value => localStorage.setItem('day-compass.tasks.v1', JSON.stringify(value)), legacy);
  await ready(page); await expect(page.locator('#task-list')).toContainText('Old task');
  await add(page, 'School', 'fixed', { start: '10:00', end: '12:00' });
  await page.locator('#calendar-add').click(); await page.locator('#activity-title').fill('Conflict');
  await page.locator('#activity-start').fill('11:00'); await page.locator('#activity-end').fill('13:00'); await page.locator('#save-activity').click();
  await expect(page.locator('#activity-error')).toContainText('overlap'); await page.keyboard.press('Escape');
  await page.locator('.week-event').filter({ hasText: 'School' }).click();
  await page.locator('#activity-date').fill('2026-11-09'); await page.locator('#save-activity').click();
  expect((await saved(page)).days[date].commitments).toHaveLength(0);
  await page.locator('.week-event').filter({ hasText: 'School' }).click();
  await page.locator('#complete-activity').click();
  expect((await saved(page)).days['2026-11-09'].commitments[0].completed).toBe(true);
  await page.locator('.week-event').filter({ hasText: 'School' }).click(); await page.locator('#delete-activity').click();
  await page.locator('#undo-action').click();
  expect((await saved(page)).days['2026-11-09'].commitments).toHaveLength(1);
  await page.reload(); await expect(page.locator('#startup-status')).toContainText('ready');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('day-compass.tasks.v1')))).toEqual(legacy);
});

test('fixed events and flexible tasks generate preview, apply, cancel, lock, replan, and undo', async ({ page }) => {
  await ready(page);
  await add(page, 'School', 'fixed', { start: '10:00', end: '12:00' });
  await add(page, 'Algebra', 'task', { duration: 90 });
  await page.locator('#generate-day').click(); await expect(page.locator('#plan-preview')).toContainText('12:00');
  expect((await saved(page)).plans[date]).toBeUndefined();
  await page.keyboard.press('Escape'); expect((await saved(page)).plans[date]).toBeUndefined();
  await page.locator('#generate-day').click(); await page.locator('#apply-plan').click();
  const first = (await saved(page)).plans[date].find(item => item.kind === 'task'); expect(first.end).toBe('13:30');
  await page.locator('.week-event').filter({ hasText: 'Algebra' }).click(); await page.locator('#lock-activity').click();
  await page.locator('#replan-day').click(); await expect(page.locator('#plan-preview')).toContainText('[locked]'); await page.locator('#apply-plan').click();
  expect((await saved(page)).plans[date].find(item => item.taskId === first.taskId && item.kind === 'task').start).toBe(first.start);
  await page.locator('#undo-action').click();
  await page.reload(); await expect(page.locator('#startup-error')).toBeHidden();
  await expect(page.locator('.week-event').filter({ hasText: 'Algebra' })).toHaveCount(1);
});

test('module failures and corrupt saved data show retry and preserve the raw data', async ({ page }) => {
  await page.route('**/app.js', route => route.abort());
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-error')).toBeVisible();
  await expect(page.locator('#now-heading')).toHaveText('Planner unavailable');
  await page.unroute('**/app.js'); await page.locator('#retry-startup').click();
  await expect(page.locator('#startup-status')).toContainText('ready');
  await page.evaluate(() => localStorage.setItem('day-compass.planner.v2', 'unreadable'));
  await page.reload(); await expect(page.locator('#startup-error')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('day-compass.planner.v2'))).toBe('unreadable');
  const download = page.waitForEvent('download'); await page.locator('#export-backup').click(); expect((await download).suggestedFilename()).toBe('day-compass-backup.json');
});

test('recurrence creates dated instances and one-occurrence editing leaves the series intact', async ({ page }) => {
  await ready(page); await page.locator('#calendar-add').click();
  await page.locator('#activity-title').fill('Weekly practice'); await page.locator('#activity-start').fill('16:00'); await page.locator('#activity-end').fill('17:00');
  await page.locator('#activity-repeat').selectOption('weekly'); await page.locator('#activity-until').fill('2026-11-22'); await page.locator('#save-activity').click();
  let state = await saved(page); expect(Object.values(state.days).flatMap(day => day.commitments)).toHaveLength(3);
  await page.locator('.week-event').filter({ hasText: 'Weekly practice' }).click();
  await expect(page.locator('#series-controls')).toBeVisible(); await page.locator('#activity-title').fill('One exception'); await page.locator('#save-activity').click();
  state = await saved(page); expect(state.days[date].commitments[0].title).toBe('One exception'); expect(state.days['2026-11-15'].commitments[0].title).toBe('Weekly practice');
});

test('reminders update after moves and cancel on completion without duplicate alerts', async ({ page }) => {
  await ready(page); await add(page, 'Meeting', 'fixed', { start: '09:10', end: '09:40' });
  await page.locator('[data-panel=settings]').click(); await page.locator('#open-planning-settings').click(); await page.locator('[name="remindersEnabled"]').check(); await page.locator('#planning-form button[type="submit"]').click(); await page.locator('[data-panel=day]').click();
  await page.clock.runFor(15000); await expect(page.locator('#reminder-alert')).toContainText('Meeting');
  expect(Object.keys((await saved(page)).reminderLog)).toHaveLength(1);
  await page.locator('.week-event').filter({ hasText: 'Meeting' }).click(); await page.locator('#activity-start').fill('09:20'); await page.locator('#activity-end').fill('09:50'); await page.locator('#save-activity').click();
  await expect(page.locator('#reminder-alert')).toBeEmpty(); await expect(page.locator('#reminder-list')).toContainText('09:20');
  await page.clock.runFor(10 * 60 * 1000); await expect(page.locator('#reminder-alert')).toContainText('09:20');
  expect(Object.keys((await saved(page)).reminderLog)).toHaveLength(2);
  await page.clock.runFor(15000); expect(Object.keys((await saved(page)).reminderLog)).toHaveLength(2);
  await page.locator('.week-event').filter({ hasText: 'Meeting' }).click(); await page.locator('#complete-activity').click();
  await expect(page.locator('#reminder-list')).not.toContainText('Meeting'); await expect(page.locator('#reminder-alert')).toBeEmpty();
});

test('mobile day view and dialogs fit without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  await expect(page.locator('.time-day-column')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#calendar-add').click(); await expect(page.locator('#activity-dialog')).toBeVisible();
  expect(await page.locator('#activity-dialog').evaluate(node => node.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'qa-artifacts/mobile-form.png', fullPage: true });
  await page.keyboard.press('Escape'); await expect(page.locator('#calendar-add')).toBeFocused();
});

test('an overfull day keeps tasks visible with an honest unscheduled reason', async ({ page }) => {
  await ready(page);
  await add(page, 'Booked all day', 'fixed', { start: '08:00', end: '20:00' });
  await add(page, 'Cannot fit', 'task', { duration: 45 });
  await page.locator('#generate-day').click();
  await expect(page.locator('#plan-preview')).toContainText('Not placed: Cannot fit');
  await expect(page.locator('#plan-preview')).toContainText('No remaining slot fits');
  await page.locator('#apply-plan').click();
  await expect(page.locator('#task-list')).toContainText('Cannot fit');
  await expect(page.locator('#free-minutes')).toHaveText('0');
  await page.reload(); await expect(page.locator('#day-unscheduled')).toContainText('Cannot fit');
});

test('configured timezone persists and notification denial keeps in-app reminders available', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { value: class { static permission = 'denied'; static async requestPermission() { return 'denied'; } }, configurable: true });
  });
  await ready(page); await add(page, 'Morning', 'fixed', { start: '08:00', end: '09:00' });
  await page.locator('[data-panel=settings]').click(); await page.locator('#open-planning-settings').click();
  await page.locator('#planning-zone').fill('UTC');
  await page.locator('#enable-notifications').click();
  await expect(page.locator('#notification-status')).toContainText('In-app reminders remain available');
  await page.locator('#planning-form button[type="submit"]').click(); await page.locator('[data-panel=day]').click();
  await expect(page.locator('#now-heading')).toHaveText('Morning');
  await page.reload(); await expect(page.locator('#dashboard-date')).toContainText('UTC');
  await expect(page.locator('#now-heading')).toHaveText('Morning');
});

test('a stalled module request times out to a retry state instead of endless loading', async ({ page }) => {
  await page.route('**/app.js', () => {});
  await page.goto('/dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.clock.runFor(11000);
  await expect(page.locator('#startup-error')).toBeVisible();
  await expect(page.locator('#startup-detail')).toContainText('too long');
  await expect(page.locator('#retry-startup')).toBeEnabled();
});
