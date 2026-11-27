import test from 'node:test';
import assert from 'node:assert/strict';
import { activityVisual } from './activity-visuals.mjs';
test('specific sports keep their visual identity independently of broader category', () => {
  assert.equal(activityVisual({ title: 'Football practice', category: 'Study' }).kind, 'football');
  assert.equal(activityVisual({ title: 'Volleyball', category: 'Exercise' }).kind, 'volleyball');
  assert.equal(activityVisual({ title: 'Futboll' }).kind, 'football');
  assert.equal(activityVisual({ title: 'School', category: 'Study' }).kind, 'school');
  assert.equal(activityVisual({ title: 'Maths revision' }).kind, 'study');
  assert.equal(activityVisual({ title: 'Tea break', kind: 'break' }).kind, 'rest');
});
test('tests and exams look the same however they were added', () => {
  for (const title of ['History test', 'Maths test', 'Biology exam', 'English quiz', 'Physics midterm', 'Test: chapter 4', 'Testi i matematikës'])
    assert.equal(activityVisual({ title, category: 'Personal projects' }).kind, 'test', title);
  assert.notEqual(activityVisual({ title: 'Latest news' }).kind, 'test');
});
