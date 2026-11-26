import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryModel } from './server/plans.mjs';

const event = { id: 'school', kind: 'fixed', title: 'School', category: 'Study', priority: 'Medium', date: '2026-12-07', start: '08:00', end: '14:00', notes: '', reminder: 'default', completed: false, locked: false, repeat: 'daily', repeatUntil: '2026-12-09' };
const commitments = (model, date) => model.getDay(date).commitments.filter(item => item.title === 'School');

test('quick colour changes one occurrence or every repeat, keeping the series linked', () => {
  const model = memoryModel(); model.saveActivity(event);
  const first = commitments(model, '2026-12-07')[0];
  model.setColor('fixed', first.id, 'tomato', false);
  assert.deepEqual(['2026-12-07', '2026-12-08', '2026-12-09'].map(d => commitments(model, d)[0].color), ['tomato', undefined, undefined]);
  assert.ok(commitments(model, '2026-12-07')[0].seriesId, 'still part of the series');
  model.setColor('fixed', first.id, 'basil', true);
  assert.deepEqual(['2026-12-07', '2026-12-08', '2026-12-09'].map(d => commitments(model, d)[0].color), ['basil', 'basil', 'basil']);
  model.setColor('fixed', first.id, '', true);
  assert.equal(commitments(model, '2026-12-08')[0].color, undefined);
});

test('quick colour works for deadlines and scheduled task blocks', () => {
  const model = memoryModel();
  model.saveActivity({ id: 't1', kind: 'task', title: 'Maths test', date: '', deadline: '2026-12-03', duration: 30, spent: 0, completed: false, locked: false, category: 'Study', priority: 'Medium', repeat: 'none', repeatUntil: '', reminder: 'default', notes: '' });
  model.setColor('task', 't1', 'grape');
  assert.equal(model.getTasks()[0].color, 'grape');
  assert.throws(() => model.setColor('task', 't1', 'not a colour!'), /valid colour/);
});
