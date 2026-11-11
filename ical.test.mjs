import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from './server/app.mjs';
import { privateGoogleFeedURL } from './server/ical.mjs';
import { parseCalendarFeed } from './server/ical-parser.mjs';
import { zonedNow } from './clock.mjs';
import { addDays } from './calendar-view.mjs';

const secretURL = 'https://calendar.google.com/calendar/ical/test%40example.com/private-abcdef123456/basic.ics';
const calendar = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Day Compass test//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
const event = (title, date) => calendar(`BEGIN:VEVENT\r\nUID:test-one\r\nSUMMARY:${title}\r\nDTSTART:${date.replaceAll('-', '')}T120000Z\r\nDTEND:${date.replaceAll('-', '')}T130000Z\r\nEND:VEVENT`);

test('private feed validates a Google-only HTTPS address and rejects public feeds, queries and other destinations', () => {
  assert.equal(privateGoogleFeedURL(secretURL), secretURL);
  for (const url of ['http://127.0.0.1/private', secretURL.replace('https:', 'http:'), secretURL.replace('calendar.google.com', 'calendar.google.com.evil.test'), secretURL.replace('private-abcdef123456', 'public'), `${secretURL}?redirect=other`, secretURL.replace('calendar.google.com', 'user:pass@calendar.google.com'), `${secretURL}#secret`]) assert.throws(() => privateGoogleFeedURL(url));
});

test('feed parser keeps recurrence, DST, exclusions, overrides, all-day dates and cancellations', () => {
  const text = calendar(`BEGIN:VEVENT
UID:school
SUMMARY:School
DTSTART;TZID=Europe/Budapest:20270321T090000
DTEND;TZID=Europe/Budapest:20270321T100000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Budapest:20270328T090000
END:VEVENT
BEGIN:VEVENT
UID:school
RECURRENCE-ID;TZID=Europe/Budapest:20270404T090000
SUMMARY:Later school
DTSTART;TZID=Europe/Budapest:20270404T110000
DTEND;TZID=Europe/Budapest:20270404T120000
END:VEVENT
BEGIN:VEVENT
UID:school
RECURRENCE-ID;TZID=Europe/Budapest:20270411T090000
STATUS:CANCELLED
DTSTART;TZID=Europe/Budapest:20270411T090000
DTEND;TZID=Europe/Budapest:20270411T100000
END:VEVENT
BEGIN:VEVENT
UID:all-day
SUMMARY:Holiday
DTSTART;VALUE=DATE:20270328
DTEND;VALUE=DATE:20270330
END:VEVENT
BEGIN:VEVENT
UID:free-event
SUMMARY:Free
DTSTART:20270322T090000Z
DTEND:20270322T100000Z
TRANSP:TRANSPARENT
END:VEVENT`);
  const imports = parseCalendarFeed(text, 'Europe/Budapest', '2027-03-20', '2027-04-20');
  assert.equal(imports.filter(e => e.title === 'School').length, 1);
  assert.equal(imports.find(e => e.title === 'School').start, '09:00');
  assert.equal(imports.find(e => e.title === 'Later school').start, '11:00');
  assert.deepEqual(imports.filter(e => e.title === 'Holiday').map(e => [e.date, e.start, e.end]), [['2027-03-28', '00:00', '24:00'], ['2027-03-29', '00:00', '24:00']]);
  assert.equal(imports.some(e => e.title === 'Free'), false);
  assert.equal(imports.every(e => e.importProvider === 'ical'), true);
});

test('authenticated feed refresh encrypts secrets, isolates accounts, preserves failures and removes only feed imports', async t => {
  const today = zonedNow().date, future = addDays(today, 1);
  let text = event('Imported school', future), fail = false, requests = 0;
  const origin = 'http://127.0.0.1:9999';
  const app = createApplication({ database: ':memory:', worker: false, config: { APP_ORIGIN: origin }, fetcher: async (url, options) => {
    requests++; assert.equal(url, secretURL); assert.equal(options.redirect, 'error');
    if (fail) throw new Error(`A simulated error must never expose ${secretURL}`);
    return new Response(text, { headers: { 'Content-Type': 'text/calendar' } });
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.close(); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function call(route, method = 'GET', data, cookie = '') {
    const response = await fetch(`${base}/api/${route}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    return { response, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const alice = (await call('register', 'POST', { name: 'feedalice', password: 'test-password-long' })).cookie;
  const bob = (await call('register', 'POST', { name: 'feedbob', password: 'test-password-long' })).cookie;
  assert.equal((await call('ical/status')).response.status, 401);
  const connected = await call('ical/sync', 'POST', { url: secretURL }, alice);
  assert.equal(connected.response.status, 200); assert.equal(connected.data.state.imports[0].title, 'Imported school');
  assert.equal(JSON.stringify(connected.data).includes(secretURL), false);
  assert.equal(app.db.prepare('SELECT tokens FROM connections WHERE service=?').get('ical').tokens.includes('private-abcdef'), false);
  const owner = app.db.prepare('SELECT id FROM users WHERE name=?').get('feedalice').id;
  const existing = app.readDocument(owner);
  existing.state.imports.push({ id: 'oauth-event', title: 'Other import', date: future, start: '17:00', end: '18:00', sourceImport: true });
  app.saveDocument(owner, existing.state, existing.version);
  assert.deepEqual((await call('ical/status', 'GET', null, bob)).data, { connected: false });
  assert.equal((await call('planner', 'GET', null, bob)).data.state.imports?.length || 0, 0);
  // Advance the cooldown clock for each request without sleeping.
  const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
  t.after(() => { Date.now = realNow; });
  fail = true; clock += 6000;
  const failed = await call('ical/sync', 'POST', {}, alice);
  assert.match(failed.data.error, /Previous events were kept/); assert.equal(JSON.stringify(failed.data).includes(secretURL), false);
  assert.equal((await call('planner', 'GET', null, alice)).data.state.imports.length, 2);
  fail = false; text = calendar(''); clock += 6000;
  assert.equal((await call('ical/sync', 'POST', {}, alice)).data.state.imports.length, 1);
  text = event('Updated school', future); clock += 6000;
  assert.equal((await call('ical/sync', 'POST', {}, alice)).data.state.imports.find(e => e.importProvider === 'ical').title, 'Updated school');
  const status = (await call('ical/status', 'GET', null, alice)).data; assert.equal(status.connected, true); assert.equal(JSON.stringify(status).includes('private-abcdef'), false);
  await call('ical/disconnect', 'POST', {}, bob); assert.equal((await call('ical/status', 'GET', null, alice)).data.connected, true);
  const disconnected = (await call('ical/disconnect', 'POST', {}, alice)).data;
  assert.equal(disconnected.state.imports.length, 1); assert.equal(disconnected.state.imports[0].title, 'Other import');
  assert.equal(app.db.prepare('SELECT count(*) n FROM connections WHERE service=?').get('ical').n, 0); assert.ok(requests >= 4);
});
