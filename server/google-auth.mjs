import { randomBytes, createHash, createPublicKey, verify, randomUUID } from 'node:crypto';
import { memoryModel } from './plans.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
export function googleSignIn(db, config, fetcher = fetch) {
  let keyCache = [], keyExpiry = 0;
  const configured = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  const redirect = `${config.APP_ORIGIN}/api/auth/google/callback`;
  const browserCookie = value => `compass_google=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${value ? 600 : 0}${config.APP_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
  async function keys(force = false) {
    if (!force && keyExpiry > Date.now()) return keyCache;
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(15000) });
    ensure(response.ok, 'Google signing keys are unavailable. Try again.');
    const data = await response.json(); ensure(Array.isArray(data.keys), 'Invalid Google signing keys.');
    keyCache = data.keys; keyExpiry = Date.now() + 3600000; return keyCache;
  }
  async function validateToken(token, nonce) {
    ensure(typeof token === 'string' && token.length < 16000, 'Missing Google identity token.');
    const pieces = token.split('.'); ensure(pieces.length === 3, 'Invalid Google identity token.');
    const header = JSON.parse(Buffer.from(pieces[0], 'base64url')), claims = JSON.parse(Buffer.from(pieces[1], 'base64url'));
    ensure(header.alg === 'RS256' && typeof header.kid === 'string', 'Unsupported Google signature.');
    let key = (await keys()).find(k => k.kid === header.kid);
    if (!key) key = (await keys(true)).find(k => k.kid === header.kid);
    ensure(key?.kty === 'RSA' && (!key.use || key.use === 'sig'), 'Unknown Google signing key.');
    ensure(verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(pieces[2], 'base64url')), 'Google identity signature is invalid.');
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud], now = Math.floor(Date.now() / 1000);
    ensure(['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) && audiences.includes(config.GOOGLE_CLIENT_ID) && (!claims.azp || claims.azp === config.GOOGLE_CLIENT_ID) && (audiences.length === 1 || claims.azp === config.GOOGLE_CLIENT_ID), 'Google identity belongs to another application.');
    ensure(Number.isFinite(claims.exp) && claims.exp > now && Number.isFinite(claims.iat) && claims.iat <= now + 120 && claims.nonce === nonce, 'Google sign-in expired. Try again.');
    ensure(typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255 && claims.email_verified === true, 'A verified Google account is required.');
    return claims;
  }
  return {
    configured, browserCookie,
    start(timeZone) {
      if (!configured) throw Object.assign(new Error('Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server. You can still sign up with a username and password.'), { status: 503 });
      new Intl.DateTimeFormat('en', { timeZone }).format();
      const state = randomBytes(32).toString('base64url'), browser = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url'), nonce = randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM login_oauth WHERE expires<?').run(Date.now());
      db.prepare('INSERT INTO login_oauth VALUES(?,?,?,?,?,?)').run(state, hash(browser), verifier, nonce, timeZone, Date.now() + 600000);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'openid email', state, nonce, prompt: 'select_account', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
      return { url: url.href, cookie: browserCookie(browser) };
    },
    async finish(query, cookieHeader = '') {
      const browser = cookieHeader.split(';').map(v => v.trim()).find(v => v.startsWith('compass_google='))?.slice(15) || '';
      const pending = db.prepare('SELECT * FROM login_oauth WHERE state=?').get(query.get('state'));
      ensure(pending && pending.expires > Date.now() && pending.browser_hash === hash(browser), 'Google sign-in expired or was opened in another browser.');
      db.prepare('DELETE FROM login_oauth WHERE state=?').run(pending.state);
      ensure(!query.get('error') && query.get('code'), 'Google sign-in was cancelled.');
      const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), body: new URLSearchParams({ code: query.get('code'), code_verifier: pending.verifier, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code' }) });
      ensure(response.ok, 'Google could not complete sign-in.');
      const identity = await validateToken((await response.json()).id_token, pending.nonce);
      // Subject IDs are stable. Never merge accounts by email or grant Calendar/Gmail access here.
      const linked = db.prepare("SELECT users.id,users.name FROM identities JOIN users ON users.id=identities.user_id WHERE provider='google' AND subject=?").get(identity.sub);
      if (linked) return linked;
      const id = randomUUID(), prefix = String(identity.email || 'planner').split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'planner';
      let name; do { name = `${prefix}_${randomBytes(3).toString('hex')}`; } while (db.prepare('SELECT id FROM users WHERE name=?').get(name));
      const state = memoryModel().snapshot(); state.settings.timeZone = pending.time_zone;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO users VALUES(?,?,?)').run(id, name, `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`);
        db.prepare('INSERT INTO documents VALUES(?,?,?)').run(id, 0, JSON.stringify(state));
        db.prepare("INSERT INTO identities VALUES('google',?,?)").run(identity.sub, id); db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return { id, name };
    }
  };
}
