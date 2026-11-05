import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCommitments } from './dashboard-summary.mjs';

test('now and next use real event boundaries, including adjacent events', () => {
  const day = { commitments: [
    { title: 'Practice', start: '16:00', end: '17:00' },
    { title: 'School', start: '08:00', end: '15:00' },
    { title: 'Dinner', start: '17:00', end: '18:00' }
  ] };
  const before = summarizeCommitments(day, 7 * 60);
  assert.equal(before.current, undefined);
  assert.equal(before.next.title, 'School');
  assert.equal(summarizeCommitments(day, 8 * 60).current.title, 'School');
  const between = summarizeCommitments(day, 15 * 60);
  assert.equal(between.current, undefined);
  assert.equal(between.next.title, 'Practice');
  assert.equal(summarizeCommitments(day, 17 * 60).current.title, 'Dinner');
  assert.deepEqual(summarizeCommitments(day, 20 * 60), { current: undefined, next: undefined });
});
