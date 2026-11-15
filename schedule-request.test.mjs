import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleRequest, scheduleInputs, describeSchedule } from './schedule-request.mjs';
import { createPlannerStore } from './planner-store.mjs';

const settings = { timeZone: 'UTC' };
const at = new Date('2026-11-15T10:00:00Z'); // a Sunday
const parse = text => parseScheduleRequest(text, settings, at);

test('school every weekday until a date, with no am/pm', () => {
  const plan = parse('I have school every weekday from 8 to 2 until June 20');
  assert.equal(plan.title, 'School'); assert.equal(plan.category, 'Study');
  assert.deepEqual([plan.start, plan.end], ['08:00', '14:00']);
  assert.deepEqual(plan.days, [1, 2, 3, 4, 5]);
  assert.equal(plan.from, '2026-11-15'); assert.equal(plan.until, '2027-06-20');
  assert.ok(plan.dates.every(d => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())));
  assert.equal(describeSchedule(plan).dayText, 'Every weekday (Mon–Fri)');
});

test('specific days, pm range and a number of weeks', () => {
  const plan = parse('football on tuesdays and thursdays 5-7pm for 10 weeks');
  assert.equal(plan.title, 'Football'); assert.equal(plan.category, 'Exercise');
  assert.deepEqual(plan.days, [2, 4]); assert.deepEqual([plan.start, plan.end], ['17:00', '19:00']);
  assert.equal(plan.dates.length, 20);
});

test('24-hour times, mon-fri and numeric European dates', () => {
  const plan = parse('school mon-fri 08:00-14:30 till 20/6/2027');
  assert.deepEqual(plan.days, [1, 2, 3, 4, 5]); assert.deepEqual([plan.start, plan.end], ['08:00', '14:30']); assert.equal(plan.until, '2027-06-20');
});

test('every day until end of a month', () => {
  const plan = parse('Read every day at 9pm for 30 minutes until end of december');
  assert.equal(plan.title, 'Read'); assert.equal(plan.days.length, 7);
  assert.deepEqual([plan.start, plan.end], ['21:00', '21:30']); assert.equal(plan.until, '2026-12-31');
});

test('one-off event tomorrow', () => {
  const plan = parse('dentist tomorrow at 3pm for 1 hour');
  assert.equal(plan.recurring, false); assert.equal(plan.from, '2026-11-16');
  assert.deepEqual([plan.start, plan.end], ['15:00', '16:00']); assert.equal(plan.category, 'Appointments');
});

test('starting date and a single weekday that repeats', () => {
  const plan = parse('piano lessons every saturday 10am-11am starting December 5 until March');
  assert.equal(plan.title, 'Piano lessons'); assert.deepEqual(plan.days, [6]);
  assert.equal(plan.from, '2026-12-05'); assert.equal(plan.until, '2027-03-31');
});

test('asks instead of guessing', () => {
  assert.match(parse('school every weekday from 8 to 2').clarification, /Until when/);
  assert.match(parse('school every weekday until june').clarification, /What time/);
  assert.match(parse('gym every monday 6-7pm starting 2026-01-01 until june').clarification, /passed/);
});

test('long repeats are capped at one year', () => {
  const plan = parse('work every weekday 9-17 until 2028-01-01');
  assert.equal(plan.capped, true); assert.equal(plan.until, '2027-11-15');
});

test('saving creates every occurrence as a single undoable change', () => {
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const model = createPlannerStore(storage);
  const plan = parse('school every weekday from 8 to 2 until December 4');
  let n = 0; model.saveActivities(scheduleInputs(plan, () => `id-${n++}`));
  const saved = Object.entries(model.snapshot().days).flatMap(([date, day]) => day.commitments.map(c => ({ date, ...c })));
  assert.equal(saved.length, plan.dates.length); assert.equal(saved.length, 15);
  assert.ok(saved.every(c => c.title === 'School' && c.start === '08:00' && c.end === '14:00'));
  model.undo();
  assert.equal(Object.values(model.snapshot().days).flatMap(day => day.commitments).length, 0);
});
