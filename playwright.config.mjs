import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.mjs', workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:8081', channel: 'chrome', headless: true, timezoneId: 'Europe/Budapest', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve.mjs 8081', url: 'http://127.0.0.1:8081', reuseExistingServer: false },
  reporter: 'list'
});
