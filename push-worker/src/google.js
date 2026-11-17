import { b64url } from './webpush.js';

// Google sign-in + Google Calendar (read-only) for Day Compass.
//   POST   /google/login-start  → Google screen that signs in AND connects the calendar in one step
//   POST   /google/start        → connect the calendar for someone already signed in (e.g. with email)
//   GET    /google/callback     → Google returns here (reached through daily-compass1.vercel.app/google-auth/callback)
//   GET    /google/status       → { connected, email }
//   GET    /google/calendars    → the person's calendars
//   GET    /google/events       → events in the chosen calendars between timeMin and timeMax
//   DELETE /google/link         → disconnect (also revokes access at Google)
// Calendar access is kept as an encrypted refresh token. Signed-in people are identified by their
// Supabase login (checked with Supabase on every request).

const SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.readonly';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const allowed = env => String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const decodeJwt = token => { try { return JSON.parse(new TextDecoder().decode(b64url.decode(String(token).split('.')[1]))); } catch { return {}; } };

async function supabaseUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.length > 4000) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}
// A calendar connection is stored under the Supabase account id (connected later) or the Google
// account id ("sub:…", connected while signing in with Google).
function linkKeys(user) {
  const google = (user.identities || []).find(identity => identity.provider === 'google');
  const sub = google?.identity_data?.sub || google?.id;
  return [user.id, ...(sub ? [`sub:${sub}`] : [])];
}
async function findLink(env, user) {
  for (const key of linkKeys(user)) { const link = await env.DB.prepare('SELECT * FROM google_links WHERE user_id = ?').bind(key).first(); if (link) return link; }
  return null;
}

// AES-GCM with a key only this service has (secret TOKEN_KEY).
async function aesKey(env) { return crypto.subtle.importKey('raw', b64url.decode(env.TOKEN_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text)); return { iv: b64url.encode(iv), data: b64url.encode(data) }; }
async function open(env, iv, data) { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.decode(iv) }, await aesKey(env), b64url.decode(data))); }

