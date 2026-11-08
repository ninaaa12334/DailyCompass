import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerStore, PLANNER_KEY, DEFAULT_SETTINGS } from './planner-store.mjs';
import { generatePlan, planningCapacity } from './scheduler.mjs';
import { zonedNow } from './clock.mjs';
import { upcomingReminders, isQuiet } from './reminders.mjs';
const date = '2026-11-08';
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const task = (id, extra = {}) => ({ id, kind: 'task', title: id, date, deadline: date, duration: 60, spent: 0, priority: 'High', category: 'Study', notes: '', repeat: 'none', repeatUntil: '', reminder: 'default', locked: false, completed: false, ...extra });
const event = (id, start, end, extra = {}) => ({ ...task(id), kind: 'fixed', start, end, ...extra });

test('legacy data stays intact, gains safe defaults, and persists to a separate versioned key', () => {
  const storage = memory();
  const legacy = JSON.stringify([{ id: 'old', title: 'Old task', duration: 20 }]);
  storage.setItem('day-compass.tasks.v1', legacy);
  const model = createPlannerStore(storage);
  assert.equal(model.getTasks()[0].spent, 0);
  model.saveActivity(task('new'));
  assert.equal(storage.getItem('day-compass.tasks.v1'), legacy);
  assert.equal(createPlannerStore(storage).getTasks().length, 2);
  model.undo(); assert.equal(model.getTasks().length, 1);
  storage.setItem(PLANNER_KEY, 'broken json');
  assert.throws(() => createPlannerStore(storage));
  assert.equal(storage.getItem(PLANNER_KEY), 'broken json');
});

test('series edits, one-occurrence exceptions, conflicts, completion, deletion, and undo are atomic', () => {
  const storage = memory(), model = createPlannerStore(storage);
  model.saveActivity(event('series', '10:00', '11:00', { repeat: 'weekly', repeatUntil: '2026-11-22' }));
  assert.equal(Object.values(model.snapshot().days).flatMap(day => day.commitments).length, 3);
  const first = model.getDay(date).commitments[0];
  model.saveActivity({ ...first, title: 'Renamed' }, { kind: 'fixed', id: first.id, date }, 'series');
  assert.ok(Object.values(model.snapshot().days).every(day => day.commitments[0].title === 'Renamed'));
  model.saveActivity({ ...model.getDay(date).commitments[0], title: 'Exception' }, { kind: 'fixed', id: first.id, date }, 'one');
  assert.equal(model.getDay('2026-11-15').commitments[0].title, 'Renamed');
  const before = storage.getItem(PLANNER_KEY);
  assert.throws(() => model.saveActivity(event('conflict', '10:30', '11:30')), /overlap/);
  assert.equal(storage.getItem(PLANNER_KEY), before);
  model.toggle('fixed', first.id, date); assert.equal(model.getDay(date).commitments[0].completed, true);
  model.remove('fixed', first.id, date); assert.equal(model.getDay(date).commitments.length, 0);
  model.undo(); assert.equal(model.getDay(date).commitments[0].completed, true);
});

test('scheduler respects now, fixed events, sleep, remaining duration, breaks, priorities, and full days', () => {
  const settings = { ...DEFAULT_SETTINGS }, day = { start: '08:00', end: '20:00', commitments: [event('School', '10:00', '12:00')] };
  const args = { date, day, tasks: [task('Low', { priority: 'Low', duration: 30 }), task('High', { duration: 120, spent: 30 })], settings, now: { date, minute: 9 * 60 } };
  const plan = generatePlan(args);
  assert.equal(plan.entries.find(item => item.taskId === 'High' && item.kind === 'task').start, '12:00');
  assert.equal(plan.entries.find(item => item.taskId === 'High' && item.kind === 'task').end, '13:30');
  assert.equal(plan.entries[0].start, '09:00'); // The smaller low-priority task can use an earlier gap.
  assert.ok(plan.entries.some(item => item.kind === 'break'));
  const full = generatePlan({ ...args, day: { ...day, commitments: [event('All day', '08:00', '20:00')] } });
  assert.equal(full.entries.length, 0); assert.equal(full.unscheduled.length, 2);
  const past = generatePlan({ ...args, date: '2026-11-07' });
  assert.ok(past.unscheduled.every(item => item.reason.includes('past')));
  const sleepy = generatePlan({ ...args, settings: { ...settings, sleepStart: '12:00', sleepEnd: '14:00' } });
  assert.ok(sleepy.entries.filter(item => item.kind === 'task').every(item => item.end <= '12:00' || item.start >= '14:00'));
});

