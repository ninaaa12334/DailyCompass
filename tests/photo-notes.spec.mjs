import { test, expect } from '@playwright/test';

// A real (tiny) PNG so the browser can decode and shrink it before upload.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

test('a photo of notes becomes reviewed events and deadlines', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-26T08:00:00Z') });
  await page.setViewportSize({ width: 1280, height: 900 });
  let sent;
  await page.route('**/api/ai/photo', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { today: '2026-11-26', message: 'I found 3 test dates.', items: [
      { title: 'Maths test', date: '2026-12-03', start: '', end: '', past: false, seen: 'Maths test – Thu 3/12' },
      { title: 'Biology exam', date: '2026-12-10', start: '09:00', end: '10:30', past: false, seen: 'Bio exam 10.12 9:00–10:30' },
      { title: 'English quiz', date: '', start: '', end: '', past: false, seen: 'English quiz ??' }
    ] } });
  });
  await page.goto('/dashboard.html?demo=1'); await expect(page.locator('#startup-status')).toContainText('ready');
  await page.locator('.hub-ask-file').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('I found 3 test dates.')).toBeVisible();
  expect(sent.image).toMatch(/^data:image\/jpeg;base64,/);
  const items = page.locator('.hub-photo-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('.hub-photo-status')).toContainText('Deadline on');
  await expect(items.nth(1).locator('.hub-photo-status')).toContainText('Calendar event');
  await expect(items.nth(2).locator('.hub-photo-status')).toContainText('Couldn’t read the date');
  const add = page.locator('.hub-review .hub-primary');
  await expect(add).toBeDisabled();
  await page.waitForTimeout(500); await page.screenshot({ path: 'qa-artifacts/photo-notes-review.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await page.screenshot({ path: 'qa-artifacts/photo-notes-review-phone.png' }); await page.setViewportSize({ width: 1280, height: 900 });
  await items.nth(2).locator('input[type=date]').fill('2026-12-01');
  await items.nth(0).locator('input[type=time]').first().fill('11:00');
  await expect(add).toHaveText('Add 2 events + 1 deadline');
  await add.click();
  await expect(page.locator('.hub-toast')).toContainText('Added 2 events and 1 deadline from your photo');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('demo.day-compass.planner.v2')));
  const fromPhoto = items => items.filter(i => /photo of your notes/.test(i.notes));
  expect(fromPhoto(saved.tasks).map(t => [t.title, t.deadline])).toEqual([['English quiz', '2026-12-01']]);
  expect(fromPhoto(saved.days['2026-12-03'].commitments).map(e => [e.title, e.start, e.end])).toEqual([['Maths test', '11:00', '12:00']]);
  expect(fromPhoto(saved.days['2026-12-10'].commitments).map(e => [e.title, e.start, e.end])).toEqual([['Biology exam', '09:00', '10:30']]);
});

test('photo reading explains when the server has no AI set up', async ({ page }) => {
  await page.goto('/dashboard.html?demo=1'); await expect(page.locator('#startup-status')).toContainText('ready');
  await page.locator('.hub-ask-file').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.hub-review .hub-review-error')).toContainText(/Sign in|GEMINI_API_KEY/);
});

test('pasting an image opens the photo review', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/ai/photo', route => { calls++; return route.fulfill({ json: { today: '2026-11-26', message: 'Pasted and read.', items: [{ title: 'Physics test', date: '2026-12-05', start: '', end: '', past: false, seen: 'Physics 5/12' }] } }); });
  await page.goto('/dashboard.html?demo=1'); await expect(page.locator('#startup-status')).toContainText('ready');
  await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), data = new DataTransfer();
    data.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
    document.querySelector('.hub-ask input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, png.toString('base64'));
  await expect(page.getByText('Pasted and read.')).toBeVisible();
  await expect(page.locator('.hub-photo-item input[type=text]')).toHaveValue('Physics test');
  expect(calls).toBe(1);
});
