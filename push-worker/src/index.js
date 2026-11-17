import { sendPush, b64url } from './webpush.js';
import { handleGoogle } from './google.js';

// Day Compass push service.
//   GET    /vapid                      → public key browsers need to subscribe
//   POST   /devices                    → register a device's push address, returns { deviceId, token }
//   PUT    /devices/:id/reminders      → replace that device's upcoming reminders (Bearer token)
//   POST   /devices/:id/test           → send a test notification now (Bearer token)
//   DELETE /devices/:id                → turn notifications off and forget the device (Bearer token)
// Every minute (cron) due reminders are sent and removed.

const MAX_REMINDERS = 1000, MAX_AHEAD = 70 * 86400000, LATE_LIMIT = 15 * 60000;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function cors(request, env) {
  const origin = request.headers.get('Origin'), allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : null;
}
async function readBody(request, limit = 300000) {
  const text = await request.text();
  if (text.length > limit) throw Object.assign(new Error('Request too large.'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}
async function authorised(env, request, id) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const device = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
  return device && device.token_hash === await sha256(token) ? device : null;
}
const vapid = env => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
const subscriptionOf = device => ({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } });

async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && path === '/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY });
  if (path.startsWith('/google/')) return handleGoogle(request, env, path);
  if (request.method === 'GET' && path === '/') return json({ service: 'Day Compass push', ok: true });

  if (request.method === 'POST' && path === '/devices') {
    const { subscription } = await readBody(request, 5000);
    const endpoint = String(subscription?.endpoint || ''), p256dh = String(subscription?.keys?.p256dh || ''), auth = String(subscription?.keys?.auth || '');
    let host; try { host = new URL(endpoint); } catch {}
    if (!host || host.protocol !== 'https:' || endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return json({ error: 'That notification subscription is not valid.' }, 400);
    const id = b64url.encode(crypto.getRandomValues(new Uint8Array(16))), token = b64url.encode(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
    // A browser that subscribes again (same address) replaces its old registration.
    const old = await env.DB.prepare('SELECT id FROM devices WHERE endpoint = ?').bind(endpoint).first();
    const statements = [];
    if (old) statements.push(env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(old.id), env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(old.id));
    statements.push(env.DB.prepare('INSERT INTO devices (id, token_hash, endpoint, p256dh, auth, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, await sha256(token), endpoint, p256dh, auth, now, now));
    await env.DB.batch(statements);
    return json({ deviceId: id, token }, 201);
  }

  const match = path.match(/^\/devices\/([A-Za-z0-9_-]+)(\/reminders|\/test)?$/);
  if (!match) return json({ error: 'Not found.' }, 404);
  const device = await authorised(env, request, match[1]);
  if (!device) return json({ error: 'This device is not registered. Turn notifications on again.' }, 401);

  if (request.method === 'PUT' && match[2] === '/reminders') {
    const { reminders } = await readBody(request);
    if (!Array.isArray(reminders) || reminders.length > MAX_REMINDERS) return json({ error: `Send at most ${MAX_REMINDERS} reminders.` }, 400);
    const now = Date.now(), seen = new Set(), rows = [];
    for (const r of reminders) {
      const key = clean(r?.key, 200), due = Number(r?.due);
      if (!key || seen.has(key) || !Number.isFinite(due) || due < now - LATE_LIMIT || due > now + MAX_AHEAD) continue;
      seen.add(key); rows.push([key, Math.round(due), clean(r.title, 120) || 'Day Compass', clean(r.body, 240)]);
    }
    const statements = [env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(device.id)];
    for (const [key, due, title, body] of rows) statements.push(env.DB.prepare('INSERT INTO reminders (device_id, key, due, title, body) VALUES (?, ?, ?, ?, ?)').bind(device.id, key, due, title, body));
    statements.push(env.DB.prepare('UPDATE devices SET updated = ? WHERE id = ?').bind(now, device.id));
    await env.DB.batch(statements);
    return json({ saved: rows.length });
  }
  if (request.method === 'POST' && match[2] === '/test') {
    const status = await sendPush(subscriptionOf(device), { title: 'Day Compass', body: 'Notifications work on this device. 🎉', tag: 'test', url: '/dashboard.html', source: 'cloud' }, vapid(env), { ttl: 300 });
    if (status === 404 || status === 410) { await forget(env, device.id); return json({ error: 'This device stopped accepting notifications. Turn them on again.' }, 410); }
    return json({ sent: status >= 200 && status < 300, status });
  }
  if (request.method === 'DELETE' && !match[2]) { await forget(env, device.id); return json({ ok: true }); }
  return json({ error: 'Not found.' }, 404);
}

async function forget(env, id) {
  await env.DB.batch([env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(id), env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(id)]);
}

// Every minute: send what's due (skipping anything more than 15 minutes late), then remove it.
export async function sendDue(env, now = Date.now()) {
  const { results } = await env.DB.prepare('SELECT r.device_id, r.key, r.due, r.title, r.body, d.endpoint, d.p256dh, d.auth FROM reminders r JOIN devices d ON d.id = r.device_id WHERE r.due <= ? ORDER BY r.due LIMIT 300').bind(now).all();
  const done = [], gone = new Set(); let sent = 0;
  await Promise.all(results.map(async row => {
    done.push(env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND key = ?').bind(row.device_id, row.key));
    if (row.due < now - LATE_LIMIT || gone.has(row.device_id)) return;
    try {
      const status = await sendPush(subscriptionOf(row), { title: row.title, body: row.body, tag: row.key, url: '/dashboard.html', source: 'cloud' }, vapid(env));
      if (status === 404 || status === 410) gone.add(row.device_id); else if (status < 300) sent++;
    } catch { /* One failed device must not stop the others. */ }
  }));
  if (done.length) await env.DB.batch(done);
  for (const id of gone) await forget(env, id);
  return { checked: results.length, sent, removedDevices: gone.size };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: headers ? 204 : 403, headers: headers || {} });
    if (request.headers.get('Origin') && !headers && new URL(request.url).pathname !== '/google/callback') return json({ error: 'This site is not allowed to use the push service.' }, 403);
    try { const response = await handle(request, env); for (const [k, v] of Object.entries(headers || {})) response.headers.set(k, v); return response; }
    catch (error) { return json({ error: error.status ? error.message : 'Something went wrong.' }, error.status || 500, headers || {}); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(sendDue(env, event.scheduledTime)); }
};
