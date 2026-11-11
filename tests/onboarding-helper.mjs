import { expect } from '@playwright/test';
export async function finishOnboarding(page) {
  await expect(page).toHaveURL(/onboarding\.html/);
  await page.locator('#onboarding-next').click(); await page.locator('#onboarding-next').click();
  await page.getByRole('button', { name: 'Let’s get started', exact: true }).click();
  await expect(page).toHaveURL(/dashboard\.html/);
}
