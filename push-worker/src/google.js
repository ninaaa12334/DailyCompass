import { b64url } from './webpush.js';

// Google Calendar (read-only) for Day Compass accounts.
//   POST   /google/start      → returns the Google consent URL for the signed-in person
//   GET    /google/callback   → Google sends the person back here; we keep an encrypted refresh token
//   GET    /google/status     → { connected, email }
//   GET    /google/calendars  → the person's calendars
//   GET    /google/events     → events in the chosen calendars between timeMin and timeMax
//   DELETE /google/link       → disconnect (also revokes the token at Google)
// The person is identified by their Supabase login, which we check with Supabase on every request.

const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.readonly';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const redirectUri = env => `${env.PUBLIC_URL}/google/callback`;
const allowed = env => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

async function supabaseUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4000) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

// AES-GCM with a key that only this service has (secret TOKEN_KEY, 32 random bytes in base64url).
async function aesKey(env) { return crypto.subtle.importKey('raw', b64url.decode(env.TOKEN_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text)); return { iv: b64url.encode(iv), data: b64url.encode(data) }; }
async function open(env, iv, data) { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.decode(iv) }, await aesKey(env), b64url.decode(data))); }

async function accessToken(env, userId) {
  const link = await env.DB.prepare('SELECT * FROM google_links WHERE user_id = ?').bind(userId).first();
  if (!link) throw Object.assign(new Error('Google Calendar isn’t connected.'), { status: 404 });
  const refresh = await open(env, link.iv, link.refresh_enc);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const data = await response.json().catch(() => ({}));
  if (data.error === 'invalid_grant') { await env.DB.prepare('DELETE FROM google_links WHERE user_id = ?').bind(userId).run(); throw Object.assign(new Error('Google access was removed. Connect Google Calendar again.'), { status: 401 }); }
  if (!response.ok || !data.access_token) throw Object.assign(new Error('Google didn’t answer. Try again in a moment.'), { status: 502 });
  return data.access_token;
}
async function google(env, userId, path) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { headers: { Authorization: `Bearer ${await accessToken(env, userId)}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message || `Google Calendar answered ${response.status}.`), { status: response.status === 404 ? 404 : 502 });
  return data;
}

export async function handleGoogle(request, env, path) {
  if (!env.GOOGLE_CLIENT_SECRET || !env.TOKEN_KEY) return json({ error: 'Google Calendar isn’t set up on the service yet.' }, 503);

  if (request.method === 'GET' && path === '/google/callback') {
    const url = new URL(request.url), state = url.searchParams.get('state') || '', code = url.searchParams.get('code');
    const saved = await env.DB.prepare('SELECT * FROM google_states WHERE state = ?').bind(state).first();
    if (saved) await env.DB.prepare('DELETE FROM google_states WHERE state = ?').bind(state).run();
    const back = (saved && allowed(env).includes(saved.origin)) ? saved.origin : allowed(env)[0];
    const finish = (result, reason = '') => Response.redirect(`${back}/dashboard.html?calendar=${result}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`, 302);
    if (!saved || Date.now() - saved.created > 10 * 60000) return finish('error', 'The connection took too long. Please try again.');
    if (!code) return finish('error', url.searchParams.get('error') === 'access_denied' ? 'Google Calendar access wasn’t allowed.' : 'Google didn’t finish the connection.');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env), grant_type: 'authorization_code' }) });
    const tokens = await response.json().catch(() => ({}));
    if (!response.ok || !tokens.refresh_token) return finish('error', 'Google didn’t give calendar access. Please try again.');
    if (!String(tokens.scope || '').includes('calendar.readonly')) return finish('error', 'Please tick “See and download your calendars” on Google’s screen.');
    let email = '';
    try { email = JSON.parse(new TextDecoder().decode(b64url.decode(String(tokens.id_token).split('.')[1]))).email || ''; } catch {}
    const sealed = await seal(env, tokens.refresh_token), now = Date.now();
    await env.DB.prepare('INSERT INTO google_links (user_id, email, refresh_enc, iv, created, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, refresh_enc = excluded.refresh_enc, iv = excluded.iv, updated = excluded.updated').bind(saved.user_id, email, sealed.data, sealed.iv, now, now).run();
    return finish('connected');
  }

  const user = await supabaseUser(request, env);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  if (request.method === 'POST' && path === '/google/start') {
    const origin = request.headers.get('Origin');
    if (!allowed(env).includes(origin)) return json({ error: 'This site isn’t allowed.' }, 403);
    const state = b64url.encode(crypto.getRandomValues(new Uint8Array(24)));
    await env.DB.batch([env.DB.prepare('DELETE FROM google_states WHERE created < ?').bind(Date.now() - 3600000), env.DB.prepare('INSERT INTO google_states (state, user_id, origin, created) VALUES (?, ?, ?, ?)').bind(state, user.id, origin, Date.now())]);
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(env), response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
    if (user.email) params.set('login_hint', user.email);
    return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }
  if (request.method === 'GET' && path === '/google/status') {
    const link = await env.DB.prepare('SELECT email, updated FROM google_links WHERE user_id = ?').bind(user.id).first();
    return json({ connected: Boolean(link), email: link?.email || '' });
  }
  if (request.method === 'GET' && path === '/google/calendars') {
    const data = await google(env, user.id, '/users/me/calendarList?minAccessRole=reader&maxResults=100');
    return json({ calendars: (data.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, primary: Boolean(c.primary), color: c.backgroundColor || '' })) });
  }
  if (request.method === 'GET' && path === '/google/events') {
    const url = new URL(request.url), ids = (url.searchParams.get('calendars') || '').split(',').filter(Boolean).slice(0, 20);
    const timeMin = url.searchParams.get('timeMin'), timeMax = url.searchParams.get('timeMax');
    if (!ids.length || Number.isNaN(Date.parse(timeMin)) || Number.isNaN(Date.parse(timeMax))) return json({ error: 'Choose calendars and a date range.' }, 400);
    const events = [];
    for (const id of ids) {
      let pageToken = '';
      for (let page = 0; page < 5; page++) {
        const query = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '2500', ...(pageToken ? { pageToken } : {}) });
        const data = await google(env, user.id, `/calendars/${encodeURIComponent(id)}/events?${query}`);
        for (const e of data.items || []) if (e.status !== 'cancelled' && e.transparency !== 'transparent' && e.start?.dateTime && e.end?.dateTime) events.push({ calendarId: id, id: e.id, title: String(e.summary || 'Busy').slice(0, 120), start: e.start.dateTime, end: e.end.dateTime });
        if (!data.nextPageToken) break; pageToken = data.nextPageToken;
      }
    }
    return json({ events: events.slice(0, 5000) });
  }
  if (request.method === 'DELETE' && path === '/google/link') {
    const link = await env.DB.prepare('SELECT * FROM google_links WHERE user_id = ?').bind(user.id).first();
    if (link) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await open(env, link.iv, link.refresh_enc))}`, { method: 'POST' }); } catch {} await env.DB.prepare('DELETE FROM google_links WHERE user_id = ?').bind(user.id).run(); }
    return json({ ok: true });
  }
  return json({ error: 'Not found.' }, 404);
}
