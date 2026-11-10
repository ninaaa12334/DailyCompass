import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { database } from './database.mjs';
import { google } from './google.mjs';
import { pushWorker, validSubscription } from './push.mjs';
import { memoryModel, proposeAI, acceptProposal } from './plans.mjs';
import { validatePlanner } from '../planner-store.mjs';
import { zonedNow, validDate } from '../clock.mjs';
import { wallToInstant } from '../zoned-time.mjs';
import { googleSignIn } from './google-auth.mjs';

const scrypt = promisify(rawScrypt), hash = value => createHash('sha256').update(value).digest('hex');
export function createApplication(options = {}) {
  const config = { ...process.env, APP_ORIGIN: 'http://127.0.0.1:8080', ...options.config };
  if (config.NODE_ENV === 'production' && (!config.APP_ORIGIN.startsWith('https://') || !config.TOKEN_ENCRYPTION_KEY)) throw new Error('Production needs HTTPS APP_ORIGIN and TOKEN_ENCRYPTION_KEY.');
  const store = database(options.database || config.DATABASE_PATH || 'data/compass.sqlite', config.TOKEN_ENCRYPTION_KEY), { db } = store;
  const integration = google(store, config, options.fetcher), push = pushWorker(db, config, options.pushSender);
  const googleLogin = googleSignIn(db, config, options.fetcher);
  let googleRunning = false;
  async function syncGoogleAccounts() {
    if (googleRunning || !integration.configured()) return; googleRunning = true;
    try { for (const row of db.prepare('SELECT user_id FROM connections WHERE service=?').all('calendar')) {
      const doc = readDocument(row.user_id); if (!doc.state.settings.googleSyncEnabled) continue;
      try { const data = integration.connection(row.user_id, 'calendar'); const imported = await integration.sync(row.user_id, data.selected || [], doc.state.settings); const latest = readDocument(row.user_id); latest.state.imports = imported; saveDocument(row.user_id, latest.state, latest.version); await integration.mirror(row.user_id, latest.state); }
      catch (error) { try { const data = integration.connection(row.user_id, 'calendar'); integration.save(row.user_id, 'calendar', { ...data, error: error.message }); } catch {} }
    } } finally { googleRunning = false; }
  }
  const failures = new Map(), root = path.resolve(options.root || process.cwd());
  const assert = (condition, message, status = 400) => { if (!condition) throw Object.assign(new Error(message), { status }); };
  const readDocument = user => { const row = db.prepare('SELECT version,body FROM documents WHERE user_id=?').get(user); return row ? { version: row.version, state: JSON.parse(row.body) } : { version: 0, state: memoryModel().snapshot() }; };
  function saveDocument(user, state, expected) {
    validatePlanner(state);
    const before = readDocument(user); assert(before.version === expected, 'Your account changed on another device. Export unsynced changes, then reload the server copy.', 409);
    db.prepare('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,body=excluded.body').run(user, expected + 1, JSON.stringify(state));
    if (state.settings.historyEnabled) {
      for (const task of state.tasks) {
        const old = before.state.tasks.find(t => t.id === task.id);
        const action = task.completed && !old?.completed ? 'completed' : old && task.date > old.date && old.date ? 'postponed' : null;
        if (action) db.prepare('INSERT INTO history VALUES(?,?,?)').run(user, JSON.stringify({ action, title: task.title, category: task.category, date: zonedNow(new Date(), state.settings.timeZone).date }), Date.now());
      }
      db.prepare('DELETE FROM history WHERE user_id=? AND rowid NOT IN (SELECT rowid FROM history WHERE user_id=? ORDER BY created DESC LIMIT 1000)').run(user, user);
    }
    return { version: expected + 1, state };
  }
  async function body(request) { let raw = ''; for await (const chunk of request) { raw += chunk; assert(Buffer.byteLength(raw) <= 2000000, 'Request too large.', 413); } try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON request.'); } }
  function session(request) {
    const token = request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('compass_session='))?.slice(16);
    const sessionHash = hash(token || '');
    const user = db.prepare('SELECT users.id,users.name FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?').get(sessionHash, Date.now());
    return user ? { ...user, sessionHash } : null;
  }
  const cookie = token => `compass_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 2592000 : 0}${config.APP_ORIGIN.startsWith('https:') ? '; Secure' : ''}`;
  const json = (response, data, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'same-origin'); response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(request.url, config.APP_ORIGIN), route = url.pathname;
      if (!route.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) return json(response, { error: 'Method not allowed' }, 405);
        if (route === '/favicon.ico') { response.writeHead(204); response.end(); return; }
        const name = decodeURIComponent(route === '/' ? '/index.html' : route), relative = name.slice(1);
        const extension = path.extname(name), mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[extension];
        assert(mime && !relative.includes('/') && !relative.includes('\\') && !relative.startsWith('.') && !relative.includes('.test.') && relative !== 'playwright.config.mjs', 'Not found', 404);
        const file = await readFile(path.join(root, relative)).catch(() => { throw Object.assign(new Error('Not found'), { status: 404 }); });
        response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, ...(name === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) }); response.end(request.method === 'HEAD' ? undefined : file); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) assert(request.headers.origin === config.APP_ORIGIN, 'Request origin is not allowed.', 403);
      const user = session(request);
      if (route === '/api/auth/google/start' && request.method === 'POST') {
        assert(!user, 'You are already signed in. Sign out before switching accounts.', 409);
        const key = `google:${request.socket.remoteAddress}`, rate = failures.get(key) || { count: 0, until: Date.now() + 900000 };
        if (rate.until < Date.now()) { rate.count = 0; rate.until = Date.now() + 900000; } assert(rate.count < 20, 'Too many Google sign-in attempts. Try again later.', 429); rate.count++; failures.set(key, rate);
        const input = await body(request), result = googleLogin.start(input.timeZone || 'UTC'); response.setHeader('Set-Cookie', result.cookie); return json(response, { url: result.url });
      }
      if (route === '/api/auth/google/callback' && request.method === 'GET') {
        try {
          assert(!user, 'Already signed in.');
          const account = await googleLogin.finish(url.searchParams, request.headers.cookie), token = randomBytes(32).toString('base64url');
          db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), account.id, Date.now() + 2592000000);
          response.setHeader('Set-Cookie', [cookie(token), googleLogin.browserCookie('')]); response.writeHead(303, { Location: '/dashboard.html' }); response.end();
        } catch { response.setHeader('Set-Cookie', googleLogin.browserCookie('')); response.writeHead(303, { Location: '/auth.html?error=google' }); response.end(); }
        return;
      }
      if (route === '/api/session' && request.method === 'GET') return json(response, { user: user ? { id: user.id, name: user.name } : null, features: { ai: Boolean(config.OPENAI_API_KEY && config.OPENAI_MODEL), google: integration.configured(), push: push.configured, pushKey: config.VAPID_PUBLIC_KEY || null } });
      if (['/api/register', '/api/login'].includes(route) && request.method === 'POST') {
        const input = await body(request), name = String(input.name || '').trim().toLowerCase(), password = String(input.password || '');
        const address = request.socket.remoteAddress, rate = failures.get(address) || { count: 0, until: Date.now() + 900000 };
        if (rate.until < Date.now()) { rate.count = 0; rate.until = Date.now() + 900000; }
        assert(rate.count < 15, 'Too many sign-in attempts. Try again in 15 minutes.', 429); rate.count++; failures.set(address, rate);
        assert(/^[a-z0-9_-]{3,40}$/.test(name) && password.length >= 10 && password.length <= 200, 'Use a 3–40 character username (letters/numbers/_/-) and a 10–200 character password.');
        let account = db.prepare('SELECT * FROM users WHERE name=?').get(name);
        if (route === '/api/register') {
          assert(!account, 'Username unavailable.', 409);
          const salt = randomBytes(16).toString('hex'), digest = await scrypt(password, salt, 64);
          account = { id: randomUUID(), name, password: `${salt}:${digest.toString('hex')}` };
          const initial = memoryModel().snapshot();
          if (input.timeZone) { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format(); initial.settings.timeZone = input.timeZone; }
          db.prepare('INSERT INTO users VALUES(?,?,?)').run(account.id, name, account.password);
          db.prepare('INSERT INTO documents VALUES(?,?,?)').run(account.id, 0, JSON.stringify(initial));
        } else {
          const [salt, expected] = (account?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const actual = await scrypt(password, salt, 64); assert(account && timingSafeEqual(actual, Buffer.from(expected, 'hex')), 'Username or password is incorrect.', 401);
        }
        failures.delete(address); const token = randomBytes(32).toString('base64url');
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), account.id, Date.now() + 2592000000); response.setHeader('Set-Cookie', cookie(token)); return json(response, { user: { id: account.id, name } });
      }
      assert(user, 'Sign in to use your private server planner.', 401);
      assert(!request.headers['x-compass-user'] || request.headers['x-compass-user'] === user.id, 'The signed-in account changed in another tab. Export unsynced changes, then reload.', 401);
      if (route === '/api/logout' && request.method === 'POST') { db.prepare('DELETE FROM sessions WHERE hash=?').run(user.sessionHash); db.prepare('DELETE FROM subscriptions WHERE user_id=?').run(user.id); response.setHeader('Set-Cookie', cookie('')); return json(response, { ok: true }); }
      if (route === '/api/account' && request.method === 'DELETE') {
        const input = await body(request); assert(input.confirm === user.name, 'Type your username to confirm deletion.');
        for (const service of ['calendar', 'gmail']) try { await integration.disconnect(user.id, service); } catch { /* Local deletion must remain possible without Google. */ }
        db.prepare('DELETE FROM oauth WHERE user_id=?').run(user.id); db.prepare('DELETE FROM users WHERE id=?').run(user.id); response.setHeader('Set-Cookie', cookie('')); return json(response, { ok: true });
      }
      if (route === '/api/planner' && request.method === 'GET') return json(response, readDocument(user.id));
      if (route === '/api/planner' && request.method === 'PUT') { const input = await body(request); assert(Number.isInteger(input.version), 'Missing server version.'); input.state.imports = readDocument(user.id).state.imports || []; const result = saveDocument(user.id, input.state, input.version); await push.tick(); return json(response, result); }
      if (route === '/api/history' && request.method === 'GET') return json(response, db.prepare('SELECT body FROM history WHERE user_id=? ORDER BY created DESC LIMIT 1000').all(user.id).map(r => JSON.parse(r.body)));
      if (route === '/api/history' && request.method === 'DELETE') { db.prepare('DELETE FROM history WHERE user_id=?').run(user.id); return json(response, { ok: true }); }
      if (route === '/api/ai/preview' && request.method === 'POST') {
        const input = await body(request); assert(typeof input.prompt === 'string' && input.prompt.trim() && input.prompt.length <= 2000, 'Tell me what you would like to plan.');
        const doc = readDocument(user.id), rateKey = `ai:${user.id}`, last = failures.get(rateKey) || 0; assert(Date.now() - last > 5000, 'Wait a few seconds before regenerating.', 429); failures.set(rateKey, Date.now());
        const history = db.prepare('SELECT body FROM history WHERE user_id=? ORDER BY created DESC LIMIT 40').all(user.id).map(r => JSON.parse(r.body));
        return json(response, { ...await proposeAI(doc.state, input, config, history, options.fetcher), version: doc.version });
      }
      if (route === '/api/ai/accept' && request.method === 'POST') { const input = await body(request), doc = readDocument(user.id); assert(input.version === doc.version, 'The planner changed. Generate a fresh proposal.', 409); assert(Array.isArray(input.activities) && input.activities.length > 0, 'Select at least one proposed activity.'); return json(response, saveDocument(user.id, acceptProposal(doc.state, input.date, input.activities, input), doc.version)); }
      if (route === '/api/google/status' && request.method === 'GET') return json(response, integration.status(user.id));
      if (route === '/api/google/connect' && request.method === 'POST') { const input = await body(request); return json(response, { url: integration.authorize(user.id, user.sessionHash, input.service) }); }
      if (route === '/api/google/callback' && request.method === 'GET') { await integration.callback(user.id, user.sessionHash, url.searchParams); response.writeHead(303, { Location: '/dashboard.html#connections' }); response.end(); return; }
      if (route === '/api/google/disconnect' && request.method === 'POST') { const input = await body(request); assert(['calendar', 'gmail'].includes(input.service), 'Unknown service.'); await integration.disconnect(user.id, input.service); if (input.service === 'calendar') { const doc = readDocument(user.id); doc.state.imports = []; saveDocument(user.id, doc.state, doc.version); } return json(response, { ok: true }); }
      if (route === '/api/google/calendars' && request.method === 'GET') return json(response, (await integration.calendars(user.id)).map(c => ({ id: c.id, summary: c.summary })));
      if (route === '/api/google/sync' && request.method === 'POST') { const input = await body(request), doc = readDocument(user.id), imported = await integration.sync(user.id, input.calendars, doc.state.settings); const latest = readDocument(user.id); latest.state.imports = imported; latest.state.settings.googleSyncEnabled = true; const result = saveDocument(user.id, latest.state, latest.version); await integration.mirror(user.id, result.state); return json(response, result); }
      if (route === '/api/google/export' && request.method === 'POST') { const input = await body(request), doc = readDocument(user.id), event = memoryModel(doc.state).getDay(input.date).commitments.find(e => e.id === input.id); assert(event && !event.sourceImport && !event.sourceRoutine && event.kind !== 'break', 'Choose a saved activity to export.'); await integration.exportEvent(user.id, event, input.date, doc.state.settings); return json(response, { ok: true }); }
      if (route === '/api/gmail/review' && request.method === 'POST') return json(response, await integration.mail(user.id));
      if (route === '/api/gmail/dismiss' && request.method === 'POST') { const input = await body(request); assert(typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(input.id), 'Invalid email ID.'); db.prepare("INSERT OR REPLACE INTO mail_reviews VALUES(?,?,'dismissed')").run(user.id, input.id); return json(response, { ok: true }); }
      if (route === '/api/gmail/accept' && request.method === 'POST') {
        const input = await body(request), doc = readDocument(user.id); assert(/^[a-zA-Z0-9_-]{1,200}$/.test(input.id), 'Invalid email ID.'); assert(!db.prepare('SELECT status FROM mail_reviews WHERE user_id=? AND id=?').get(user.id, input.id), 'This email was already reviewed.', 409);
        const event = input.event; assert(validDate(event.date), 'Confirm a valid date.'); wallToInstant(event.date, event.start, doc.state.settings.timeZone, event.dstChoice); wallToInstant(event.date, event.end, doc.state.settings.timeZone, event.dstChoice);
        const model = memoryModel(doc.state), duplicate = model.getDay(event.date).commitments.some(e => (e.sourceImport && e.start < event.end && e.end > event.start) || (e.start === event.start && e.end === event.end && e.title.trim().toLowerCase() === event.title.trim().toLowerCase())); assert(!duplicate, 'An existing event already covers this time, including Google imports. Review it before adding another.', 409);
        model.saveActivity({ ...event, id: randomUUID(), kind: 'fixed', category: 'Appointments', priority: 'Medium', notes: `Source Gmail message: ${input.id}${event.location ? `; Location: ${String(event.location).slice(0, 160)}` : ''}`, repeat: 'none', repeatUntil: '', reminder: 'default', locked: false });
        const result = saveDocument(user.id, model.snapshot(), doc.version); db.prepare("INSERT INTO mail_reviews VALUES(?,?,'accepted')").run(user.id, input.id); return json(response, result);
      }
      if (route === '/api/push/subscribe' && request.method === 'POST') { assert(push.configured, 'Background push is not configured on this server.', 503); const subscription = validSubscription(await body(request)); assert(db.prepare('SELECT count(*) n FROM subscriptions WHERE user_id=?').get(user.id).n < 10, 'Too many subscribed devices.'); db.prepare('DELETE FROM subscriptions WHERE endpoint=?').run(subscription.endpoint); db.prepare('INSERT INTO subscriptions VALUES(?,?,?)').run(user.id, subscription.endpoint, JSON.stringify(subscription)); return json(response, { ok: true }); }
      if (route === '/api/push/unsubscribe' && request.method === 'POST') { const input = await body(request); db.prepare('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?').run(user.id, input.endpoint); return json(response, { ok: true }); }
      if (route === '/api/reminders' && request.method === 'GET') { await push.tick(); return json(response, db.prepare('SELECT body,status,error FROM deliveries WHERE user_id=? ORDER BY due DESC LIMIT 200').all(user.id).map(r => ({ ...JSON.parse(r.body), status: r.status, error: r.error }))); }
      json(response, { error: 'Not found' }, 404);
    } catch (error) { json(response, { error: error.status ? error.message : (error.code?.startsWith('ERR_SQLITE') ? 'The database could not save this change.' : error.message || 'Request failed.') }, error.status || 400); }
  });
  const timer = options.worker === false ? null : setInterval(() => { push.tick().catch(() => console.error('Background reminder check failed; inspect notification center and database availability.')); }, 15000); timer?.unref();
  const googleTimer = options.worker === false ? null : setInterval(() => { syncGoogleAccounts().catch(() => console.error('Google sync check failed.')); }, 300000); googleTimer?.unref();
  return { server, db, push, integration, readDocument, saveDocument, syncGoogleAccounts, close: () => { if (timer) clearInterval(timer); if (googleTimer) clearInterval(googleTimer); db.close(); } };
}