async function accessToken(env, link) {
  const refresh = await open(env, link.iv, link.refresh_enc);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const data = await response.json().catch(() => ({}));
  if (data.error === 'invalid_grant') { await env.DB.prepare('DELETE FROM google_links WHERE user_id = ?').bind(link.user_id).run(); throw Object.assign(new Error('Google access was removed. Connect Google Calendar again.'), { status: 401 }); }
  if (!response.ok || !data.access_token) throw Object.assign(new Error('Google didn’t answer. Try again in a moment.'), { status: 502 });
  return data.access_token;
}
async function google(env, link, path) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { headers: { Authorization: `Bearer ${await accessToken(env, link)}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error?.message || `Google Calendar answered ${response.status}.`), { status: response.status === 404 ? 404 : 502 });
  return data;
}

async function newState(env, { userId = '', origin, purpose, nonce = '' }) {
  const state = b64url.encode(crypto.getRandomValues(new Uint8Array(24)));
  await env.DB.batch([env.DB.prepare('DELETE FROM google_states WHERE created < ?').bind(Date.now() - 3600000), env.DB.prepare('INSERT INTO google_states (state, user_id, origin, created, purpose, nonce) VALUES (?, ?, ?, ?, ?, ?)').bind(state, userId, origin, Date.now(), purpose, nonce)]);
  return state;
}
function consentUrl(env, state, { hint = '', nonce = '', prompt = 'consent' } = {}) {
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: SCOPES, access_type: 'offline', include_granted_scopes: 'true', prompt, state });
  if (hint) params.set('login_hint', hint);
  if (nonce) params.set('nonce', nonce);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
async function storeLink(env, key, email, refreshToken) {
  const sealed = await seal(env, refreshToken), now = Date.now();
  await env.DB.prepare('INSERT INTO google_links (user_id, email, refresh_enc, iv, created, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, refresh_enc = excluded.refresh_enc, iv = excluded.iv, updated = excluded.updated').bind(key, email, sealed.data, sealed.iv, now, now).run();
}

export async function handleGoogle(request, env, path) {
  if (!env.GOOGLE_CLIENT_SECRET || !env.TOKEN_KEY) return json({ error: 'Google Calendar isn’t set up on the service yet.' }, 503);

  if (request.method === 'GET' && path === '/google/callback') {
    const url = new URL(request.url), state = url.searchParams.get('state') || '', code = url.searchParams.get('code');
    const saved = await env.DB.prepare('SELECT * FROM google_states WHERE state = ?').bind(state).first();
    if (saved) await env.DB.prepare('DELETE FROM google_states WHERE state = ?').bind(state).run();
    const back = (saved && allowed(env).includes(saved.origin)) ? saved.origin : allowed(env)[0];
    const login = saved?.purpose === 'login';
    const fail = reason => Response.redirect(login ? `${back}/auth.html?mode=login&error_description=${encodeURIComponent(reason)}` : `${back}/dashboard.html?calendar=error&reason=${encodeURIComponent(reason)}`, 302);
    if (!saved || Date.now() - saved.created > 10 * 60000) return fail('That took too long. Please try again.');
    if (!code) return fail(url.searchParams.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google didn’t finish. Please try again.');
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) });
    const tokens = await response.json().catch(() => ({}));
    if (!response.ok || !tokens.id_token) return fail('Google didn’t finish. Please try again.');
    const claims = decodeJwt(tokens.id_token), calendarAllowed = String(tokens.scope || '').includes('calendar.readonly');

    if (login) {
      const key = `sub:${claims.sub}`;
      if (calendarAllowed && tokens.refresh_token) await storeLink(env, key, claims.email || '', tokens.refresh_token);
      else if (calendarAllowed && !(await env.DB.prepare('SELECT 1 FROM google_links WHERE user_id = ?').bind(key).first())) {
        // Google only gives a long-lived calendar key on the consent screen; ask once more for it.
        const retry = await newState(env, { origin: saved.origin, purpose: 'login', nonce: saved.nonce });
        return Response.redirect(consentUrl(env, retry, { hint: claims.email, nonce: saved.nonce, prompt: 'consent' }), 302);
      }
      // The sign-in token goes to the page in the URL fragment (never sent to any server).
      return Response.redirect(`${back}/auth.html?mode=login&via=google#id_token=${encodeURIComponent(tokens.id_token)}`, 302);
    }

    if (!tokens.refresh_token || !calendarAllowed) return fail(calendarAllowed ? 'Google didn’t give calendar access. Please try again.' : 'Please allow “See and download your calendars” on Google’s screen.');
    await storeLink(env, saved.user_id, claims.email || '', tokens.refresh_token);
    return Response.redirect(`${back}/dashboard.html?calendar=connected`, 302);
  }

  if (request.method === 'POST' && path === '/google/login-start') {
    const origin = request.headers.get('Origin');
    if (!allowed(env).includes(origin)) return json({ error: 'This site isn’t allowed.' }, 403);
    const body = await request.json().catch(() => ({})), nonce = String(body.nonce || '');
    if (!/^[a-f0-9]{64}$/.test(nonce)) return json({ error: 'Please try again.' }, 400);
    const state = await newState(env, { origin, purpose: 'login', nonce });
    return json({ url: consentUrl(env, state, { nonce, prompt: 'select_account' }) });
  }

  const user = await supabaseUser(request, env);
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  if (request.method === 'POST' && path === '/google/start') {
    const origin = request.headers.get('Origin');
    if (!allowed(env).includes(origin)) return json({ error: 'This site isn’t allowed.' }, 403);
    const state = await newState(env, { userId: user.id, origin, purpose: 'connect' });
    return json({ url: consentUrl(env, state, { hint: user.email }) });
  }
  if (request.method === 'GET' && path === '/google/status') {
    const link = await findLink(env, user);
    return json({ connected: Boolean(link), email: link?.email || '' });
  }
  const link = await findLink(env, user);
  if (!link && path !== '/google/link') return json({ error: 'Google Calendar isn’t connected.' }, 404);
  if (request.method === 'GET' && path === '/google/calendars') {
    const data = await google(env, link, '/users/me/calendarList?minAccessRole=reader&maxResults=100');
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
        const data = await google(env, link, `/calendars/${encodeURIComponent(id)}/events?${query}`);
        for (const e of data.items || []) if (e.status !== 'cancelled' && e.transparency !== 'transparent' && e.start?.dateTime && e.end?.dateTime) events.push({ calendarId: id, id: e.id, title: String(e.summary || 'Busy').slice(0, 120), start: e.start.dateTime, end: e.end.dateTime });
        if (!data.nextPageToken) break; pageToken = data.nextPageToken;
      }
    }
    return json({ events: events.slice(0, 5000) });
  }
  if (request.method === 'DELETE' && path === '/google/link') {
    if (link) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await open(env, link.iv, link.refresh_enc))}`, { method: 'POST' }); } catch {} await env.DB.prepare('DELETE FROM google_links WHERE user_id = ?').bind(link.user_id).run(); }
    return json({ ok: true });
  }
  return json({ error: 'Not found.' }, 404);
}
