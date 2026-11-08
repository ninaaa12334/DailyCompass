import { test, expect } from '@playwright/test';

test('productivity periods update the ring, persist selection and follow task completion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') });
  await page.addInitScript(() => {
    if (localStorage.getItem('day-compass.tasks.v1')) return;
    const task = (id, date, completed) => ({ id, title: `Task ${id}`, date, completed, category: 'Study', duration: 30, priority: 'Medium', deadline: '' });
    localStorage.setItem('day-compass.tasks.v1', JSON.stringify([task('a', '2026-11-08', true), task('b', '2026-11-02', false), task('c', '2026-11-20', true)]));
  });
  await page.goto('/dashboard.html'); await expect(page.locator('#startup-status')).toHaveText('Planner ready.');
  await expect(page.locator('#task-progress')).toHaveAttribute('aria-valuenow', '100');
  await page.locator('[data-productivity-period=week]').click(); await expect(page.locator('#productivity-percent')).toHaveText('50%');
  await page.locator('[data-productivity-period=month]').click(); await expect(page.locator('#progress-value')).toHaveText('2 of 3 tasks complete'); await expect(page.locator('#productivity-percent')).toHaveText('67%');
  await page.reload(); await expect(page.locator('[data-productivity-period=month]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-task-id=a]').uncheck(); await expect(page.locator('#productivity-percent')).toHaveText('33%');
  await page.locator('[data-productivity-period=day]').click(); await expect(page.locator('#productivity-percent')).toHaveText('0%');
  await expect(page.getByText('One little plan', { exact: true })).toHaveCount(0); await expect(page.locator('#quick-entry')).toHaveCount(0);
  await page.locator('[data-productivity-period=month]').click();
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'qa-artifacts/redesign-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'qa-artifacts/redesign-phone.png' });
  await page.locator('[data-open-appearance]').click(); await page.locator('input[name=preset][value=midnight]').check(); await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark'); await page.screenshot({ path: 'qa-artifacts/redesign-dark.png' });
});
