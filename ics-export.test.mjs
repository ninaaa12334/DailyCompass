import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarFile } from './ics-export.mjs';
import { createPlannerStore } from './planner-store.mjs';
import { parseScheduleRequest, scheduleInputs } from './schedule-request.mjs';

function plannerWith(...requests) {
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const model = createPlannerStore(storage);
  model.saveSettings({ timeZone: 'Europe/Budapest', reminderMinutes: 10 });
  let n = 0;
  for (const text of requests) model.saveActivities(scheduleInputs(parseScheduleRequest(text, { timeZone: 'Europe/Budapest' }, new Date('2026-11-15T10:00:00Z')), () => `ev-${n++}`));
  return model.snapshot();
}

test('exports upcoming events with UTC times and reminder alarms', () => {
  const state = plannerWith('dentist tomorrow at 3pm for 1 hour', 'school every weekday from 8 to 2 until November 20');
  const { text, count } = buildCalendarFile(state, { fromDate: '2026-11-15', now: Date.UTC(2026, 10, 15) });
  assert.equal(count, 6); // dentist + Mon–Fri school
  assert.match(text, /^BEGIN:VCALENDAR\r\n/); assert.match(text, /END:VCALENDAR\r\n$/);
  // 15:00 in Budapest (UTC+1 in November) is 14:00 UTC.
  assert.match(text, /SUMMARY:Dentist\r\n/); assert.match(text, /DTSTART:20261116T140000Z/);
  assert.equal((text.match(/BEGIN:VALARM/g) || []).length, 6);
  assert.match(text, /TRIGGER:-PT10M/);
  assert.ok(text.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));
});

test('skips past events and respects reminders turned off', () => {
  const state = plannerWith('gym tomorrow at 6pm for 1 hour');
  const day = Object.values(state.days)[0]; day.commitments[0].reminder = 'off';
  const { text } = buildCalendarFile(state, { fromDate: '2026-11-15' });
  assert.doesNotMatch(text, /VALARM/);
  assert.equal(buildCalendarFile(state, { fromDate: '2026-12-01' }).count, 0);
});

test('special characters are escaped', () => {
  const state = plannerWith('revision tomorrow at 5pm for 1 hour');
  Object.values(state.days)[0].commitments[0].title = 'Maths, physics; revision';
  assert.match(buildCalendarFile(state, { fromDate: '2026-11-15' }).text, /SUMMARY:Maths\\, physics\\; revision/);
});
