import { randomBytes, createHash } from 'node:crypto';
import { zonedNow } from '../clock.mjs';
import { addDays, timeLabel } from '../calendar-view.mjs';
import { wallToInstant } from '../zoned-time.mjs';
import { memoryModel } from './plans.mjs';

const scopes = {
  calendar: ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly'],
  'calendar-write': ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/calendar.app.created'],
  gmail: ['https://www.googleapis.com/auth/gmail.readonly']
};
export function google(storage, config, fetcher = fetch) {
  const { db, seal, open } = storage;
  const configured = () => Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
  const redirect = `${config.APP_ORIGIN}/api/google/callback`;
  const serviceKey = service => service === 'calendar-write' ? 'calendar' : service;
  function connection(user, service) { const row = db.prepare('SELECT tokens FROM connections WHERE user_id=? AND service=?').get(user, serviceKey(service)); if (!row) throw Object.assign(new Error(`Connect ${service} first.`), { status: 409 }); return open(row.tokens); }
  function save(user, service, data) { db.prepare('INSERT INTO connections VALUES(?,?,?) ON CONFLICT(user_id,service) DO UPDATE SET tokens=excluded.tokens').run(user, serviceKey(service), seal(data)); }
  async function exchange(values) {
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000), body: new URLSearchParams({ ...values, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET }) });
    if (!response.ok) throw new Error(`Google token request failed (${response.status}). Reconnect your account.`);
    return response.json();
  }
  async function request(user, service, url, options = {}) {
    let data = connection(user, service);
    if (!data.expires || data.expires < Date.now() + 60000) {
      if (!data.refresh_token) throw new Error('Google access expired. Please reconnect.');
      const token = await exchange({ refresh_token: data.refresh_token, grant_type: 'refresh_token' }); data = { ...data, ...token, expires: Date.now() + token.expires_in * 1000 }; save(user, service, data);
    }
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${data.access_token}` } });
    if (!response.ok) throw Object.assign(new Error(`Google ${service} request failed (${response.status}). No local events were removed; reconnect or retry sync.`), { googleStatus: response.status, status: 502 });
    return response.status === 204 ? {} : response.json();
  }
  async function pages(user, service, url, field) {
    const all = []; let token;
    do { const next = new URL(url); if (token) next.searchParams.set('pageToken', token); const result = await request(user, service, next); all.push(...(result[field] || [])); token = result.nextPageToken; if (all.length > 10000) throw new Error('Import is too large. Select fewer calendars.'); } while (token);
    return all;
  }
  return {
    configured, connection, save, request,
    status(user) { return Object.fromEntries(['calendar', 'gmail'].map(service => { try { const data = connection(user, service); return [service, { connected: true, lastSync: data.lastSync || null, error: data.error || null, selected: data.selected || [], writeEnabled: (data.scope || '').includes('calendar.app.created') }]; } catch { return [service, { connected: false }]; } })); },
    authorize(user, session, service) {
      if (!configured()) throw Object.assign(new Error('Google OAuth is disconnected. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment.'), { status: 503 });
      if (!scopes[service]) throw new Error('Unknown Google service.');
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      db.prepare('INSERT INTO oauth VALUES(?,?,?,?,?,?)').run(state, user, session, service, verifier, Date.now() + 600000);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth'); url.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: scopes[service].join(' '), state, access_type: 'offline', prompt: 'consent', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }); return url.href;
    },
    async callback(user, session, query) {
      const row = db.prepare('SELECT * FROM oauth WHERE state=?').get(query.get('state'));
      if (!row || row.user_id !== user || row.session_hash !== session || row.expires < Date.now()) throw new Error('Google connection expired or belongs to another session. Try connecting again.');
      db.prepare('DELETE FROM oauth WHERE state=?').run(row.state);
      if (query.get('error')) throw new Error('Google access was not granted.');
      const token = await exchange({ code: query.get('code'), code_verifier: row.verifier, redirect_uri: redirect, grant_type: 'authorization_code' });
      let previous = {}; try { previous = connection(user, row.service); } catch {}
      save(user, row.service, { ...previous, ...token, scope: token.scope || scopes[row.service].join(' '), expires: Date.now() + token.expires_in * 1000, error: null });
    },
    async disconnect(user, service) {
      const data = connection(user, service);
      const response = await fetcher('https://oauth2.googleapis.com/revoke', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: data.refresh_token || data.access_token }) });
      if (!response.ok && response.status !== 400) throw new Error('Google revocation failed. Retry, or revoke access in your Google Account.');
      db.prepare('DELETE FROM connections WHERE user_id=? AND service=?').run(user, serviceKey(service));
    },
    async calendars(user) { return pages(user, 'calendar', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', 'items'); },
    async sync(user, selected, settings) {
      if (!Array.isArray(selected) || selected.length > 20 || !selected.every(s => typeof s === 'string' && s.length < 500)) throw new Error('Choose up to 20 calendars.');
      const today = zonedNow(new Date(), settings.timeZone).date, from = addDays(today, -7), until = addDays(today, 91), imports = [];
      try {
        for (const calendar of selected) {
          const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`);
          url.search = new URLSearchParams({ singleEvents: 'true', showDeleted: 'false', maxResults: '2500', timeMin: new Date(wallToInstant(from, '00:00', settings.timeZone)).toISOString(), timeMax: new Date(wallToInstant(until, '00:00', settings.timeZone)).toISOString() });
          for (const event of await pages(user, 'calendar', url, 'items')) {
            if (event.status === 'cancelled' || event.transparency === 'transparent' || event.extendedProperties?.private?.dayCompassId) continue;
            imports.push(...expandGoogleEvent(calendar, event, settings.timeZone, from, until));
          }
        }
        const data = connection(user, 'calendar'); save(user, 'calendar', { ...data, selected, lastSync: new Date().toISOString(), error: null }); return imports;
      } catch (error) { const data = connection(user, 'calendar'); save(user, 'calendar', { ...data, error: error.message }); throw error; }
    },
    async exportEvent(user, event, date, settings) {
      let data = connection(user, 'calendar');
      if (!(data.scope || '').includes('calendar.app.created')) throw new Error('Enable Google export first. It requests access only to calendars this app creates.');
      if (!data.exportCalendar) { const calendar = await request(user, 'calendar', 'https://www.googleapis.com/calendar/v3/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Day Compass', timeZone: settings.timeZone }) }); data.exportCalendar = calendar.id; save(user, 'calendar', data); }
      const id = createHash('sha256').update(`${event.id}|${date}`).digest('hex');
      const resource = { summary: event.title, start: { dateTime: new Date(wallToInstant(date, event.start, settings.timeZone, event.dstChoice)).toISOString(), timeZone: settings.timeZone }, end: { dateTime: new Date(wallToInstant(date, event.end, settings.timeZone, event.dstChoice)).toISOString(), timeZone: settings.timeZone }, extendedProperties: { private: { dayCompassId: event.id } } };
      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(data.exportCalendar)}/events`;
      // PUT creates no duplicate: discover an existing deterministic ID before choosing insert/update.
      const found = await request(user, 'calendar', `${base}?privateExtendedProperty=${encodeURIComponent(`dayCompassId=${event.id}`)}`);
      let saved;
      try { saved = await request(user, 'calendar', found.items?.length ? `${base}/${encodeURIComponent(found.items[0].id)}` : base, { method: found.items?.length ? 'PUT' : 'POST', body: JSON.stringify(found.items?.length ? resource : { ...resource, id }) }); }
      catch (error) { if (error.googleStatus !== 409) throw error; saved = await request(user, 'calendar', `${base}/${id}`, { method: 'PUT', body: JSON.stringify(resource) }); }
      const latest = connection(user, 'calendar'); latest.mirrors ??= {}; latest.mirrors[`${event.id}|${date}`] = { googleId: saved.id, date, signature: JSON.stringify([event.title, event.start, event.end, settings.timeZone, event.dstChoice || '']) }; save(user, 'calendar', latest); return saved;
    },
    async mirror(user, snapshot) {
      if (!snapshot.settings.googleAutoExport) return;
      const data = connection(user, 'calendar'), model = memoryModel(snapshot), today = zonedNow(new Date(), snapshot.settings.timeZone).date, until = addDays(today, 91), active = new Set();
      for (const date of [...new Set([...Object.keys(snapshot.days), ...Object.keys(snapshot.plans)])].filter(d => d >= today && d < until)) for (const item of model.getDay(date).commitments.filter(e => !e.sourceRoutine && !e.sourceImport && e.kind !== 'break')) {
        const key = `${item.id}|${date}`; active.add(key);
        if (data.mirrors?.[key]?.signature !== JSON.stringify([item.title, item.start, item.end, snapshot.settings.timeZone, item.dstChoice || ''])) await this.exportEvent(user, item, date, snapshot.settings);
      }
      const latest = connection(user, 'calendar');
      for (const [key, old] of Object.entries(latest.mirrors || {})) if (old.date >= today && old.date < until && !active.has(key)) {
        try { await request(user, 'calendar', `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(latest.exportCalendar)}/events/${encodeURIComponent(old.googleId)}`, { method: 'DELETE' }); } catch (error) { if (![404, 410].includes(error.googleStatus)) throw error; }
        delete latest.mirrors[key];
      }
      save(user, 'calendar', latest);
    },
    async mail(user) {
      const messages = await request(user, 'gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=newer_than%3A30d%20%7Bappointment%20school%20interview%20deadline%20travel%20event%7D');
      const reviews = [];
      for (const message of messages.messages || []) {
        if (db.prepare('SELECT status FROM mail_reviews WHERE user_id=? AND id=?').get(user, message.id)) continue;
        const detail = await request(user, 'gmail', `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=full`);
        const headers = Object.fromEntries((detail.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
        // No HTML rendering, remote images, attachments, or AI processing of mail.
        const plain = mailText(detail.payload).slice(0, 12000);
        const text = `${headers.subject || ''}\n${plain}`;
        const dates = [...new Set(text.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [])], times = [...new Set(text.match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g) || [])];
        const location = plain.match(/(?:location|where):\s*([^\r\n]{1,160})/i)?.[1] || '';
        reviews.push({ id: message.id, title: String(headers.subject || 'Email event').slice(0, 120), from: headers.from || '', date: dates.length === 1 ? dates[0] : '', start: times.length === 2 ? times[0] : '', end: times.length === 2 ? times[1] : '', location, uncertain: dates.length !== 1 || times.length !== 2, source: `https://mail.google.com/mail/u/0/#all/${message.id}` });
      }
      const data = connection(user, 'gmail'); save(user, 'gmail', { ...data, lastSync: new Date().toISOString() }); return reviews;
    }
  };
}
function mailText(part) {
  if (part?.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  return (part?.parts || []).map(mailText).join('\n');
}
export function expandGoogleEvent(calendar, event, timeZone, from, until) {
  if (!event.start || !event.end) return [];
  const allDay = Boolean(event.start.date);
  const start = allDay ? { date: event.start.date, minute: 0 } : zonedNow(new Date(event.start.dateTime), timeZone);
  const end = allDay ? { date: event.end.date, minute: 0 } : zonedNow(new Date(event.end.dateTime), timeZone);
  const result = [];
  for (let date = start.date < from ? from : start.date; date <= end.date && date < until; date = addDays(date, 1)) {
    let a = date === start.date ? start.minute : 0, b = date === end.date ? end.minute : 1440;
    if (!allDay && date === start.date && date === end.date && b <= a && Date.parse(event.end.dateTime) > Date.parse(event.start.dateTime)) { a = Math.floor(Math.min(start.minute, end.minute) / 60) * 60; b = Math.max(a + 60, Math.ceil(Math.max(start.minute, end.minute) / 60) * 60); }
    if (b > a) result.push({ id: `google-${createHash('sha256').update(`${calendar}|${event.id}|${date}`).digest('hex')}`, googleId: event.id, calendarId: calendar, date, title: String(event.summary || 'Busy').slice(0, 120), start: timeLabel(a), end: b === 1440 ? '24:00' : timeLabel(b), sourceStart: allDay ? null : event.start.dateTime, sourceEnd: allDay ? null : event.end.dateTime, sourceImport: true });
  }
  return result;
}
