import { test, expect } from '@playwright/test';

async function ready(page) { await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.'); }
async function setup(page) {
  await page.locator('#availability-open').click();
  const f = page.locator('#availability-form');
  await f.locator('[name=planningStart]').fill('08:00'); await f.locator('[name=planningEnd]').fill('20:00'); await f.locator('[name=travelMinutes]').fill('15');
  await page.locator('#routine-meal').click(); await page.locator('#availability-form').getByRole('button', { name: 'Save my availability', exact: true }).click();
  await expect(page.locator('#availability-dialog')).toBeHidden();
}
for (const width of [360, 390, 430]) test(`assistant tabs, setup, and welcome fit ${width}px phone screens`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await ready(page); await setup(page);
  await expect(page.locator('#availability-summary')).toContainText('minutes free');
  for (const panel of ['ai', 'settings', 'day']) {
    await page.locator(`[data-panel=${panel}]`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator('.assistant-tabs button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    if (width === 390) await page.screenshot({ path: `qa-artifacts/assistant-${panel}.png`, fullPage: true });
  }
  await page.goto('/index.html'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('setup routines persist and kept-free periods can be released', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') }); await ready(page); await setup(page);
  await expect(page.locator('#day-commitments')).toContainText('Meal break');
  const before = await page.locator('#availability-summary').textContent();
  await page.locator('#opportunity-list').getByRole('button', { name: 'Keep it free' }).first().click();
  await expect(page.locator('#opportunity-list')).toContainText('intentionally kept free');
  await page.getByRole('button', { name: 'Release kept-free period' }).click(); await expect(page.locator('#availability-summary')).toHaveText(before);
  await page.reload(); await expect(page.locator('#availability-summary')).toContainText('minutes free');
});
test('real account sign-in persists private planner, imports local data explicitly, and sign-out restores local mode', async ({ page }) => {
  await ready(page); await page.locator('#calendar-add').click(); await page.locator('#activity-title').fill('My local task'); await page.locator('#activity-start').fill('16:00'); await page.locator('#activity-end').fill('16:45'); await page.locator('#save-activity').click();
  await page.locator('[data-panel=settings]').click(); const username = `qa_${Date.now()}`;
  await page.locator('#account-name').fill(username); await page.locator('#account-password').fill('this-is-a-test-password'); await page.locator('#account-confirm').fill('this-is-a-test-password'); await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('#planner-mode')).toContainText(username); await expect(page.locator('#day-commitments')).not.toContainText('My local task');
  await page.locator('[data-panel=settings]').click(); await page.locator('#account-import').click(); await expect(page.locator('#account-message')).toContainText('Copied');
  await page.locator('[data-panel=day]').click(); await expect(page.locator('#day-commitments')).toContainText('My local task');
  await page.reload(); await expect(page.locator('#day-commitments')).toContainText('My local task');
  await page.locator('[data-panel=ai]').click(); await expect(page.locator('#ai-connection')).toContainText('disconnected');
  await page.locator('[data-panel=settings]').click(); await page.locator('[data-connect=gmail]').click(); await expect(page.locator('#connection-message')).toContainText('disconnected');
  await page.locator('#push-enable').click(); await expect(page.locator('#push-status')).toContainText('VAPID');
  await page.locator('#account-logout').click(); await expect(page.locator('#planner-mode')).toHaveText('Local planner · Saved in this browser'); await expect(page.locator('#day-commitments')).toContainText('My local task');
});
test('AI review edits, rejects and approves selected activities without saving the preview', async ({ page }) => {
  // Provider responses are mocked explicitly; UI approval is still exercised.
  const state = { version: 2, revision: 0, tasks: [], days: {}, plans: {}, unscheduled: {}, settings: { timeZone: 'Europe/Budapest', planningStart: '08:00', planningEnd: '20:00', sleepStart: '23:00', sleepEnd: '07:00', breakMinutes: 5, remindersEnabled: false, reminderMinutes: 10, quietStart: '22:00', quietEnd: '07:00' }, reminderLog: {}, undo: null };
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'test', name: 'Test' }, features: { ai: true } } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  let previewRequest;
  await page.route('**/api/ai/preview', route => { previewRequest = route.request().postDataJSON(); return route.fulfill({ json: previewRequest.prompt === 'Math from 5 to 6' ? { clarification: 'Do you mean am or pm?', activities: [] } : { date: '2026-11-08', start: '14:00', end: '18:00', version: 0, activities: [{ title: 'Read', start: '15:00', end: '15:30', taskId: null, reason: 'Fits your available gap.' }, { title: 'Rest', start: '16:00', end: '16:30', taskId: null, reason: 'Leave room to rest.' }] } }); });
  let accepted = null; await page.route('**/api/ai/accept', async route => { accepted = route.request().postDataJSON(); await route.fulfill({ json: { state, version: 1 } }); });
  await ready(page); await page.locator('[data-panel=ai]').click(); await page.locator('#ai-prompt').fill('Math from 5 to 6'); await page.locator('#ai-generate').click();
  await expect(page.locator('#ai-status')).toContainText('am or pm'); await expect(page.locator('#ai-review')).toBeHidden();
  await page.locator('#ai-prompt').fill('Plan some reading and rest.'); await page.locator('#ai-generate').click();
  expect(previewRequest).not.toHaveProperty('date'); expect(previewRequest).not.toHaveProperty('start'); expect(previewRequest).not.toHaveProperty('end');
  await expect(page.locator('#ai-form input[type=date], #ai-form input[type=time]')).toHaveCount(0);
  await expect(page.locator('#ai-interpretation')).toContainText('14:00');
  await expect(page.locator('#ai-review')).toBeVisible(); expect(accepted).toBeNull(); await page.locator('#ai-reject').click(); await expect(page.locator('#ai-review')).toBeHidden();
  await page.locator('#ai-generate').click(); await page.locator('#ai-proposals [name=title]').first().fill('Read my book'); await page.locator('#ai-proposals [name=include]').nth(1).uncheck(); await page.locator('#ai-review').getByRole('button', { name: 'Approve selected activities' }).click();
  await expect(page.locator('#ai-status')).toContainText('Approved'); expect(accepted.activities).toHaveLength(1); expect(accepted.activities[0].title).toBe('Read my book');
});
