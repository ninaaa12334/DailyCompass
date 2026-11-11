import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { database } from './server/database.mjs';
import { googleSignIn } from './server/google-auth.mjs';
import { createApplication } from './server/app.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' };
function signed(claims) { const data = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.'); return `${data}.${sign('RSA-SHA256', Buffer.from(data), pair.privateKey).toString('base64url')}`; }
function fixture() {
  const storage = database(':memory:'), config = { APP_ORIGIN: 'http://127.0.0.1:9999', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret' };
  let nonce, override = {};
  const fetcher = async url => String(url).includes('/certs') ? Response.json({ keys: [jwk] }) : Response.json({ id_token: signed({ iss: 'https://accounts.google.com', aud: config.GOOGLE_CLIENT_ID, sub: 'google-subject', email: 'student@example.com', email_verified: true, nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...override }) });
  const auth = googleSignIn(storage.db, config, fetcher);
  function begin() { const result = auth.start('Europe/Budapest'), url = new URL(result.url); nonce = url.searchParams.get('nonce'); return { url, cookie: result.cookie.split(';')[0], query: new URLSearchParams({ state: url.searchParams.get('state'), code: 'test-code' }) }; }
  return { ...storage, config, fetcher, auth, begin, change: value => { override = value; } };
}
test('Google signup validates signed identity, creates an isolated account and returns to it on login', async () => {
  const f = fixture(); try {
    f.db.prepare('INSERT INTO users VALUES(?,?,?)').run('local', 'student', 'test-hash');
    const start = f.begin(); assert.equal(start.url.searchParams.get('scope'), 'openid email'); assert.ok(start.url.searchParams.get('code_challenge'));
    const first = await f.auth.finish(start.query, start.cookie); assert.notEqual(first.id, 'local');
    assert.equal(f.db.prepare('SELECT count(*) n FROM connections').get().n, 0);
    assert.equal(JSON.parse(f.db.prepare('SELECT body FROM documents WHERE user_id=?').get(first.id).body).settings.timeZone, 'Europe/Budapest');
    await assert.rejects(f.auth.finish(start.query, start.cookie), /expired/);
    const next = f.begin(); assert.equal((await f.auth.finish(next.query, next.cookie)).id, first.id);
    assert.equal(f.db.prepare('SELECT count(*) n FROM identities').get().n, 1);
  } finally { f.db.close(); }
});
test('Google login rejects browser state mismatches, wrong audience, nonce, issuer, expiry and unverified emails', async () => {
  const f = fixture(); try {
    const start = f.begin(); await assert.rejects(f.auth.finish(start.query, 'compass_google=wrong-browser'), /another browser/);
    for (const override of [{ aud: 'another-app' }, { nonce: 'wrong-nonce' }, { iss: 'https://evil.example' }, { exp: 0 }, { email_verified: false }]) { f.change(override); const request = f.begin(); await assert.rejects(f.auth.finish(request.query, request.cookie)); }
    assert.equal(f.db.prepare('SELECT count(*) n FROM users').get().n, 0);
  } finally { f.db.close(); }
});
test('Google callback creates a real session cookie; unconfigured signin reports setup instead of success', async t => {
  const f = fixture(), app = createApplication({ database: ':memory:', config: f.config, fetcher: f.fetcher, worker: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.close(); f.db.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const started = await fetch(`${base}/api/auth/google/start`, { method: 'POST', headers: { Origin: f.config.APP_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone: 'Europe/Budapest' }) });
  const result = await started.json(), url = new URL(result.url);
  // Reuse fixture's token generator with the nonce from the actual HTTP flow.
  f.change({ nonce: url.searchParams.get('nonce') });
  const callback = await fetch(`${base}/api/auth/google/callback?state=${url.searchParams.get('state')}&code=test`, { headers: { Cookie: started.headers.get('set-cookie').split(';')[0] }, redirect: 'manual' });
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/onboarding.html');
  const sessionCookie = callback.headers.getSetCookie().find(v => v.startsWith('compass_session=')).split(';')[0];
  const session = await (await fetch(`${base}/api/session`, { headers: { Cookie: sessionCookie } })).json(); assert.ok(session.user.id);
  const invalid = await fetch(`${base}/api/auth/google/callback?state=invalid&code=test`, { redirect: 'manual' }); assert.equal(invalid.headers.get('location'), '/auth.html?error=google');
  const unconfigured = googleSignIn(f.db, { APP_ORIGIN: f.config.APP_ORIGIN }); assert.throws(() => unconfigured.start('UTC'), /needs GOOGLE_CLIENT_ID/);
});
