import test from 'node:test';
import assert from 'node:assert/strict';
import { toImports } from './google-calendar.mjs';
import { createPlannerStore } from './planner-store.mjs';

test('Google events become read-only busy time in the planner', () => {
  const items = toImports([
    { calendarId: 'me@gmail.com', id: 'a1', title: 'Dentist', start: '2026-11-18T14:00:00Z', end: '2026-11-18T15:00:00Z' },
    { calendarId: 'me@gmail.com', id: 'b2', title: 'Trip', start: '2026-11-19T20:00:00Z', end: '2026-11-20T09:00:00Z' }
  ], 'Europe/Budapest');
  assert.deepEqual(items.map(i => [i.title, i.date, i.start, i.end]), [['Dentist', '2026-11-18', '15:00', '16:00'], ['Trip', '2026-11-19', '21:00', '24:00']]);
  const data = new Map(), model = createPlannerStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  model.saveSettings({ timeZone: 'Europe/Budapest', googleCalendars: ['me@gmail.com'] });
  model.setImports(items);
  const dentist = model.getDay('2026-11-18').commitments.find(c => c.title === 'Dentist');
  assert.ok(dentist?.sourceImport); assert.deepEqual([dentist.start, dentist.end], ['15:00', '16:00']);
  assert.ok(model.getDay('2026-11-20').commitments.some(c => c.title === 'Trip' && c.end === '10:00'));
});

test('Google events get reminders like your own events', async () => {
  const { upcomingReminders } = await import('./reminders.mjs');
  const data = new Map(), model = createPlannerStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  model.saveSettings({ timeZone: 'Europe/Budapest', reminderMinutes: 10 });
  model.setImports(toImports([{ calendarId: 'me@gmail.com', id: 'm1', title: 'Club meeting', start: '2026-11-18T16:30:00Z', end: '2026-11-18T18:00:00Z' }], 'Europe/Budapest'));
  const list = upcomingReminders(model, { date: '2026-11-18', minute: 600 });
  const club = list.find(r => r.title === 'Club meeting');
  assert.ok(club, 'Google event has a reminder'); assert.equal(club.start, '17:30'); assert.equal(club.lead, 10);
});
