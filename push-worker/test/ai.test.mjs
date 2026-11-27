import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleAi } from '../src/ai.js';

// A tiny stand-in for Cloudflare D1 on top of Node's built-in SQLite.
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return { prepare(sql) { let args = []; const statement = { bind(...values) { args = values; return statement; }, first: async () => db.prepare(sql).get(...args) ?? null, run: async () => db.prepare(sql).run(...args) }; return statement; } };
}
const image = 'data:image/jpeg;base64,' + Buffer.from('not really a photo').toString('base64');
const env = () => ({ DB: fakeD1(), SUPABASE_URL: 'https://supabase.test', SUPABASE_KEY: 'pk', GEMINI_API_KEY: 'gk', GEMINI_MODEL: 'gemini-flash-lite-latest' });
const request = (body, token = 'good.token.here') => new Request('https://worker.test/ai/photo', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function stubFetch(t) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).startsWith('https://supabase.test/auth/v1/user')) return options.headers.Authorization === 'Bearer good.token.here' ? Response.json({ id: 'user-1' }) : new Response('{}', { status: 401 });
    if (String(url).includes('generativelanguage.googleapis.com')) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ message: 'Found 1 test.', items: [{ title: 'History test', date: '2026-12-03', start: '', end: '', seen: 'Hist 3/12' }] }) }] } }] });
    throw new Error(`Unexpected fetch ${url}`);
  });
  return calls;
}

test('a signed-in person gets the dated items from their photo', async t => {
  const calls = stubFetch(t);
  const response = await handleAi(request({ image, timeZone: 'Europe/Budapest' }), env(), '/ai/photo');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.items.map(item => [item.title, item.date]), [['History test', '2026-12-03']]);
  assert.ok(calls.some(url => url.includes('gemini-flash-lite-latest')));
});

test('photos need a sign-in and are rate limited per person', async t => {
  stubFetch(t);
  assert.equal((await handleAi(request({ image }, 'bad.token.x'), env(), '/ai/photo')).status, 401);
  const shared = env();
  assert.equal((await handleAi(request({ image }), shared, '/ai/photo')).status, 200);
  const second = await handleAi(request({ image }), shared, '/ai/photo');
  assert.equal(second.status, 429, 'a second photo straight away waits');
});

test('the website explains when no AI key has been added yet', async t => {
  stubFetch(t);
  const response = await handleAi(request({ image }), { ...env(), GEMINI_API_KEY: '' }, '/ai/photo');
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /GEMINI_API_KEY/);
});
