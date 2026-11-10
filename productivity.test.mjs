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