test('locked/completed placements survive replan, previews reject stale revisions, and undo restores schedules', () => {
  const model = createPlannerStore(memory()); model.saveActivity(task('A'));
  let state = model.snapshot();
  let preview = generatePlan({ date, day: model.getDay(date), tasks: model.getTasks(), settings: state.settings, now: { date, minute: 540 } });
  model.applyPlan(date, preview, state.revision);
  const placed = model.snapshot().plans[date].find(item => item.kind === 'task');
  model.lock(date, placed.id);
  state = model.snapshot();
  preview = generatePlan({ date, day: { ...model.getDay(date), commitments: [] }, tasks: model.getTasks(), existing: state.plans[date], settings: state.settings, now: { date, minute: 540 } });
  assert.equal(preview.entries.find(item => item.id === placed.id).locked, true);
  model.saveActivity(task('B'));
  assert.throws(() => model.applyPlan(date, preview, state.revision), /changed/);
  model.undo(); assert.equal(model.getTasks().length, 1);
  model.toggle('task', 'A');
  state = model.snapshot();
  const completed = generatePlan({ date, day: { ...model.getDay(date), commitments: [] }, tasks: model.getTasks(), existing: state.plans[date], settings: state.settings, now: { date, minute: 540 } });
  assert.ok(completed.entries.some(item => item.taskId === 'A' && item.completed));
});

test('capacity merges overlap and excludes sleep without double-counting', () => {
  const result = planningCapacity({ start: '06:00', end: '10:00', commitments: [event('A', '08:00', '09:00'), event('B', '08:30', '09:30')] }, DEFAULT_SETTINGS);
  assert.equal(result.booked, 90); assert.equal(result.blockedSleep, 60); assert.equal(result.free, 90);
});

test('timezone boundaries, reminder rescheduling, completion cancellation, quiet hours, and deduplication', () => {
  assert.deepEqual(zonedNow(new Date('2026-12-31T23:30:00Z'), 'Europe/Budapest'), { date: '2027-01-01', minute: 30 });
  const model = createPlannerStore(memory()); model.saveActivity(event('Meeting', '10:00', '11:00'));
  const clock = { date, minute: 9 * 60 };
  const first = upcomingReminders(model, clock)[0];
  assert.equal(model.claimReminder(first.key), true); assert.equal(model.claimReminder(first.key), false);
  model.saveActivity(event('Meeting', '11:00', '12:00'), { kind: 'fixed', id: 'Meeting', date });
  const moved = upcomingReminders(model, clock)[0]; assert.notEqual(moved.key, first.key);
  model.toggle('fixed', 'Meeting', date); assert.equal(upcomingReminders(model, clock).length, 0);
  assert.equal(isQuiet(23 * 60, DEFAULT_SETTINGS), true); assert.equal(isQuiet(12 * 60, DEFAULT_SETTINGS), false);
});

test('a failed storage write never changes the model', () => {
  const storage = memory(), model = createPlannerStore(storage);
  model.saveActivity(task('A'));
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => model.remove('task', 'A', date)); assert.equal(model.getTasks().length, 1);
});

test('replanning keeps the break after locked work', () => {
  const existing = [
    { id: 'locked', kind: 'task', taskId: 'A', title: 'A', start: '09:00', end: '10:00', completed: false, locked: true },
    { id: 'rest', kind: 'break', taskId: 'A', title: 'Break', start: '10:00', end: '10:05', completed: false, locked: false }
  ];
  const plan = generatePlan({ date, day: { start: '08:00', end: '20:00', commitments: [] }, tasks: [task('A'), task('B')], existing, settings: DEFAULT_SETTINGS, now: { date, minute: 540 } });
  assert.ok(plan.entries.some(item => item.id === 'rest'));
  assert.equal(plan.entries.find(item => item.kind === 'task' && item.taskId === 'B').start, '10:05');
});
