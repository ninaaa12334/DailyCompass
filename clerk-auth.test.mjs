import test from 'node:test';
import assert from 'node:assert/strict';
import { clerkConfiguration, clerkSignIn } from './server/clerk-auth.mjs';
import { database } from './server/database.mjs';
import { createApplication } from './server/app.mjs';
const config = { APP_ORIGIN: 'http://127.0.0.1:9999', CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('test-app.clerk.accounts.dev$').toString('base64')}`, CLERK_SECRET_KEY: 'sk_test_not-a-real-key' };
function dependencies() {
  let inactive = false;
  return {
    setInactive() { inactive = true; },
    async verifyToken(token, options) { assert.deepEqual(options.authorizedParties, [config.APP_ORIGIN]); assert.equal(options.issuer, 'https://test-app.clerk.accounts.dev'); if (token !== 'valid-test-token') throw new Error('Invalid signature'); return { sub: 'user_test', sid: 'sess_test', azp: config.APP_ORIGIN }; },
    client: { sessions: { async getSession() { return { status: inactive ? 'revoked' : 'active', userId: 'user_test' }; } } }
  };
}
test('Clerk configuration publishes only the public key and safely parses the frontend domain', () => {
  assert.equal(clerkConfiguration(config).frontendOrigin, 'https://test-app.clerk.accounts.dev'); assert.ok(!('secretKey' in clerkConfiguration(config)));
  assert.equal(clerkConfiguration({}), null);
  assert.throws(() => clerkConfiguration({ ...config, CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('evil.example/attack$').toString('base64')}` }), /frontend domain/);
});
test('verified Clerk identity creates one private account and rejects invalid or revoked sessions', async () => {
  const store = database(':memory:'), deps = dependencies(), auth = clerkSignIn(store.db, config, deps);
  try {
    const first = await auth.exchange('valid-test-token', 'Europe/Budapest'); const second = await auth.exchange('valid-test-token'); assert.equal(first.id, second.id);
    assert.equal(store.db.prepare('SELECT count(*) n FROM users').get().n, 1);
    assert.equal(JSON.parse(store.db.prepare('SELECT body FROM documents').get().body).settings.timeZone, 'Europe/Budapest');
    await assert.rejects(auth.exchange('forged-token'), /could not be verified/); deps.setInactive(); await assert.rejects(auth.exchange('valid-test-token'), /could not be verified/);
    assert.equal(await auth.active('sess_test', 'user_test'), false);
  } finally { store.db.close(); }
});
test('Clerk HTTP exchange creates an HttpOnly planner session, preserves isolation and respects logout', async t => {
  const deps = dependencies(), app = createApplication({ database: ':memory:', worker: false, config, clerkDependencies: deps });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const provider = await (await fetch(`${base}/api/auth/provider`)).json(); assert.equal(provider.provider, 'clerk'); assert.ok(!JSON.stringify(provider).includes(config.CLERK_SECRET_KEY));
  const exchange = await fetch(`${base}/api/auth/clerk/session`, { method: 'POST', headers: { Origin: config.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'valid-test-token', timeZone: 'Europe/Budapest' }) });
  assert.equal(exchange.status, 200); const cookie = exchange.headers.get('set-cookie').split(';')[0]; assert.match(exchange.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await exchange.json()).onboardingRequired, true);
  const session = await (await fetch(`${base}/api/session`, { headers: { Cookie: cookie } })).json(); assert.equal(session.user.provider, 'clerk');
  assert.equal((await fetch(`${base}/api/planner`)).status, 401);
  const planner = await (await fetch(`${base}/api/planner`, { headers: { Cookie: cookie } })).json(); assert.equal(planner.state.tasks.length, 0);
  await fetch(`${base}/api/logout`, { method: 'POST', headers: { Origin: config.APP_ORIGIN, Cookie: cookie } }); assert.equal((await fetch(`${base}/api/planner`, { headers: { Cookie: cookie } })).status, 401);
});
