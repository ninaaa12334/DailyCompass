import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('push receipt reporting records receipt and display request without sending private content back', async () => {
  for (const blocked of [false, true]) {
    const handlers = {}, reports = [], shown = [], key = 'b'.repeat(64);
    const self = { location: { origin: 'http://localhost' }, addEventListener(type, callback) { handlers[type] = callback; }, registration: { async showNotification(title, options) { shown.push({ title, options }); if (blocked) throw new Error('OS refused'); } } };
    vm.runInNewContext(readFileSync('sw.js', 'utf8'), { self, clients: {}, AbortSignal, fetch: async (_, options) => { reports.push(JSON.parse(options.body)); return { ok: true }; } });
    let complete; handlers.push({ data: { json: () => ({ key, title: 'Day Compass', body: 'Private event content', url: '/dashboard.html' }) }, waitUntil(promise) { complete = promise; } });
    await complete; assert.equal(shown.length, 1); assert.deepEqual(reports.map(r => r.phase).sort(), ['received', blocked ? 'display-failed' : 'display-requested'].sort());
    assert.equal(JSON.stringify(reports).includes('Private event content'), false); assert.ok(reports.every(r => r.key === key));
  }
});
