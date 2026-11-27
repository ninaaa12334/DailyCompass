import test from 'node:test';
import assert from 'node:assert/strict';
import { taskProductivity } from './productivity.mjs';

const state = {
  tasks: [
    { id: 'a', date: '2026-11-08', deadline: '2026-11-08', completed: true },
    { id: 'b', date: '2026-11-02', deadline: '', completed: false },
    { id: 'c', date: '2026-11-20', deadline: '', completed: true },
    { id: 'd', date: '2026-10-31', deadline: '', completed: true },
    { id: 'undated', date: '', deadline: '', completed: true }
  ],
  plans: { '2026-11-08': [{ kind: 'task', taskId: 'a' }, { kind: 'break', taskId: 'undated' }] }
};
test('day/week/month productivity counts unique task membership and completed tasks', () => {
  assert.deepEqual(taskProductivity(state, '2026-11-08'), { start: '2026-11-08', end: '2026-11-08', total: 2, done: 1, percent: 50 });
  assert.equal(taskProductivity(state, '2026-11-08', 'week').percent, 50);
  const month = taskProductivity(state, '2026-11-08', 'month'); assert.equal(month.total, 3); assert.equal(month.done, 2); assert.equal(month.percent, 67);
});
test('empty periods stay at zero and week/month boundaries include leap days', () => {
  assert.equal(taskProductivity(state, '2027-01-01').percent, 0);
  assert.equal(taskProductivity(state, '2024-02-15', 'month').end, '2024-02-29');
  assert.equal(taskProductivity(state, '2027-01-01', 'week').start, '2026-12-28');
});
test('scheduling includes otherwise undated tasks once and completion updates recalculate', () => {
  const copy = structuredClone(state); copy.plans['2026-11-08'].push({ kind: 'task', taskId: 'undated' });
  assert.equal(taskProductivity(copy, '2026-11-08').total, 3);
  copy.tasks[0].completed = false; assert.equal(taskProductivity(copy, '2026-11-08').percent, 33);
});

test('school alone earns no completion; overdue, undated and missed planned tasks stay unfinished', () => {
  const copy = { tasks: [], plans: {}, days: { '2026-11-08': { commitments: [{ title: 'School', completed: true }] } } };
  assert.equal(taskProductivity(copy, '2026-11-08').percent, 0);
  copy.tasks = [{ id: 'done', date: '2026-11-08', completed: true }, { id: 'backlog', completed: false }, { id: 'late', deadline: '2026-11-01', completed: false }, { id: 'missed', completed: false }];
  copy.plans['2026-11-07'] = [{ kind: 'task', taskId: 'missed', completed: true }];
  assert.equal(taskProductivity(copy, '2026-11-08').percent, 25);
  copy.tasks.forEach(t => t.completed = true);
  assert.equal(taskProductivity(copy, '2026-11-08').percent, 100);
});

test('rounding cannot hide unfinished work or credit future work to today', () => {
  const copy = { tasks: Array.from({ length: 201 }, (_, i) => ({ id: String(i), date: '2026-11-08', completed: i !== 0 })), plans: {} };
  assert.equal(taskProductivity(copy, '2026-11-08').percent, 99);
  assert.equal(taskProductivity({ tasks: [{ id: 'future', completed: false }], plans: { '2026-11-20': [{ kind: 'task', taskId: 'future' }] } }, '2026-11-08').total, 0);
});

import { busyProductivity } from './productivity.mjs';
import { createPlannerStore } from './planner-store.mjs';
import { parseScheduleRequest, scheduleInputs } from './schedule-request.mjs';
test('productivity grows with finished things, not with plans or reminders', () => {
  const data = new Map(), model = createPlannerStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  model.saveSettings({ timeZone: 'UTC', planningStart: '08:00', planningEnd: '20:00' });
  let n = 0; model.saveActivities(scheduleInputs(parseScheduleRequest('school on wednesday from 8 to 20', { timeZone: 'UTC' }, new Date('2026-11-16T07:00:00Z')), () => `e${n++}`));
  model.saveActivities([{ kind: 'fixed', id: 'r1', title: 'Call mom', category: 'Personal projects', priority: 'Medium', date: '2026-11-19', start: '10:00', end: '10:05', notes: '', repeat: 'none', repeatUntil: '', reminder: 0, completed: false, locked: false, isReminder: true }]);
  const settings = model.getSettings(), after = { now: { date: '2026-11-25', minute: 600 } }, before = { now: { date: '2026-11-17', minute: 600 } };
  assert.equal(busyProductivity(model.getDay, settings, '2026-11-18', 'day', after).percent, 100, 'a full day that has happened');
  assert.equal(busyProductivity(model.getDay, settings, '2026-11-18', 'day', before).percent, 0, 'plans still ahead do not count');
  assert.equal(busyProductivity(model.getDay, settings, '2026-11-19', 'day', after).percent, 0, 'reminders do not count');
  const week = busyProductivity(model.getDay, settings, '2026-11-18', 'week', after).percent;
  assert.ok(week > 0 && week < 25, `one busy day in a week scores low: ${week}`);
  const tasks = [{ id: 't1', completed: true, date: '2026-11-20', duration: 360 }, { id: 't2', completed: false, date: '2026-11-20', duration: 360 }];
  assert.equal(busyProductivity(model.getDay, settings, '2026-11-20', 'day', { ...after, tasks }).percent, 50, 'finished tasks count, unfinished ones do not');
});

test('tests added as all-day items count once they are over or ticked off', () => {
  const data = new Map(), model = createPlannerStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  model.saveSettings({ timeZone: 'UTC', planningStart: '08:00', planningEnd: '20:00' });
  model.addAllDay([{ id: 'a1', date: '2026-11-20', title: 'History test' }, { id: 'a2', date: '2026-11-25', title: 'Maths test' }]);
  const settings = model.getSettings(), now = { date: '2026-11-25', minute: 600 };
  const score = date => busyProductivity(model.getDay, settings, date, 'day', { now, allDay: model.getAllDay() });
  assert.ok(score('2026-11-20').percent > 0, 'a test whose day has passed counts');
  assert.equal(score('2026-11-25').percent, 0, 'today’s test counts only once ticked off');
  model.toggleAllDay('a2');
  assert.equal(model.getAllDay('2026-11-25')[0].done, true);
  assert.ok(score('2026-11-25').percent > 0, 'ticked off today');
  model.toggleAllDay('a2');
  assert.equal(model.getAllDay('2026-11-25')[0].done, undefined);
});
