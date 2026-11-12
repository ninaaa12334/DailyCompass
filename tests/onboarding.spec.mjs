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
  const state = memoryModel().snapshot(); state.settings.onboardingComplete = true; state.settings.backgroundReminders = true; state.settings.reminderMinutes = 30;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'existing', name: 'Existing' }, features: {} } }));
  await page.route('**/api/planner', route => route.fulfill({ json: { state, version: 0 } }));
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.'); await expect(page).toHaveURL(/dashboard\.html/);
  await page.goto('/onboarding.html'); await expect(page).toHaveURL(/dashboard\.html/);
});

test('existing account can revisit setup, choose soft palettes and keep saved tasks', async ({ page }) => {
  const model = memoryModel();
  model.saveSettings({ onboardingComplete: true, backgroundReminders: true, reminderMinutes: 25 });
  model.saveActivity({ id: 'keep-me', kind: 'task', date: '', title: 'Existing project', deadline: '2026-12-20', duration: 30, spent: 0, category: 'Study', priority: 'Medium', notes: '', repeat: 'none', repeatUntil: '', reminder: 'default', locked: false });
  let state = model.snapshot();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'returning', name: 'Returning user' }, features: {} } }));
  await page.route('**/api/planner', async route => {
    if (route.request().method() === 'PUT') state = route.request().postDataJSON().state;
    await route.fulfill({ json: { state, version: 1 } });
  });
  await page.goto('/onboarding.html?edit=1');
  await page.locator('input[name=theme][value=linen]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'linen');
  await page.screenshot({ path: 'qa-artifacts/welcome-setup-linen-desktop.png', fullPage: true });
  await page.locator('input[name=theme][value=dusk]').check();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.screenshot({ path: 'qa-artifacts/welcome-setup-dusk-desktop.png', fullPage: true });
  await page.locator('#onboarding-next').click(); await page.locator('#onboarding-next').click(); await page.locator('#onboarding-next').click();
  await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  expect(state.settings.appearance.preset).toBe('dusk'); expect(state.tasks[0].title).toBe('Existing project'); expect(state.settings.backgroundReminders).toBe(true);
  await page.screenshot({ path: 'qa-artifacts/workspace-dusk-desktop.png', fullPage: true });
});

test('older account with no completion marker must finish setup before opening calendar', async ({ page }) => {
  const model = memoryModel();
  model.saveActivity({ id: 'existing', kind: 'task', title: 'Keep this task', date: '', deadline: '2026-12-20', duration: 30, spent: 0, category: 'Study', priority: 'Medium', notes: '', reminder: 'default', repeat: 'none', repeatUntil: '', locked: false });
  let state = model.snapshot(); delete state.settings.onboardingComplete;
  await page.route('**/api/session', route => route.fulfill({ json: { user: { id: 'legacy', name: 'Legacy' }, features: {} } }));
  await page.route('**/api/planner', async route => { if (route.request().method() === 'PUT') state = route.request().postDataJSON().state; await route.fulfill({ json: { state, version: 1 } }); });
  await page.goto('/dashboard.html#calendar-heading'); await expect(page).toHaveURL(/onboarding.html/);
  await expect(page.locator('#onboarding-themes')).toBeVisible();
  await page.locator('input[name=theme][value=pistachio]').check(); await page.locator('#onboarding-next').click();
  await page.locator('#onboarding-zone').fill('UTC'); await expect(page.locator('#onboarding-zone-preview')).toContainText('Does that match your local time');
  await page.locator('#onboarding-next').click(); await page.locator('#onboarding-interests').fill('School, football');
  await page.locator('#onboarding-next').click(); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  expect(state.settings.onboardingComplete).toBe(true); expect(state.settings.timeZone).toBe('UTC'); expect(state.settings.interests).toBe('School, football'); expect(state.tasks[0].title).toBe('Keep this task');
  await page.reload(); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
});
