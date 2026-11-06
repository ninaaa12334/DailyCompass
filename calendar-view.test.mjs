import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDates, monthDates, addDays, eventPosition, timeLabel } from './calendar-view.mjs';

test('weeks start Monday and cross month/year boundaries correctly', () => {
  assert.deepEqual(weekDates('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  assert.equal(weekDates('2026-11-08')[0], '2026-11-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
});

test('month calendar has six complete weeks with each actual date once', () => {
  const dates = monthDates('2026-11-06');
  assert.equal(dates.length, 42);
  assert.equal(new Set(dates).size, 42);
  assert.equal(new Date(`${dates[0]}T12:00:00`).getDay(), 1);
  assert.equal(dates.filter(date => date.startsWith('2026-11')).length, 30);
});

test('event placement preserves actual start minutes and short event durations', () => {
  assert.deepEqual(eventPosition({ start: '09:30', end: '10:45' }), { top: 570, height: 75 });
  assert.deepEqual(eventPosition({ start: '00:00', end: '00:05' }), { top: 0, height: 5 });
  assert.equal(timeLabel(1439), '23:59');
});
