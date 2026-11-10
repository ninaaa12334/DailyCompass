import { test, expect } from '@playwright/test';
const origin = 'https://test-app.clerk.accounts.dev';
async function provider(page) { await page.route('**/api/auth/provider', route => route.fulfill({ json: { provider: 'clerk', frontendOrigin: origin, publishableKey: 'pk_test_mock' } })); }
test('Google button uses Clerk when configured and mounts its real SDK component boundary', async ({ page }) => {
  await provider(page);
  await page.route(`${origin}/npm/@clerk/ui@1/dist/ui.browser.js`, route => route.fulfill({ contentType: 'application/javascript', body: 'window.__internal_ClerkUICtor = function(){};' }));
  await page.route(`${origin}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.Clerk = { load: async () => {}, session: null, mountSignIn: (root, options) => { root.textContent = 'Mock Clerk sign-in'; window.testRedirect = options.forceRedirectUrl; } };` }));
  // The test server deliberately has no real Clerk keys; add the configured CSP
  // only to this isolated page so the mocked SDK can exercise our frontend wiring.
  await page.route('**/clerk-signin.html', async route => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': `default-src 'self'; script-src 'self' ${origin}; style-src 'self' 'unsafe-inline'` } }); });
  await page.goto('/auth.html'); await page.locator('#google-signin').click(); await expect(page).toHaveURL(/clerk-signin.html/); await expect(page.locator('#clerk-widget')).toHaveText('Mock Clerk sign-in');
  expect(await page.evaluate(() => window.testRedirect)).toContain('clerk-signin.html?complete=1');
});
test('Clerk callback sends its session token to the backend before opening the planner', async ({ page }) => {
  await provider(page);
  await page.route('**/clerk-signin.html?complete=1', async route => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': `default-src 'self'; script-src 'self' ${origin}; style-src 'self' 'unsafe-inline'` } }); });
  await page.route(`${origin}/npm/@clerk/ui@1/dist/ui.browser.js`, route => route.fulfill({ contentType: 'application/javascript', body: 'window.__internal_ClerkUICtor = function(){};' }));
  await page.route(`${origin}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, route => route.fulfill({ contentType: 'application/javascript', body: `window.Clerk = { load: async () => {}, session: { getToken: async () => 'test-only-token' } };` }));
  let sent;
  await page.route('**/api/auth/clerk/session', route => { sent = route.request().postDataJSON(); return route.fulfill({ json: { user: { id: 'test-user' } } }); });
  await page.goto('/clerk-signin.html?complete=1'); await expect(page).toHaveURL(/dashboard.html/); expect(sent.token).toBe('test-only-token');
});
