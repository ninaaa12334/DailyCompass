import { Worker } from 'node:worker_threads';
import { zonedNow } from '../clock.mjs';
import { addDays } from '../calendar-view.mjs';

const service = 'ical', maxBytes = 5 * 1024 * 1024;
export function privateGoogleFeedURL(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new Error('Paste the complete Secret address in iCal format from Google Calendar.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'calendar.google.com' || url.port || url.username || url.password || url.search || url.hash || url.href.length > 2048 || !/^\/calendar\/ical\/[^/]+\/private-[a-zA-Z0-9]+\/basic\.ics$/.test(url.pathname)) throw new Error('Use Google Calendar’s Secret address in iCal format, not its public address or a different website.');
  return url.href;
}
function parseInWorker(text, timeZone, from, until) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ical-parser.mjs', import.meta.url), { workerData: { type: 'ical', text, timeZone, from, until }, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    const fail = () => reject(new Error('The feed could not be read safely. Previous imported events were kept. Check the calendar format or size.'));
    const timeout = setTimeout(() => { worker.terminate(); fail(); }, 10000);
    worker.once('message', result => { clearTimeout(timeout); worker.terminate(); result.error ? fail() : resolve(result.imports); });
    worker.once('error', () => { clearTimeout(timeout); fail(); });
    worker.once('exit', code => { clearTimeout(timeout); if (code !== 0) fail(); });
  });
}
export function calendarFeeds(store, fetcher = fetch) {
  const { db, seal, open } = store;
  function connection(user) { const row = db.prepare('SELECT tokens FROM connections WHERE user_id=? AND service=?').get(user, service); return row ? open(row.tokens) : null; }
  function save(user, data) { db.prepare('INSERT INTO connections VALUES(?,?,?) ON CONFLICT(user_id,service) DO UPDATE SET tokens=excluded.tokens').run(user, service, seal(data)); }
  function status(user) { const data = connection(user); return data ? { connected: true, lastSync: data.lastSync || null, error: data.error || null, automatic: data.automatic !== false } : { connected: false }; }
  async function read(raw, settings, at = new Date()) {
    const url = privateGoogleFeedURL(raw), signal = AbortSignal.timeout(20000);
    let response, text;
    try {
      response = await fetcher(url, { redirect: 'error', signal, headers: { Accept: 'text/calendar' } });
      if (!response.ok || response.status >= 300 || Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error();
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error(); chunks.push(value); } }
      finally { await reader.cancel().catch(() => {}); }
      text = Buffer.concat(chunks).toString('utf8');
    } catch { throw new Error('Google’s private calendar feed could not be downloaded. Check the secret link or try again later. Previous events were kept.'); }
    const today = zonedNow(at, settings.timeZone).date;
    return { url, imports: await parseInWorker(text, settings.timeZone, addDays(today, -7), addDays(today, 91)) };
  }
  return { connection, save, status, read,
    disconnect(user) { db.prepare('DELETE FROM connections WHERE user_id=? AND service=?').run(user, service); },
    noteFailure(user) { const data = connection(user); if (data) save(user, { ...data, lastAttempt: new Date().toISOString(), error: 'Refresh failed. Previous events were kept. Check the link or try again.' }); }
  };
}
