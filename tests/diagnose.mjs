import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('console', message => { if (message.type() === 'error') console.log('CONSOLE:', message.text()); });
  await page.goto('http://127.0.0.1:8080/dashboard.html?demo=1');
  await page.waitForTimeout(1000);
  console.log('NOW:', await page.locator('#now-heading').textContent());
  console.log('CALENDAR:', await page.locator('#calendar-month').textContent());
  console.log('GRID CHILDREN:', await page.locator('#week-grid > *').count());
  await page.screenshot({ path: 'qa-artifacts/before.png', fullPage: true });
} finally { await browser.close(); }
