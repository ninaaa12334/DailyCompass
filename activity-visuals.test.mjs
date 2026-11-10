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
