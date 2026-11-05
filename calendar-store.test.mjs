import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarStore, capacity, CALENDAR_KEY, dateKey } from './calendar-store.mjs';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const date = '2026-11-05';
const school = { id: 'school', title: 'School', start: '08:00', end: '15:00' };

test('day settings and commitment edits persist independently of other dates', () => {
  const storage = memoryStorage();
  let store = createCalendarStore(storage);
  store.setHours(date, { start: '08:00', end: '16:00', color: 'sage' });
  store.saveCommitment(date, school);
  store.saveCommitment(date, { ...school, title: 'School and club', end: '15:30' });
  store = createCalendarStore(storage);
  assert.equal(store.getDay(date).color, 'sage');
  assert.equal(store.getDay(date).commitments[0].end, '15:30');
  assert.deepEqual(store.getDay('2026-11-06').commitments, []);
  store.removeCommitment(date, school.id);
  assert.deepEqual(createCalendarStore(storage).getDay(date).commitments, []);
});

test('overlaps are rejected, adjacent commitments are allowed, and rejected edits preserve data', () => {
  const store = createCalendarStore(memoryStorage());
  store.saveCommitment(date, school);
  assert.throws(() => store.saveCommitment(date, { id: 'sport', title: 'Sport', start: '14:30', end: '16:00' }), /overlaps/);
  store.saveCommitment(date, { id: 'sport', title: 'Sport', start: '15:00', end: '16:00' });
  assert.throws(() => store.saveCommitment(date, { ...school, end: '15:30' }), /overlaps/);
  assert.equal(store.getDay(date).commitments[0].end, '15:00');
});

test('capacity counts only time inside planning hours', () => {
  const day = { start: '14:00', end: '18:00', commitments: [school, { start: '19:00', end: '20:00' }] };
  assert.deepEqual(capacity(day), { booked: 60, total: 240, free: 180, ratio: .25 });
  assert.equal(capacity({ ...day, start: '08:00', end: '15:00', commitments: [school] }).ratio, 1);
});

test('invalid dates, hours, colours, and overnight commitments do not save', () => {
  const store = createCalendarStore(memoryStorage());
  assert.throws(() => store.getDay('2026-02-30'));
  for (const settings of [{ start: '20:00', end: '08:00', color: 'blue' }, { start: '08:00', end: '25:00', color: 'blue' }, { start: '08:00', end: '20:00', color: 'bad' }]) {
    assert.throws(() => store.setHours(date, settings));
  }
  assert.throws(() => store.saveCommitment(date, { ...school, start: '23:00', end: '01:00' }));
  assert.deepEqual(store.getDay(date).commitments, []);
});

test('corrupt calendar and write failures preserve the saved data', () => {
  const storage = memoryStorage();
  storage.setItem(CALENDAR_KEY, 'bad json');
  assert.throws(() => createCalendarStore(storage));
  assert.equal(storage.getItem(CALENDAR_KEY), 'bad json');
  storage.setItem(CALENDAR_KEY, '{}');
  const store = createCalendarStore(storage);
  store.saveCommitment(date, school);
  storage.setItem = () => { throw new Error('Storage full'); };
  assert.throws(() => store.removeCommitment(date, school.id));
  assert.equal(store.getDay(date).commitments.length, 1);
});

test('local date keys and leap-day validation do not use UTC day boundaries', () => {
  assert.equal(dateKey(new Date(2026, 10, 5, 0, 1)), date);
  const store = createCalendarStore(memoryStorage());
  assert.doesNotThrow(() => store.getDay('2028-02-29'));
  assert.throws(() => store.getDay('2026-02-29'));
});
